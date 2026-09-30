"""Merge coplanar source ground triangles, preserving interior courtyards.
Requires Shapely 2.1.2; input/output are local derived files, never raw Git assets.
"""
import json
from collections import defaultdict
from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import make_valid

root = Path(json.loads(Path('src/lib/coverage/zurich-extract.json').read_text())['rawDirectory'])
path = root / 'buildings-lv95.json'
raw = json.loads(path.read_text())
groups = defaultdict(list)
for b in raw:
    groups[b['id'].rsplit(':', 1)[0]].append(b)
result = []
for bid, parts in groups.items():
    polys = [make_valid(Polygon(b['ring'])) for b in parts]
    merged = unary_union(polys).simplify(0.1, preserve_topology=True)
    geometries = [merged] if merged.geom_type == 'Polygon' else list(getattr(merged, 'geoms', []))
    for i, polygon in enumerate(geometries):
        if polygon.geom_type != 'Polygon' or polygon.area < 1: continue
        result.append({'id':bid+':'+str(i), 'ring':list(polygon.exterior.coords),
          'holes':[list(r.coords) for r in polygon.interiors],
          'height':parts[0]['height'],'ground':parts[0]['ground'],'tile':parts[0]['tile'], **({'uncertain':True,'shadowHeightBound':parts[0]['height']} if any(b.get('uncertain') for b in parts) else {})})
# Unknown hulls are already conservative polygons; do not merge them into solid buildings.
result.extend(json.loads((root / 'unsupported-building-masks-lv95.json').read_text()))
(root / 'buildings-compact-lv95.json').write_text(json.dumps(result,separators=(',',':')))
print('Consolidated',len(raw),'triangles into',len(result),'footprints, preserving',sum(len(b['holes']) for b in result),'courtyards')
