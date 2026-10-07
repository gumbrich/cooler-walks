"""Offline integrity/geometry checks on the saved five-pair evidence, not accuracy tests."""
import hashlib
import json
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import LineString, Point

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/shade-services'
protocol = json.loads((ROOT / 'scripts/shade-service-cases.json').read_text())
external = json.loads((OUT / 'external-routes.json').read_text())
cooler = json.loads((OUT / 'cooler-routes.json').read_text())
report = json.loads((OUT / 'comparison.json').read_text())
points = json.loads((OUT / 'point-comparisons.json').read_text())
project = Transformer.from_crs(4326, 2056, always_xy=True).transform
ids = [c['id'] for c in protocol['cases']]
assert len(ids) == len(set(ids)) == 5
assert external['protocol'] == report['protocol'] == protocol
for records in [external['records'], cooler['records'], report['rows']]:
    assert [r['id'] for r in records] == ids
assert len(points) == 10
raw_hashes = 0
sample_count = 0
for case, ext, cw, row in zip(protocol['cases'], external['records'], cooler['records'], report['rows'], strict=True):
    assert len(cw['scenarios']) == 2
    assert cw['scenarios'][0]['fastest']['coordinates'] == cw['scenarios'][1]['fastest']['coordinates']
    for profile, service in ext['services'].items():
        raw = ROOT / f'data/raw/shade-service-comparison/{case["id"]}-{profile}.json'
        if raw.exists():
            assert hashlib.sha256(raw.read_bytes()).hexdigest() == service['responseSha256']
            raw_hashes += 1
        for waypoint, requested in zip(service['waypoints'], [case['a'], case['b']], strict=True):
            assert Point(project(*requested)).distance(Point(project(*waypoint['location']))) < 3
        first = service['routes'][0]
        # Oerlikon's returned Vampire polyline begins ~0.8 m from its own waypoint.
        # Preserve both values; do not silently rewrite the returned geometry.
        for i, waypoint in zip([0, -1], service['waypoints'], strict=True):
            assert Point(project(*first['coordinates'][i])).distance(Point(project(*waypoint['location']))) < 1
        # A degree/metric unit error or missing route section must not look like a valid distance.
        length = LineString([project(*p) for p in first['coordinates']]).length
        assert abs(length / first['distance'] - 1) < .01
    same_samples = []
    for scenario, result in zip(cw['scenarios'], row['fixedFastestPathComparison'], strict=True):
        route = scenario['fastest']
        selected = scenario['selected']
        assert selected['minutes'] <= route['minutes'] + 5 + 1e-8
        assert abs(selected['minutes'] * 80 - selected['distance']) < 1e-6
        for r in [route, selected]:
            assert abs(sum(r[k] for k in ['shadeMeters', 'sunMeters', 'unknownMeters', 'nightMeters']) - r['distance']) < 1e-6
        if scenario['mode'] != 'shade':
            assert selected['coordinates'] == route['coordinates']
        line = LineString([project(*p) for p in route['coordinates']])
        record = next(p for p in points if p['id'] == case['id'] and p['departure'] == scenario['departure'])
        samples = record['points']
        same_samples.append([(s['point'], s['meters'], s['nonGround']) for s in samples])
        assert len(samples) == result['samples']
        assert abs(sum(s['meters'] for s in samples) - route['distance']) < 1e-6
        assert all(0 < s['meters'] <= 4 + 1e-8 for s in samples)
        assert all(line.distance(Point(project(*s['point']))) < .02 for s in samples)
        assert all(s['exposure'] == 'unknown' for s in samples if s['nonGround'])
        common = [s for s in samples if s['exposure'] in ['sun', 'shade'] and s['rasterClass'] in ['sun', 'shade']]
        denominator = sum(s['meters'] for s in common)
        assert abs(denominator - result['comparableMeters']) < 1e-6
        assert abs(sum(s['meters'] for s in common if s['exposure'] == s['rasterClass']) / denominator * 100 - result['agreementPercentOfComparable']) < 1e-8
        assert result['comparableMeters'] <= route['distance'] + 1e-6
        if scenario['departure'] == protocol['departure']:
            sample_count += len(samples)
    assert same_samples[0] == same_samples[1], 'Clock sensitivity must keep the path and samples fixed'
assert sample_count == 1346
print(f'PASS: 5 fixed pairs, 10 external responses, {raw_hashes} available raw hashes, 10 clock/path scenarios, {sample_count} fixed samples; endpoint, metric geometry, coverage, non-ground, accounting and detour checks. No accuracy claim.')
