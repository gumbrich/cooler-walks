"""Measure detour-route proximity in LV95; proximity is not exact pavement identity."""
import hashlib
import json
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, Point

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/tree-shade-comparison'
data = json.loads((OUT / 'detour-routes.json').read_text())
external = json.loads((OUT / 'external-routes.json').read_text())
for path, expected in data['inputSha256'].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path
assert external['case'] == data['case']
project = Transformer.from_crs(4326, 2056, always_xy=True).transform
def line(coordinates):
    return LineString([project(*p) for p in coordinates])

def proximity(a, b):
    # Uniform 2 m midpoints, so every sample represents the same walking distance.
    n = int(np.ceil(a.length / 2))
    distances = np.array([a.interpolate((i + .5) / n, normalized=True).distance(b) for i in range(n)])
    assert len(distances) > 0 and np.all(np.isfinite(distances))
    return {'samples': n, 'spacingMeters': a.length / n,
            'meanMeters': float(np.mean(distances)), 'medianMeters': float(np.median(distances)),
            'p95Meters': float(np.quantile(distances, .95)), 'maxSampledMeters': float(np.max(distances))}

v = external['services']['vampire']['routes'][0]
vline = line(v['coordinates'])
rows = []
for row in data['rows']:
    r = row['selected']
    cline = line(r['coordinates'])
    match = {}
    for tolerance in [3, 8, 15, 20, 30, 50]:
        c_part = cline.intersection(vline.buffer(tolerance)).length / cline.length
        v_part = vline.intersection(cline.buffer(tolerance)).length / vline.length
        assert 0 <= c_part <= 1 + 1e-9 and 0 <= v_part <= 1 + 1e-9
        match[str(tolerance)] = {'coolerWithinVampirePercent': 100 * c_part,
                                'vampireWithinCoolerPercent': 100 * v_part,
                                'symmetricMeanPercent': 50 * (c_part + v_part)}
    rows.append({'canopyEnabled':row['canopyEnabled'], 'allowedExtraMinutes':row['extraMinutes'],
                 'actualExtraMinutes':row['actualExtraMinutes'], 'selectedMeters':r['distance'],
                 'selectedMinutes':r['minutes'], 'coveragePercent':r['coveragePercent'],
                 'selectionReason':row['selectionReason'], 'candidateCount':row['candidateCount'],
                 'coordinateSha256':hashlib.sha256(json.dumps(r['coordinates'],separators=(',',':')).encode()).hexdigest(),
                 'proximityPercentAtToleranceMeters':match, 'coolerToVampireDistance':proximity(cline,vline),
                 'vampireToCoolerDistance':proximity(vline,cline)})
    assert row['actualExtraMinutes'] <= row['extraMinutes'] + 1e-8
assert len({r['coordinateSha256'] for r in rows if r['canopyEnabled']}) == 1
assert rows[4]['coordinateSha256'] == rows[5]['coordinateSha256']
assert rows[3]['coordinateSha256'] == rows[0]['coordinateSha256']
# Synthetic geometry sanity checks: identical and parallel lines.
unit = LineString([(0,0),(100,0)])
parallel = LineString([(0,10),(100,10)])
assert abs(unit.intersection(unit.buffer(8)).length / unit.length - 1) < 1e-9
assert unit.intersection(parallel.buffer(8)).length == 0
assert abs(unit.intersection(parallel.buffer(15)).length / unit.length - 1) < 1e-9
assert abs(proximity(unit,parallel)['meanMeters'] - 10) < 1e-9
report = {
    'case':data['case'], 'departure':data['departure'], 'vampireMeters':v['distance'],
    'vampireFetchedAt':external['services']['vampire']['fetchedAt'],
    'metric':'Fraction of each LV95 polyline lying within a specified metric buffer of the other; both directions reported. Primary tolerance 8 m preserves earlier protocol; other tolerances expose sensitivity.',
    'distanceMetric':'Nearest distance to the other route at uniformly weighted <=2 m midpoints; not a street-network detour distance.',
    'limits':['Nearby paths are not necessarily the same pavement, crossing or route topology.',
              'Geometrical similarity is not shade agreement or field accuracy.',
              'Tree mode retains insufficient-coverage fallback at all budgets; no shade recommendation is claimed.',
              'Vampire response is held fixed because its public UI has no extra-walking-time control. Published profile uses a fixed radiation penalty; exact deployed build remains unknown.',
              'Our extra time is a ceiling, not a target; results are best of evaluated candidates, not proven global optima.'],
    'rows': rows,
}
(OUT/'detour-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
for r in rows:
    print('trees' if r['canopyEnabled'] else 'buildings',r['allowedExtraMinutes'],round(r['selectedMeters']),
          'actual +',round(r['actualExtraMinutes'],2),'min; within 8/20 m:',
          [round(r['proximityPercentAtToleranceMeters'][str(t)]['coolerWithinVampirePercent'],1) for t in [8,20]],
          'mean/p95 m',round(r['coolerToVampireDistance']['meanMeters'],1),round(r['coolerToVampireDistance']['p95Meters'],1))
