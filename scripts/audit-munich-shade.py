"""Independent Munich checks against original, untriangulated CityGML and DGM1.

First run verify-munich.ts --export-rays. The frozen fixture runs without raw data
in CI. Agreement checks processing fidelity, not field accuracy or tree shade.
"""
import importlib.util
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
import pandas as pd
import pvlib
import rasterio
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-shadow-sources.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
audit.NS = {'b': 'http://www.opengis.net/citygml/building/1.0', 'g': 'http://www.opengis.net/gml'}
NS = audit.NS
p = json.loads((ROOT / 'data/raw/munich-extensions/predictions.json').read_text())
manifest = json.loads((ROOT / 'public/data/munich-shade-library.json').read_text())
env = json.loads((ROOT / 'data/raw/munich-environment.json').read_text())
assert audit.sha(ROOT / 'public/data/munich-shade-library.json') == p['modelSha256']
accepted = {b['id'].rsplit(':', 1)[0] for b in env['buildings']} - set(manifest['excludedBuildings'])
region = unary_union([LineString([r['point'], [r['point'][0]+(p['maxZ']-r['ground'])/math.tan(r['altitude'])*math.sin(r['azimuth']),
    r['point'][1]+(p['maxZ']-r['ground'])/math.tan(r['altitude'])*math.cos(r['azimuth'])]]).buffer(2)
    for r in p['rays'] if r['ground'] is not None])
faces = audit.SourceFaces.__new__(audit.SourceFaces)
faces.faces, boxes, seen = [], [], set()
faces.max_z = p['maxZ']
for tile, expected in env['tileSha256'].items():
    path = ROOT / f'data/raw/munich-{tile}.gml'
    assert audit.sha(path) == expected
    for _, element in ET.iterparse(path, events=['end']):
        if element.tag != '{'+NS['b']+'}Building': continue
        for part in [element, *element.findall('.//b:BuildingPart', NS)]:
            bid = part.attrib['{'+NS['g']+'}id']
            if bid not in accepted or bid in seen: continue
            grounds = part.findall('./b:boundedBy/b:GroundSurface//g:exterior', NS)
            if not any(Polygon(audit.xyz(g)[:, :2]).intersects(region) for g in grounds): continue
            seen.add(bid)
            for kind in ['RoofSurface', 'WallSurface']:
                for face in part.findall(f'./b:boundedBy/b:{kind}//g:Polygon', NS):
                    exterior = audit.xyz(face.find('g:exterior', NS))
                    holes = [audit.xyz(h) for h in face.findall('g:interior', NS)]
                    origin = exterior.mean(axis=0)
                    _, _, vh = np.linalg.svd(exterior-origin, full_matrices=False)
                    normal = vh[-1]
                    axes = [i for i in range(3) if i != int(abs(normal).argmax())]
                    polygon = Polygon(exterior[:, axes], [h[:, axes] for h in holes])
                    assert polygon.is_valid
                    lo, hi = exterior.min(axis=0), exterior.max(axis=0)
                    faces.faces.append((origin, normal, axes, polygon, bid, kind))
                    boxes.append(box(lo[0],lo[1],hi[0],hi[1]))
        element.clear()
    print('Original source faces', tile, len(faces.faces), flush=True)
faces.tree = STRtree(boxes)
faces.normals = np.array([f[1] for f in faces.faces])
faces.origins = np.array([f[0] for f in faces.faces])
cases, mismatches, boundaries, ground_differences, solar_errors = [], [], [], [], []
rasters = {}
for i, row in enumerate(p['rays']):
    reference, building = faces.exposure(row, p['bounds'])
    if reference == 'boundary': boundaries.append(i); continue
    if reference != row['geometryExposure']: mismatches.append(dict(row, expected=reference, building=building))
    x,y = row['point']; tx,ty = int(x//1000)*1000, int(y//1000)*1000
    if (tx,ty) not in rasters:
        with rasterio.open(ROOT / f'data/raw/munich-extensions/{tx//1000}_{ty//1000}.tif') as src:
            rasters[(tx,ty)] = src.read(1)
    r,c = int((ty+1000-y)//2)*2, int((x-tx)//2)*2
    block = rasters[(tx,ty)][r:r+2,c:c+2]
    assert block.shape == (2,2)
    ground_differences.append(row['ground']-float(np.mean(block,dtype=np.float64)))
    cases.append({k: row[k] for k in ['point','altitude','azimuth','ground']} | {'expected': reference})
    if i % 20 == 0:
        lon, lat = row['geographic']
        spa = pvlib.solarposition.spa_python(pd.DatetimeIndex([row['instant']]), lat, lon, pressure=0, delta_t=69.184).iloc[0]
        # Grid convergence is already independently pinned in model.test.ts.
        # Compare solar elevation here without conflating true/grid azimuths.
        solar_errors.append(abs(math.degrees(row['altitude'])-spa.elevation))
report = {'rays': len(p['rays']), 'compared': len(cases), 'edgeCasesWithin2cm': boundaries, 'mismatches': mismatches,
    'sourceFaces': len(faces.faces), 'sourceParts': len(seen), 'maximumGroundQuantizationErrorMeters': max(map(abs,ground_differences)),
    'maximumSolarElevationDifferenceDegrees': max(solar_errors), 'modelSha256': p['modelSha256'],
    'method': 'Direct original CityGML polygon intersections with independent SVD planes; DGM1 native 2x2 blocks; pvlib NREL SPA geometric elevation.',
    'limits': 'Processing fidelity only. Source accuracy, source-age mismatch, side-of-street geometry and field validation remain open.'}
(ROOT / 'docs/munich-shade-audit.json').write_text(json.dumps(report, indent=2)+'\n')
assert not mismatches, 'Source polygon/ray disagreement'
assert report['maximumGroundQuantizationErrorMeters'] <= .051
assert report['maximumSolarElevationDifferenceDegrees'] < .25
(ROOT / 'tests/fixtures/munich-shade-reference.json').write_text(json.dumps({'modelSha256':p['modelSha256'],
    'reference':report['method'], 'cases':cases}, separators=(',',':'))+'\n')
print(json.dumps(report), flush=True)
