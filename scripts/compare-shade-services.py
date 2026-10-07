"""Compare five fixed route pairs and a fixed-path shade diagnostic; no ground-truth claim."""
import hashlib
import json
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, Point

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/shade-services'
external = json.loads((OUT / 'external-routes.json').read_text())
cooler = json.loads((OUT / 'cooler-routes.json').read_text())
protocol = external['protocol']
raster_path = ROOT / 'data/raw/zurich-pavements/vampire-shadows.asc'
raster_hash = hashlib.sha256(raster_path.read_bytes()).hexdigest()
assert raster_hash == 'cfc33982cb2177c5d6304ea5a4f26c390ccda789463d0e74e89478e8414e188b'
with raster_path.open() as stream:
    header = dict((a.lower(), float(b)) for a, b in (stream.readline().split() for _ in range(6)))
    raster = np.loadtxt(stream)
assert raster.shape == (int(header['nrows']), int(header['ncols']))
project = Transformer.from_crs(4326, 2056, always_xy=True).transform
unproject = Transformer.from_crs(2056, 4326, always_xy=True).transform


def raster_at(point):
    col = int(np.floor((point[0] - header['xllcorner']) / header['cellsize']))
    row = int(header['nrows']) - 1 - int(np.floor((point[1] - header['yllcorner']) / header['cellsize']))
    if not (0 <= row < raster.shape[0] and 0 <= col < raster.shape[1]):
        return None
    value = float(raster[row, col])
    return None if value == header['nodata_value'] else value


def metric_line(coordinates):
    return LineString([project(*p) for p in coordinates])


def raster_route(coordinates):
    """Our resampling of published raster, never a percentage claimed by the live service."""
    line = metric_line(coordinates)
    n = int(np.ceil(line.length / protocol['sampleSpacingMeters']))
    classified = {'sun': 0., 'shade': 0., 'unknown': 0.}
    for i in range(n):
        p = line.interpolate((i + .5) / n, normalized=True)
        v = raster_at(unproject(p.x, p.y))
        classified['unknown' if v is None else 'shade' if v < 100 else 'sun'] += line.length / n
    known = classified['sun'] + classified['shade']
    return {'metricLength': line.length, 'meters': classified,
            'coveragePercent': 100 * known / line.length,
            'shadePercentOfKnown': 100 * classified['shade'] / known if known else None}


