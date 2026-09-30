"""Independent original-polygon intersections across the extended Zurich area.

Only source faces near the frozen queries are retained in memory. Full archives
and their hashes are checked. This reuses the independently tested plane/polygon
reference, not the production triangulation, tile index or ray traversal.
"""
from datetime import datetime,timezone
import importlib.util
import json
import math
from pathlib import Path
from shapely.geometry import LineString
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/audit-shadow-sources.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
predictions=json.loads((ROOT/'data/raw/zurich-shade-library/predictions.json').read_text())
sources=json.loads((ROOT/'docs/shade-library-data.json').read_text())
lines=[]
for row in predictions['rays']:
    if row['ground'] is None or row['altitude']<math.radians(10):continue
    x,y=row['point'];reach=max(0,(predictions['maxZ']-row['ground'])/math.tan(row['altitude']))
    end=[x+reach*math.sin(row['azimuth']),y+reach*math.cos(row['azimuth'])]
    lines.append(LineString([[x,y],end]).buffer(2))
region=unary_union(lines)
faces=audit.SourceFaces(predictions['bounds'],{'roofsAndFacades':sources['buildingsSource'],
    'rejectedBuildings':sources['rejectedBuildings']},query_region=region)
# The crop contains every face on a query ray; use the full library's conservative
# ceiling for the external-boundary test, rather than the cropped subset's roof.
faces.max_z=predictions['maxZ']
records,mismatches,excluded=[],[],[]
for row in predictions['rays']:
    expected,bid=faces.exposure(row,predictions['bounds'])
    if expected=='boundary':excluded.append(row);continue
    if expected!=row['geometryExposure']:mismatches.append({**row,'expected':expected,'building':bid})
    records.append({k:row[k] for k in ['district','point','ground','altitude','azimuth']}|{'expected':expected})
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'libraryVersion':predictions['libraryVersion'],
        'manifestSha256':sources['manifestSha256'],'sourceBuildingsCompared':faces.building_count,
        'queries':len(predictions['rays']),'stableComparisons':len(records),'excludedWithin2cmOfFaceEdge':len(excluded),
        'mismatches':mismatches,'passed':bool(records) and not mismatches,
        'scope':'Original CityGML polygon versus runtime tiled triangle intersections. Historical source consistency and field accuracy remain unvalidated.'}
(ROOT/'docs/shade-library-geometry-audit.json').write_text(json.dumps(report,indent=2)+'\n')
(ROOT/'tests/fixtures/shade-library-reference.json').write_text(json.dumps({'manifestSha256':sources['manifestSha256'],'cases':records},separators=(',',':'))+'\n')
print(report,flush=True)
if not report['passed']:raise SystemExit('Expanded mesh disagrees with original source polygons')
