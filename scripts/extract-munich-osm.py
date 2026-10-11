"""Dated regional PBF -> bounded Munich network, addresses and complete areas.

Keeps source node identities and libosmium-assembled rings. No offset pavements,
geometric crossing joins or live routing service. Raw PBF/JSON remains ignored.
"""
import hashlib
import json
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'scripts/munich-coverage.json').read_text())
source = ROOT / 'data/raw' / CONFIG['osmFile']
if source.stat().st_size != CONFIG['osmBytes']:
    raise ValueError('Incomplete dated Geofabrik source')
expected = source.with_suffix('.pbf.md5').read_text().split()[0]
with source.open('rb') as stream:
    if hashlib.file_digest(stream, 'md5').hexdigest() != expected:
        raise ValueError('Published Geofabrik checksum mismatch')
with source.open('rb') as stream:
    sha = hashlib.file_digest(stream, 'sha256').hexdigest()

def inside(lon, lat):
    w, s, e, n = CONFIG['networkBounds']
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
                tags.get('addr:housenumber') or tags.get('natural') == 'water' or tags.get('leisure') == 'park'):
            return
        if not any(n.location.valid() and inside(n.lon, n.lat) for n in way.nodes): return
        if not all(n.location.valid() for n in way.nodes):
            raise ValueError(f'Missing location on way {way.id}')
        self.ways.append({'type': 'way', 'id': way.id, 'nodes': [n.ref for n in way.nodes], 'tags': tags})
        for n in way.nodes:
            self.nodes.setdefault(n.ref, {'type': 'node', 'id': n.ref, 'lon': n.lon, 'lat': n.lat})

    def area(self, area):
        tags = dict(area.tags)
        if tags.get('natural') != 'water' and tags.get('leisure') != 'park': return
        if area.from_way(): return
        if not any(inside(n.lon, n.lat) for ring in area.outer_rings() for n in ring): return
        self.areas.append({'type': 'Feature', 'geometry': json.loads(self.geo.create_multipolygon(area)),
            'properties': {'kind': 'water' if tags.get('natural') == 'water' else 'park',
                           'name': tags.get('name', ''), 'id': f'relation-{area.orig_id()}', 'osmTags': tags}})

reader = osmium.io.Reader(str(source))
timestamp = reader.header().get('osmosis_replication_timestamp')
reader.close()
if not timestamp.startswith('2026-10-08T'):
    raise ValueError('Unexpected source timestamp')
extract = Extract()
extract.apply_file(str(source), locations=True, idx='flex_mem')
provenance = {'source': CONFIG['osmUrl'], 'sourceFile': source.name, 'sha256': sha,
              'osm3s': {'timestamp_osm_base': timestamp}, 'fetchedAt': '2026-10-11'}
(ROOT / 'data/raw/munich-osm.json').write_text(json.dumps({**provenance,
    'elements': list(extract.nodes.values()) + extract.ways}, separators=(',', ':')))
(ROOT / 'data/raw/munich-areas.geojson').write_text(json.dumps({
    'type': 'FeatureCollection', 'features': extract.areas}, separators=(',', ':')))
print('Extracted', len(extract.nodes), 'nodes,', len(extract.ways), 'ways,', len(extract.areas), 'areas;', timestamp)
