"""Ten small OSRM requests for the fixed five-pair diagnostic (never a runtime dependency)."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/shade-service-comparison'
RAW.mkdir(parents=True, exist_ok=True)
protocol = json.loads((ROOT / 'scripts/shade-service-cases.json').read_text())
with urllib.request.urlopen('https://routing.osm.ch/bundle.js', timeout=40) as response:
    frontend = response.read()
(RAW / 'frontend.js').write_bytes(frontend)
records = []
for case in protocol['cases']:
    services = {}
    for profile in ['foot', 'vampire']:
        coords = ';'.join(','.join(map(str, p)) for p in [case['a'], case['b']])
        url = f'https://routing.osm.ch/routed-{profile}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true&alternatives=true'
        request = urllib.request.Request(url, headers={'User-Agent': 'CoolerWalks-research/0.15 (five Zurich route pairs)'})
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read()
        fetched = datetime.now(timezone.utc).isoformat()
        (RAW / f'{case["id"]}-{profile}.json').write_bytes(raw)
        result = json.loads(raw)
        assert result['code'] == 'Ok' and result['routes']
        services[profile] = {
            'url': url, 'fetchedAt': fetched, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'dataVersion': result.get('data_version'),
            'waypoints': [{k: v for k, v in w.items() if k != 'hint'} for w in result['waypoints']],
            'routes': [{
                'distance': r['distance'], 'apiDurationSeconds': r['duration'],
                'configuredWalkingMinutes': r['distance'] / (4000 / 60 if profile == 'vampire' else 4500 / 60),
                'coordinates': r['geometry']['coordinates'],
                'streets': [s.get('name', '') for leg in r['legs'] for s in leg.get('steps', [])],
                'weightName': r.get('weight_name'), 'weight': r.get('weight'),
            } for r in result['routes']],
        }
        print(case['id'], profile, [r['distance'] for r in services[profile]['routes']], flush=True)
        time.sleep(1)
    records.append({'id': case['id'], 'services': services})
report = {
    'protocol': protocol, 'source': 'https://routing.osm.ch/',
    'attribution': 'Route geometry © OpenStreetMap contributors, ODbL; service Swiss OpenStreetMap Association.',
    'configuration': 'Public bundle.js: /routed-foot/route/v1, /routed-vampire/route/v1; default profile path driving is statically overridden by each extracted walking backend. Profile-selection UI uses 4.5 km/h (foot) and 4 km/h (vampire). Direct permalink initially displays raw API duration until profile selection; configuredWalkingMinutes is not asserted to be the observed UI value.',
    'frontendSha256': hashlib.sha256(frontend).hexdigest(),
    'records': records,
}
(ROOT / 'docs/validation/shade-services/external-routes.json').write_text(json.dumps(report, indent=2) + '\n')
