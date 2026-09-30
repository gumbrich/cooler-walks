"""Constrain Zurich to municipal data coverage and prepare conservative shadow clearance."""
import hashlib
import json
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import shape, box, mapping, LineString
from shapely.ops import transform
from pyproj import Transformer

root = Path(__file__).resolve().parents[1]
config = json.loads((root/'src/lib/coverage/zurich-extract.json').read_text())
dest = root/config['rawDirectory']
source = dest/'municipal-boundary.json'
raw = json.loads(source.read_text())
if len(raw['features']) != 1 or raw['features'][0]['properties']['bfs'] != 261:
    raise ValueError('Expected only the official Zurich municipal boundary')
if raw['crs']['properties']['name'] != 'urn:ogc:def:crs:EPSG::2056':
    raise ValueError('Inspect changed boundary coordinate system')
municipality = shape(raw['features'][0]['geometry'])
if not municipality.is_valid: raise ValueError('Invalid source boundary')
to_wgs = Transformer.from_crs(2056, 4326, always_xy=True).transform
to_lv95 = Transformer.from_crs(4326, 2056, always_xy=True).transform
# Preserve the exact source polygon, clipped only by the selected walking extent.
coverage = transform(to_wgs, municipality).intersection(box(*config['routeBounds']))
polygons = list(coverage.geoms) if coverage.geom_type == 'MultiPolygon' else [coverage]
coords = [mapping(p)['coordinates'] for p in polygons]
(root/'src/lib/coverage/zurich.json').write_text(json.dumps(coords,separators=(',',':'))+'\n')
# Nearest source-boundary segment gives metre clearance. No imaginary building
# is introduced to represent missing coverage outside the municipality.
rings = [municipality.exterior, *municipality.interiors]
segments = [LineString([a,b]) for ring in rings for a,b in zip(ring.coords, list(ring.coords)[1:])]
tree = shapely.STRtree(segments)
osm_path = dest/'osm.json'
osm = json.loads(osm_path.read_text())
ids = {n for w in osm['elements'] if w['type']=='way' and 'highway' in w.get('tags',{}) for n in w['nodes']}
nodes = [n for n in osm['elements'] if n['type']=='node' and n['id'] in ids]
x,y = to_lv95([n['lon'] for n in nodes], [n['lat'] for n in nodes])
points = shapely.points(x,y)
indices, distances = tree.query_nearest(points, return_distance=True, all_matches=False)
inside = shapely.covers(municipality,points)
clearance = np.zeros(len(nodes))
clearance[indices[0]] = distances
# Round down and reserve 1 m for coordinate transformation/rounding differences.
values = {str(n['id']): max(0,int(clearance[i])-1) if inside[i] else 0 for i,n in enumerate(nodes)}
report = {
 'source':'https://data.stadt-zuerich.ch/dataset/ktzh_gemeindegrenzen__ogd_',
 'service':'https://maps.zh.ch/wfs/GemZHWFS', 'layer':'gem_grenzen', 'bfs':261,
 'licence':'CC0', 'sourceCrs':'EPSG:2056', 'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'fetchedAt':json.loads((dest/'municipal-boundary.json.source.json').read_text())['fetchedAt'],
 'routeAreaKm2':round(transform(to_lv95,coverage).area/1e6,2),
 'sourceVertices':sum(len(r.coords) for r in rings), 'graphSourceNodes':len(nodes),
 'clearanceRule':'Whole-edge lower bound: min(endpoint clearance) minus half edge length; source clearance rounded down with an additional 1 m guard. Shade requires clearance >= maximum model shadow reach.',
 'limitations':'Municipal boundary is a conservative data limit, not a field survey or a claim of complete current buildings.'
}
(dest/'model-clearance.json').write_text(json.dumps({'osmSha256':hashlib.sha256(osm_path.read_bytes()).hexdigest(),'nodes':values},separators=(',',':')))
(root/'docs/zurich-municipal-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)
