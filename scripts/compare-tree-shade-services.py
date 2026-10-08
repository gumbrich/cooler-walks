"""Same-point canopy diagnostic against a pinned Vampire artifact; no accuracy claim.

Uses the two saved public route responses. Does not contact external services or
change the production model, thresholds, historical comparison or sampling points.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, Point

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/tree-shade-comparison'
ours = json.loads((OUT / 'cooler-routes.json').read_text())
external = json.loads((OUT / 'external-routes.json').read_text())
assert ours['case'] == external['case']
raster_path = ROOT / 'data/raw/zurich-pavements/vampire-shadows.asc'
raster_hash = hashlib.sha256(raster_path.read_bytes()).hexdigest()
assert raster_hash == 'cfc33982cb2177c5d6304ea5a4f26c390ccda789463d0e74e89478e8414e188b'
with raster_path.open() as stream:
    header = dict((a.lower(), float(b)) for a, b in (stream.readline().split() for _ in range(6)))
    raster = np.loadtxt(stream)
assert raster.shape == (int(header['nrows']), int(header['ncols']))
project = Transformer.from_crs(4326, 2056, always_xy=True).transform


def at(point):
    col = int(np.floor((point[0] - header['xllcorner']) / header['cellsize']))
    row = int(header['nrows']) - 1 - int(np.floor((point[1] - header['yllcorner']) / header['cellsize']))
    if not (0 <= row < raster.shape[0] and 0 <= col < raster.shape[1]):
        return None
    value = float(raster[row, col])
    return None if value == header['nodata_value'] else value


def line(coords):
    return LineString([project(*p) for p in coords])


def counts(points, name):
    return {k: sum(p['meters'] for p in points if p[name] == k) for k in ['shade', 'sun', 'unknown', 'night']}


def comparison(points, name):
    matrix = {}
    for p in points:
        key = p[name] + '/' + p['vampire']
        matrix[key] = matrix.get(key, 0.) + p['meters']
    meters = sum(matrix.values())
    assert meters > 0
    return {
        'meters': meters,
        'coolerShadePercent': 100 * sum(p['meters'] for p in points if p[name] == 'shade') / meters,
        'vampireRasterShadePercent': 100 * sum(p['meters'] for p in points if p['vampire'] == 'shade') / meters,
        'agreementPercent': 100 * sum(p['meters'] for p in points if p[name] == p['vampire']) / meters,
        'matrixMetersCoolerThenVampire': matrix,
    }


records = []
point_records = []
for scenario in ours['scenarios']:
    points = []
    walked = 0.
    for p in scenario['points']:
        v = at(p['point'])
        points.append({**p, 'rasterValue': v, 'vampire': 'unknown' if v is None else 'shade' if v < 100 else 'sun',
                       'fromMeters': walked, 'toMeters': walked + p['meters']})
        walked += p['meters']
    common = [p for p in points if all(p[k] in ['sun', 'shade'] for k in ['building', 'tree', 'vampire'])]
    building_comparable = [p for p in points if all(p[k] in ['sun', 'shade'] for k in ['building', 'vampire'])]
    tree_comparable = [p for p in points if all(p[k] in ['sun', 'shade'] for k in ['tree', 'vampire'])]
    # Three-way support avoids making new unknowns look like improved agreement.
    common_meters = sum(p['meters'] for p in common)
    assert abs(common_meters - sum(p['meters'] for p in tree_comparable)) < 1e-6
    improved = sum(p['meters'] for p in common if p['building'] != p['vampire'] and p['tree'] == p['vampire'])
    worsened = sum(p['meters'] for p in common if p['building'] == p['vampire'] and p['tree'] != p['vampire'])
    runs = []
    for p in points:
        if p['tree'] in ['sun', 'shade'] and p['vampire'] in ['sun', 'shade'] and p['tree'] != p['vampire']:
            kind = p['tree'] + '/' + p['vampire']
            if runs and runs[-1]['kind'] == kind and abs(runs[-1]['toMeters'] - p['fromMeters']) < 1e-6:
                runs[-1].update(toMeters=p['toMeters'], endSample=p['point'])
            else:
                runs.append({'kind': kind, 'fromMeters': p['fromMeters'], 'toMeters': p['toMeters'],
                             'startSample': p['point'], 'endSample': p['point']})
    for run in runs:
        run['meters'] = run['toMeters'] - run['fromMeters']
    records.append({
        'departure': scenario['departure'], 'sampleCount': len(points), 'routeMeters': walked,
        'wholePathMeters': {name: counts(points, name) for name in ['building', 'tree', 'vampire']},
        'threeWayComparableMeters': common_meters, 'threeWayCoveragePercent': 100 * common_meters / walked,
        'commonSupport': {name: comparison(common, name) for name in ['building', 'tree']},
        'pairwiseSupport': {'building': comparison(building_comparable, 'building'), 'tree': comparison(tree_comparable, 'tree')},
        'newAgreementMeters': improved, 'newDisagreementMeters': worsened,
        'withheldByCanopyMeters': sum(p['meters'] for p in points if p['tree'] == 'unknown' and p['building'] in ['sun', 'shade']),
        'longestDisagreementRuns': sorted(runs, key=lambda r: -r['meters'])[:8],
    })
    point_records.append({'departure': scenario['departure'], 'points': points})
    assert abs(sum(counts(points, 'tree').values()) - walked) < 1e-6
    assert abs((records[-1]['commonSupport']['tree']['agreementPercent'] - records[-1]['commonSupport']['building']['agreementPercent']) * common_meters / 100 - (improved - worsened)) < 1e-6

primary = ours['scenarios'][0]
current = primary['variants'][1]
baseline = primary['variants'][0]
vampire = external['services']['vampire']['routes'][0]
foot = external['services']['foot']['routes'][0]
ours_line = line(current['selected']['coordinates'])
vampire_line = line(vampire['coordinates'])
for profile, service in external['services'].items():
    raw = ROOT / f'data/raw/tree-shade-comparison/{profile}.json'
    if raw.exists():
        assert hashlib.sha256(raw.read_bytes()).hexdigest() == service['responseSha256']
    assert len(service['waypoints']) == 2
    assert max(w['distance'] for w in service['waypoints']) < 3
    for endpoint, waypoint in zip([0, -1], service['waypoints'], strict=True):
        assert Point(project(*service['routes'][0]['coordinates'][endpoint])).distance(Point(project(*waypoint['location']))) < 1
for path, sha in ours['inputSha256'].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == sha, path

native = {}
for name, variant in [('building', baseline), ('tree', current)]:
    r = variant['selected']
    known = r['shadeMeters'] + r['sunMeters']
    native[name] = {k: r[k] for k in ['distance', 'minutes', 'shadeMeters', 'canopyShadeMeters', 'sunMeters', 'unknownMeters']}
    native[name].update(mode=variant['mode'], coveragePercent=known / r['distance'] * 100,
                        shadePercentOfKnown=r['shadeMeters'] / known * 100,
                        extraMinutes=r['minutes'] - variant['fastest']['minutes'])
report = {
    'case': ours['case'], 'model': ours['model'], 'canopyVersion': ours['canopyVersion'],
    'externalFetchedAt': {k: v['fetchedAt'] for k, v in external['services'].items()},
    'raster': {'sha256': raster_hash, 'header': header,
               'url': 'https://raw.githubusercontent.com/sosm/cbf-routing-profiles/6b45390967718a4b785af11222fd0dc2688eeeac/vampire/shadows_zurich_city.asc',
               'classification': 'Published <100 shade proxy. This is our resampling of the pinned artifact, not a percentage returned by the live service.'},
    'timeLimitation': ours['timeLimitation'],
    'routeComparison': {'coolerArrivalTime': native, 'sosmFootMeters': foot['distance'], 'vampireMeters': vampire['distance'],
                        'coolerWithin8mOfVampirePercent': ours_line.intersection(vampire_line.buffer(8)).length / ours_line.length * 100,
                        'vampireWithin8mOfCoolerPercent': vampire_line.intersection(ours_line.buffer(8)).length / vampire_line.length * 100},
    'samePointSnapshots': records,
    'limitations': ['Not field validation. Agreement is not accuracy.', 'Deployed Vampire raster identity and clock convention remain unknown.',
                    'Live service exposes no shade fraction. Keep API routing separate from published-raster scores.',
                    'Opaque tree scenario from predominantly leaf-off returns; summer crowns and light transmission remain uncertain.',
                    'Snapshot comparison uses 4 m historical samples; app uses arrival times and up-to-8 m samples.',
                    'Neither model was tuned; new tree unknowns remain excluded from percentages and explicit in coverage.'],
}
(OUT / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
(OUT / 'point-comparisons.json').write_text(json.dumps(point_records, separators=(',', ':')) + '\n')
print(json.dumps({'routes': report['routeComparison'], 'snapshots': records}, indent=2))
