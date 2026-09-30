"""Extract actual Swiss CityGML ground footprints and roof-to-ground heights.
Only configured tiles are read; source polygons must cover the model rectangle.
Raw archives and per-tile resumable extraction caches remain outside Git.
"""
import argparse
import hashlib
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile
from pyproj import Transformer
from shapely.geometry import Polygon, shape, box
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml', 'gen': 'http://www.opengis.net/citygml/generics/2.0'}
parser = argparse.ArgumentParser()
parser.add_argument('--expanded', action='store_true', help='Compatibility alias; the configured Zurich extent is always used')
parser.parse_args()
config = json.loads((ROOT / 'src/lib/coverage/zurich-extract.json').read_text())
dest = ROOT / config['rawDirectory']
sources = [json.loads((dest / ('buildings-' + tile + '-stac.json')).read_text()) for tile in config['buildingTiles']]
model = box(*config['modelBounds'])
if not unary_union([shape(s['geometry']) for s in sources]).covers(model):
    raise ValueError('The model rectangle is not fully covered by actual source tile polygons')
project = Transformer.from_crs(4326, 2056, always_xy=True)
corners = [project.transform(*p) for p in model.exterior.coords]
# A conservative extraction envelope; runtime retains its explicit WGS84 bounds.
clip = box(min(p[0] for p in corners)-50, min(p[1] for p in corners)-50,
           max(p[0] for p in corners)+50, max(p[1] for p in corners)+50)
buildings, seen, report = [], set(), []
for tile, stac in zip(config['buildingTiles'], sources):
    archive = ROOT / 'data/raw' / ('buildings-' + tile + '.zip')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    asset = next(v for k, v in stac['assets'].items() if k.endswith('_2056_5728.citygml.zip'))
    if asset['file:checksum'].lower() != '1220' + digest:
        raise ValueError('Building archive checksum differs from official metadata')
    signature = {'sha256': digest, 'modelBounds': config['modelBounds'], 'extractor': 3}
    cache = dest / ('ground-' + tile + '.json')
    cached = json.loads(cache.read_text()) if cache.exists() else None
    if cached and cached['signature'] == signature:
        parts = cached['parts']
        print('Reusing checked extraction', tile, flush=True)
    else:
        parts = []
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not name.lower().endswith(('.gml', '.xml')): continue
                print('Reading', archive.name, name, flush=True)
                with z.open(name) as source:
                    for _, elem in ET.iterparse(source, events=('end',)):
                        if elem.tag != '{'+NS['b']+'}Building': continue
                        bid = elem.attrib.get('{'+NS['g']+'}id', '')
                        if not bid: raise ValueError('Building without source ID')
                        ground = []
                        for surface in elem.findall('.//b:GroundSurface', NS):
                            for pos in surface.findall('.//g:exterior//g:posList', NS):
                                nums = list(map(float, (pos.text or '').split()))
                                if len(nums) % 3: raise ValueError('Expected XYZ ground coordinates')
                                pts = [nums[i:i+3] for i in range(0, len(nums), 3)]
                                if len(pts) >= 4: ground.append(pts)
                        retained = [(i, ring) for i, ring in enumerate(ground)
                                    if Polygon([(p[0], p[1]) for p in ring]).intersects(clip)]
                        if not retained: elem.clear(); continue
                        kinds = sorted({v.text for a in elem.findall('.//gen:stringAttribute', NS) if a.get('name') == 'OBJEKTART' for v in a.findall('gen:value', NS)})
                        supported = {'Gebaeude Einzelhaus', 'Hochhaus', 'Sakrales Gebaeude', 'Sakraler Turm', 'Lagertank'}
                        uncertain = not kinds or not set(kinds).issubset(supported)
                        zmin = min(p[2] for ring in ground for p in ring)
                        zmax = max(float(z) for pos in elem.findall('.//g:posList', NS)
                                   for z in (pos.text or '').split()[2::3])
                        height = zmax-zmin
                        if height <= 0 or height > 150: elem.clear(); continue
                        for i, ring in retained:
                            parts.append({'id': bid+':'+str(i), 'ring': [[p[0], p[1]] for p in ring],
                                          'height': round(height, 2), 'ground': round(zmin, 2), 'tile': archive.name,
                                          'sourceTypes': kinds, **({'uncertain': True} if uncertain else {})})
                        elem.clear()
        cache.write_text(json.dumps({'signature': signature, 'parts': parts}, separators=(',', ':')))
        print('Extracted', tile, len(parts), 'ground surfaces', flush=True)
    tile_ids = {b['id'].rsplit(':', 1)[0] for b in parts}
    buildings.extend(b for b in parts if b['id'].rsplit(':', 1)[0] not in seen)
    seen.update(tile_ids)
    report.append({'item': stac['id'], 'sourceDate': stac['properties']['datetime'],
                   'url': asset['href'], 'sha256': digest, 'bytes': archive.stat().st_size,
                   'groundSurfaces': len(parts), 'sourceBuildings': len(tile_ids),
                   'uncertainBuildings': len({b['id'].rsplit(':', 1)[0] for b in parts if b.get('uncertain')}),
                   'sourceTypes': sorted({kind for b in parts for kind in b['sourceTypes']})})
if not buildings: raise RuntimeError('No supported ground surfaces; do not publish shade capability')
(dest / 'buildings-lv95.json').write_text(json.dumps(buildings, separators=(',', ':')))
(ROOT / 'docs/zurich-building-coverage.json').write_text(json.dumps({
    'modelBounds': config['modelBounds'], 'routeBounds': config['routeBounds'],
    'sourcePolygonsCoverModel': True, 'sourceCrs': 'EPSG:2056 / LN02 (EPSG:5728)',
    'extractionBoundsLV95': list(clip.bounds), 'tiles': report,
    'groundSurfaces': len(buildings), 'sourceBuildings': len(seen),
    'uncertainBuildings': len({b['id'].rsplit(':', 1)[0] for b in buildings if b.get('uncertain')}),
    'typeRule': 'Open buildings, canopies, construction sites, greenhouses and unrecognized types remain uncertain; never solid shade prisms.',
    'limitations': '2019 geometry; flat extrusions; no terrain or tree shadows. Source coverage is not field validation.'
}, indent=2)+'\n')
print('Extracted', len(buildings), 'ground surfaces', flush=True)

# Audit remaining source geometry, including roofs/open structures without ground.
import runpy
runpy.run_path(str(ROOT / "scripts/extract-zurich-uncertain.py"), run_name="__main__")