rows = []
point_records = []
for case, ours, other in zip(protocol['cases'], cooler['records'], external['records'], strict=True):
    assert case['id'] == ours['id'] == other['id']
    v = other['services']['vampire']['routes'][0]
    foot = other['services']['foot']['routes'][0]
    s = ours['scenarios'][0]
    r = s['selected']
    known = r['shadeMeters'] + r['sunMeters']
    line_c, line_v = metric_line(r['coordinates']), metric_line(v['coordinates'])
    comparisons = []
    for scenario in ours['scenarios']:
        # Always the same fastest route, regardless of which shade alternative a model selects.
        samples = next(x for x in scenario['comparisonPaths'] if x['name'] == 'fastest')['samples']
        matrix = {}
        records = []
        for sample in samples:
            value = raster_at(sample['point'])
            proxy = 'unknown' if value is None else 'shade' if value < 100 else 'sun'
            key = sample['exposure'] + '/' + proxy
            matrix[key] = matrix.get(key, 0.) + sample['meters']
            records.append({**sample, 'rasterValue': value, 'rasterClass': proxy})
        total = sum(matrix.values())
        comparable = sum(n for key, n in matrix.items() if all(k in ['sun', 'shade'] for k in key.split('/')))
        agreeing = matrix.get('sun/sun', 0) + matrix.get('shade/shade', 0)
        ours_shade = matrix.get('shade/sun', 0) + matrix.get('shade/shade', 0)
        theirs_shade = matrix.get('sun/shade', 0) + matrix.get('shade/shade', 0)
        assert 0 < comparable <= total + 1e-6
        comparisons.append({
            'departure': scenario['departure'], 'samples': len(samples), 'totalMeters': total,
            'comparableMeters': comparable, 'comparablePercent': 100 * comparable / total,
            'agreementPercentOfComparable': 100 * agreeing / comparable,
            'coolerShadePercentOfComparable': 100 * ours_shade / comparable,
            'rasterShadePercentOfComparable': 100 * theirs_shade / comparable,
            'matrixMetersCoolerThenRaster': matrix,
        })
        point_records.append({'id': case['id'], 'departure': scenario['departure'], 'points': records})
    rows.append({
        **case, 'coolerMode': s['mode'], 'coolerSelectedReason': s['selectedReason'],
        'coolerFastestMeters': s['fastest']['distance'], 'coolerSelectedMeters': r['distance'],
        'coolerExtraMinutes': r['minutes'] - s['fastest']['minutes'],
        'coolerNativeArrivalShadePercentOfKnown': 100 * r['shadeMeters'] / known if known else None,
        'coolerNativeCoveragePercent': 100 * known / r['distance'],
        'coolerSnapMeters': [s['startSnapMeters'], s['endSnapMeters']],
        'sosmFootMeters': foot['distance'], 'vampireMeters': v['distance'],
        'vampireExtraMinutesAtCoolerSpeed': (v['distance'] - foot['distance']) / 80,
        'vampireSnapMeters': [w['distance'] for w in other['services']['vampire']['waypoints']],
        'vampireGeometryToWaypointMeters': [
            Point(project(*v['coordinates'][i])).distance(Point(project(*w['location'])))
            for i, w in zip([0, -1], other['services']['vampire']['waypoints'], strict=True)
        ],
        'coolerSelectedWithin8mOfVampirePercent': 100 * line_c.intersection(line_v.buffer(8)).length / line_c.length,
        'vampireWithin8mOfCoolerSelectedPercent': 100 * line_v.intersection(line_c.buffer(8)).length / line_v.length,
        'rasterOnVampireRoute': raster_route(v['coordinates']),
        'rasterOnSosmFootRoute': raster_route(foot['coordinates']),
        'rasterOnCoolerSelectedRoute': raster_route(r['coordinates']),
        'fixedFastestPathComparison': comparisons,
        'shadowmap': 'Matching 1 August date blocked by Home paywall; numerical point API is early-access. No route or route shade percentage obtained.',
    })
report = {
    'protocol': protocol, 'model': cooler['model'], 'libraryVersion': cooler['libraryVersion'],
    'raster': {'sha256': raster_hash, 'header': header,
               'url': 'https://raw.githubusercontent.com/sosm/cbf-routing-profiles/6b45390967718a4b785af11222fd0dc2688eeeac/vampire/shadows_zurich_city.asc'},
    'liveServiceRasterIdentity': 'Unknown: service responses do not expose raster/build hash. Offline raster scores must not be attributed to the deployed service.',
    'aggregation': 'Metre-weighted shade class agreement on the SAME Cooler Walks fastest geometry, sampled <=4 m. Denominator excludes unknown in either model; coverage is shown separately. Primary date is CEST, secondary is unresolved solar-time interpretation. Native Cooler estimates use arrival time and their original sample spacing.',
    'routing': 'First returned Vampire route, first SOSM foot route; Cooler qualifying shade alternative or fastest when no shade recommendation is possible. Different network versions, costs and detour policies. All times normalised to 80 m/min only when explicitly labelled.',
    'rows': rows,
}
(OUT / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
(OUT / 'point-comparisons.json').write_text(json.dumps(point_records, separators=(',', ':')) + '\n')
for r in rows:
    print(r['id'], 'ours/vampire', round(r['coolerSelectedMeters']), round(r['vampireMeters']),
          'coverage/shade', round(r['coolerNativeCoveragePercent']), round(r['coolerNativeArrivalShadePercentOfKnown']),
          'agreement CEST/solar', [round(c['agreementPercentOfComparable']) for c in r['fixedFastestPathComparison']],
          'raster shade vamp/foot', round(r['rasterOnVampireRoute']['shadePercentOfKnown']), round(r['rasterOnSosmFootRoute']['shadePercentOfKnown']))
