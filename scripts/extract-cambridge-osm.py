"""Clip the dated Geofabrik Massachusetts PBF without inventing connectivity.

OSM node IDs survive extraction. libosmium assembles actual multipolygon rings,
including islands. Only the small derived JSON outputs are used by the app.
"""
import json
from pathlib import Path
import osmium

source = Path('data/raw/massachusetts-260927.osm.pbf')
bounds = (-71.166, 42.348, -71.060, 42.409)
def inside(lon, lat):
    w, s, e, n = bounds
    return w <= lon <= e and s <= lat <= n

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes, self.ways, self.areas = {}, [], []
        self.geo = osmium.geom.GeoJSONFactory()

    def node(self, node):
        if node.location.valid() and inside(node.location.lon, node.location.lat) and len(node.tags):
            self.nodes[node.id] = {'type': 'node', 'id': node.id,
                'lon': node.location.lon, 'lat': node.location.lat, 'tags': dict(node.tags)}

    def way(self, way):
        tags = dict(way.tags)
        if not (tags.get('highway') or tags.get('building') or tags.get('waterway') or
                tags.get('natural') == 'water' or tags.get('leisure') == 'park'): return
        if not any(n.location.valid() and inside(n.lon, n.lat) for n in way.nodes): return
        if not all(n.location.valid() for n in way.nodes):
            raise ValueError(f'Missing source location on way {way.id}')
        self.ways.append({'type': 'way', 'id': way.id, 'nodes': [n.ref for n in way.nodes], 'tags': tags})
        for n in way.nodes:
            self.nodes.setdefault(n.ref, {'type': 'node', 'id': n.ref, 'lon': n.lon, 'lat': n.lat})

    def area(self, area):
        tags = dict(area.tags)
        if tags.get('natural') != 'water' and tags.get('leisure') != 'park': return
        if area.from_way(): return  # Closed ways already have their source geometry above.
        if not any(inside(n.lon, n.lat) for ring in area.outer_rings() for n in ring): return
        geometry = json.loads(self.geo.create_multipolygon(area))
        self.areas.append({'type': 'Feature', 'geometry': geometry, 'properties': {
            'kind': 'water' if tags.get('natural') == 'water' else 'park',
            'name': tags.get('name', ''), 'id': f'relation-{area.orig_id()}', 'osmTags': tags,
        }})

reader = osmium.io.Reader(str(source))
timestamp = reader.header().get('osmosis_replication_timestamp')
reader.close()
extract = Extract()
extract.apply_file(str(source), locations=True, idx='flex_mem')
Path('data/raw/cambridge-osm.json').write_text(json.dumps({
    'osm3s': {'timestamp_osm_base': timestamp},
    'elements': list(extract.nodes.values()) + extract.ways,
    'source': source.name,
}, separators=(',', ':')))
Path('data/raw/cambridge-areas.geojson').write_text(json.dumps({
    'type': 'FeatureCollection', 'features': extract.areas,
}, separators=(',', ':')))
print('Extracted', len(extract.nodes), 'nodes,', len(extract.ways), 'ways,', len(extract.areas), 'areas;', timestamp)
