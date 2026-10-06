"""Check pilot samples with original CityGML polygons and independent NREL SPA.

Raw source archives stay ignored. The small derived reference fixture can run in
CI without downloading them. Agreement is an implementation check, not field accuracy.
"""
from datetime import datetime, timezone
import importlib.util
import json
import math
from pathlib import Path
import numpy as np
import pandas as pd
import pvlib
from shapely.geometry import LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-shadow-sources.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
predictions = json.loads((ROOT / 'data/raw/zurich-pavements/predictions.json').read_text())
# Preserve the frozen original comparison when auditing a later network.
suffix = '' if predictions['networkVersion'].endswith('-v1') else '-expansion'
sources = json.loads((ROOT / 'docs/shade-library-data.json').read_text())
rows = [r for r in predictions['rays'] if r['ground'] is not None and r['altitude'] >= math.radians(10)]
lines = []
for row in rows:
    x, y = row['point']
    reach = max(0, (predictions['maxZ'] - row['ground']) / math.tan(row['altitude']))
    lines.append(LineString([[x, y], [x + reach * math.sin(row['azimuth']), y + reach * math.cos(row['azimuth'])]]).buffer(2))
faces = audit.SourceFaces(predictions['bounds'], {'roofsAndFacades': sources['buildingsSource'],
    'rejectedBuildings': sources['rejectedBuildings']}, query_region=unary_union(lines))
faces.max_z = predictions['maxZ']
records, mismatches, boundaries, solar_errors, solar_changes = [], [], [], [], []
for row in rows:
    expected, building = faces.exposure(row, predictions['bounds'])
    if expected == 'boundary':
        boundaries.append(row['id'])
        continue
    if expected != row['geometryExposure']:
        mismatches.append(dict(row, expected=expected, building=building))
    records.append({k: row[k] for k in ['point', 'ground', 'altitude', 'azimuth']} | {'expected': expected})
    lon, lat = row['geographic']
    ref = pvlib.solarposition.spa_python(pd.DatetimeIndex([row['instant']]), lat, lon,
                                       pressure=0, delta_t=69.184).iloc[0]
    altitude, azimuth = np.radians([ref.elevation, ref.azimuth])
    def direction(a, z):
        return np.array([math.cos(a)*math.sin(z), math.cos(a)*math.cos(z), math.sin(a)])
    error = math.degrees(math.acos(float(np.clip(direction(altitude, azimuth) @ direction(row['altitude'], row['trueAzimuth']), -1, 1))))
    solar_errors.append(error)
    independent = dict(row, altitude=float(altitude), azimuth=float(azimuth + row['azimuth'] - row['trueAzimuth']))
    spa_exposure, _ = faces.exposure(independent, predictions['bounds'])
    if spa_exposure != expected:
        solar_changes.append({'id': row['id'], 'suncalc': expected, 'spa': spa_exposure})
report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'networkVersion': predictions['networkVersion'],
    'libraryVersion': predictions['libraryVersion'], 'sourceManifestSha256': sources['manifestSha256'],
    'queries': len(rows), 'stableComparisons': len(records), 'sourceBuildingsCompared': faces.building_count,
    'excludedWithin2cmOfFaceEdge': boundaries, 'geometryMismatches': mismatches,
    'solarReference': 'pvlib NREL SPA, geometric elevation, pressure=0, delta_t=69.184 s',
    'maximumSolarDirectionDifferenceDegrees': max(solar_errors), 'solarClassificationChanges': solar_changes,
    'passed': bool(records) and not mismatches and max(solar_errors) <= .25,
    'scope': 'Original source polygons versus tiled triangles at actual pavement samples. Same historical buildings and receiver ground; not independent field observations. SPA classifications may differ near moving shadow edges.'}
(ROOT / f'docs/pavement-shadow-audit{suffix}.json').write_text(json.dumps(report, indent=2) + '\n')
(ROOT / f'tests/fixtures/pavement-shade-reference{suffix}.json').write_text(json.dumps({
    'networkVersion': predictions['networkVersion'], 'libraryVersion': predictions['libraryVersion'],
    'sourceManifestSha256': sources['manifestSha256'], 'cases': records}, separators=(',', ':')) + '\n')
print({k: v for k, v in report.items() if k not in ['geometryMismatches', 'solarClassificationChanges', 'excludedWithin2cmOfFaceEdge']}, flush=True)
print('mismatches:', len(mismatches), 'SPA classification differences:', len(solar_changes), flush=True)
if not report['passed']:
    raise SystemExit('Pavement shadow reference check failed; inspect the recorded discrepancies.')
