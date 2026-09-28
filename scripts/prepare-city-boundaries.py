"""Retain the official Cambridge boundary in the shared city configuration.

The municipal GitHub GeoJSON is WGS84, unlike its StatePlane source geodatabase.
Only round to seven decimal places (~1 cm); do not generalize legal coverage.
"""
import json
from pathlib import Path

source = json.loads(Path('data/raw/cambridge-boundary.geojson').read_text())
assert len(source['features']) == 1
geometry = source['features'][0]['geometry']
assert geometry['type'] == 'Polygon'
rings = [[[round(x, 7), round(y, 7)] for x, y, *_ in ring] for ring in geometry['coordinates']]
assert all(-72 < x < -70 and 42 < y < 43 for ring in rings for x, y in ring)
target = Path('src/lib/coverage/cambridge.json')
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps([rings], separators=(',', ':')) + '\n')
print('Cambridge boundary:', len(rings), 'rings;', sum(map(len, rings)), 'vertices')
