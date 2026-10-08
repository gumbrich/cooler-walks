"""Optional refresh: exactly two public OSRM queries for the fixed lakeshore pair."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
protocol = json.loads((ROOT / 'scripts/shade-service-cases.json').read_text())
case = next(c for c in protocol['cases'] if c['id'] == 'lakeshore')
out = ROOT / 'docs/validation/tree-shade-comparison'
rawdir = ROOT / 'data/raw/tree-shade-comparison'
out.mkdir(parents=True, exist_ok=True)
rawdir.mkdir(parents=True, exist_ok=True)
services = {}
for profile in ['foot', 'vampire']:
    coords = ';'.join(','.join(map(str, p)) for p in [case['a'], case['b']])
    url = f'https://routing.osm.ch/routed-{profile}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true&alternatives=true'
    request = urllib.request.Request(url, headers={'User-Agent': 'CoolerWalks-research/0.16 (one Zurich lakeshore pair)'})
    with urllib.request.urlopen(request, timeout=40) as response:
        raw = response.read()
    data = json.loads(raw)
    assert data['code'] == 'Ok' and data['routes']
    (rawdir / f'{profile}.json').write_bytes(raw)
    services[profile] = {
        'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'responseSha256': hashlib.sha256(raw).hexdigest(), 'dataVersion': data.get('data_version'),
        'waypoints': [{k: v for k, v in w.items() if k != 'hint'} for w in data['waypoints']],
        'routes': [{'distance': r['distance'], 'apiDurationSeconds': r['duration'], 'coordinates': r['geometry']['coordinates'],
                    'weightName': r.get('weight_name'), 'weight': r.get('weight'),
                    'streets': [s.get('name', '') for leg in r['legs'] for s in leg.get('steps', [])]} for r in data['routes']],
    }
    print(profile, [r['distance'] for r in services[profile]['routes']])
report = {
    'case': case, 'services': services,
    'attribution': 'Route geometry © OpenStreetMap contributors, ODbL; service Swiss OpenStreetMap Association.',
    'limits': 'The live service returns no shade fraction or raster identity. API duration is not sunlight exposure. First returned route retained without selecting alternatives.',
}
(out / 'external-routes.json').write_text(json.dumps(report, indent=2) + '\n')
