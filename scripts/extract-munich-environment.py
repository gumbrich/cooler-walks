"""Actual Bavarian tree points and LoD2 ground/height geometry, in EPSG:25832.

Never use the absolute elevation as a height. Preserve source courtyard holes,
separate building parts, and the source's outline/creation dates in the manifest.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sqlite3
import xml.etree.ElementTree as ET
from shapely import from_wkb, make_valid
from shapely.geometry import Polygon
from shapely.ops import unary_union

raw = Path('data/raw')
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('tiles', 'scripts/fetch-munich-buildings.py')
tiles = module_from_spec(spec)
spec.loader.exec_module(tiles)
tile_hashes = {}
index = ET.parse(raw / 'munich-buildings.meta4').getroot()

ns = {'b': 'http://www.opengis.net/citygml/building/1.0',
      'g': 'http://www.opengis.net/gml', 'c': 'http://www.opengis.net/citygml/1.0',
      'gen': 'http://www.opengis.net/citygml/generics/1.0'}
buildings, dates, created, methods = [], Counter(), Counter(), Counter()
height_differences, accepted_differences, excluded = [], [], []
def points(pos):
    values = list(map(float, pos.text.split()))
    if len(values) % 3: raise ValueError('Expected metre XYZ coordinates')
    return [values[i:i+3] for i in range(0, len(values), 3)]
for tile in tiles.TILES:
    gml = raw / f'munich-{tile}.gml'
    expected = index.find(f"{{*}}file[@name='{tile}.gml']").find('{*}hash').text
    if hashlib.sha256(gml.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Tile {tile} does not match its published SHA-256')
    tile_hashes[tile] = expected
    for _, element in ET.iterparse(gml, events=('end',)):
        if element.tag != '{' + ns['b'] + '}Building': continue
        parts = [element] + element.findall('.//b:BuildingPart', ns)
        for part in parts:
            surfaces = part.findall('./b:boundedBy/b:GroundSurface//g:Polygon', ns)
            if not surfaces:
                if part is element and len(parts) > 1: continue
                raise ValueError('A source object has no supported ground footprint')
            polygons, ground_z = [], []
            for surface in surfaces:
                shell = points(surface.find('./g:exterior//g:posList', ns))
                holes = [points(pos) for pos in surface.findall('./g:interior//g:posList', ns)]
                ground_z.extend(p[2] for p in shell)
                polygons.append(make_valid(Polygon([p[:2] for p in shell], [[p[:2] for p in ring] for ring in holes])))
            # Height from actual source geometry, independently checked against measuredHeight below.
            geometry_z = [p[2] for pos in part.findall('./b:boundedBy//g:posList', ns) for p in points(pos)]
            height, ground = max(geometry_z) - min(ground_z), min(ground_z)
            if not 0 < height <= 150: raise ValueError(f'Unsupported building height: {height}')
            # Non-building/elevated structures do not fit a ground extrusion.
            function = part.findtext('./b:function', default=element.findtext('./b:function', default='', namespaces=ns), namespaces=ns)
            uncertain = function.startswith('53001_')
            measured = part.find('./b:measuredHeight', ns)
            if measured is not None:
                if measured.attrib.get('uom') != 'urn:adv:uom:m': raise ValueError('Unexpected height units')
                height_differences.append(abs(height-float(measured.text)))
                uncertain |= height_differences[-1] > 0.05
                if not uncertain: accepted_differences.append(height_differences[-1])
            if uncertain:
                excluded.append({'id': part.attrib['{'+ns['g']+'}id'], 'tile': tile,
                    'function': function, 'geometryHeight': round(height, 3),
                    'sourceHeight': float(measured.text) if measured is not None else None,
                    'reason': 'Non-building structure or source height disagreement; potential shadow remains unknown'})
            merged = unary_union(polygons).simplify(0.1, preserve_topology=True)
            geoms = [merged] if merged.geom_type == 'Polygon' else list(merged.geoms)
            for i, polygon in enumerate(geoms):
                if polygon.geom_type != 'Polygon': raise ValueError('Unexpected ground geometry')
                buildings.append({'id': part.attrib['{'+ns['g']+'}id']+f':{i}',
                    'ring': list(polygon.exterior.coords), 'holes': [list(r.coords) for r in polygon.interiors],
                    'height': round(height, 3), 'ground': round(ground, 3), **({'uncertain': True} if uncertain else {})})
        for attr in element.findall('./gen:stringAttribute', ns):
            if attr.attrib.get('name') == 'Grundrissaktualitaet': dates[attr.find('gen:value', ns).text] += 1
            if attr.attrib.get('name') == 'Methode': methods[attr.find('gen:value', ns).text] += 1
        for creation in element.findall('.//c:creationDate', ns): created[creation.text] += 1
        element.clear()
print('Building geometry:', len(buildings), 'parts; measured-height comparisons:', len(height_differences),
      'maximum difference:', max(height_differences), flush=True)
assert max(accepted_differences) <= 0.05
print('Conservatively masked', len(excluded), 'unsupported or conflicting objects', flush=True)

connection = sqlite3.connect('file:data/raw/munich-trees.gpkg?mode=ro', uri=True)
layers = connection.execute("""SELECT g.table_name, g.column_name, g.srs_id
    FROM gpkg_geometry_columns g JOIN gpkg_contents c ON c.table_name=g.table_name
    WHERE c.max_x>=689800 AND c.min_x<=694200 AND c.max_y>=5333800 AND c.min_y<=5338200""").fetchall()
trees = []
for table, geom_column, srs in layers:
    if srs != 25832: raise ValueError('Unexpected tree coordinate system')
    schema = list(connection.execute(f'PRAGMA table_info("{table}")'))
    columns = [r[1] for r in schema]
    primary_key = next(r[1] for r in schema if r[5])
    print('Tree schema:', table, columns)
    rtree = f'rtree_{table}_{geom_column}'
    query = f'''SELECT t.* FROM "{table}" t JOIN "{rtree}" r ON t."{primary_key}"=r.id
                WHERE r.maxx>=689800 AND r.minx<=694200 AND r.maxy>=5333800 AND r.miny<=5338200'''
    for row in connection.execute(query):
        record = dict(zip(columns, row))
        blob = record[geom_column]
        envelope = (blob[3] >> 1) & 7
        offset = 8 + {0:0, 1:32, 2:48, 3:48, 4:64}[envelope]
        geometry = from_wkb(blob[offset:])
        if geometry.geom_type != 'Point': raise ValueError('Expected individual tree points')
        trees.append({'id': f"{table}:{record['ID']}", 'point': [geometry.x, geometry.y],
                      'source': 'Bavaria automatic individual-tree detection, 2024'})
connection.close()
output = {'buildings': buildings, 'trees': trees, 'sourceCrs': 'EPSG:25832',
    'tileBounds': [690000,5334000,694000,5338000], 'outlineDates': dict(sorted(dates.items())),
    'creationDates': dict(sorted(created.items())), 'methods': dict(methods), 'tileSha256': tile_hashes,
    'heightValidation': {'compared': len(height_differences), 'maximumSourceDifferenceMeters': max(height_differences),
        'accepted': len(accepted_differences), 'maximumAcceptedDifferenceMeters': max(accepted_differences),
        'unknownObjects': excluded, 'unknownPotentialHeightCeilingMeters': 150}}
(raw / 'munich-environment.json').write_text(json.dumps(output, separators=(',', ':')))
print('Prepared', len(buildings), 'building parts and', len(trees), 'tree points')
