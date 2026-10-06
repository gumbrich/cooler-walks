"""Exploratory Vampire-raster comparison, with both published-time interpretations.

Requires the ignored public raster. Does not call commercial APIs or submit forms.
The author describes a radiation threshold; this is not a field truth label.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
import pandas as pd
import pvlib

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-pavements'
path = RAW / 'vampire-shadows.asc'
if not path.exists():
    raise SystemExit('Download the pinned public raster using the command in docs/pavement-pilot.md first.')
source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
if source_hash != 'cfc33982cb2177c5d6304ea5a4f26c390ccda789463d0e74e89478e8414e188b':
    raise SystemExit('The pinned comparison raster changed; review its provenance first.')
network = json.loads((ROOT / 'public/data/zurich-pavements.json').read_text())
lon = (network['bounds'][0]+network['bounds'][2])/2
lat = (network['bounds'][1]+network['bounds'][3])/2
day = datetime(2024, 8, 1, tzinfo=timezone.utc)
spa = pvlib.solarposition.spa_python(pd.DatetimeIndex([day+timedelta(hours=14)]),lat,lon,pressure=0,delta_t=69.184).iloc[0]
# GRASS r.sun defaults to local solar time unless civil_time was provided.
solar_16 = day + timedelta(hours=16-lon/15-float(spa.equation_of_time)/60)
instants = [(day+timedelta(hours=14)).isoformat(), solar_16.isoformat()]
(RAW / 'comparison-protocol.json').write_text(json.dumps({'instants':instants}))
subprocess.run(['node','--import','tsx','scripts/export-pavement-comparison.ts'],cwd=ROOT,check=True)
predictions = json.loads((RAW / 'comparison-points.json').read_text())
with path.open() as stream:
    header = dict((a.lower(),float(b)) for a,b in (stream.readline().split() for _ in range(6)))
    raster = np.loadtxt(stream)
assert raster.shape == (int(header['nrows']),int(header['ncols']))
known = raster[raster != header['nodata_value']]
results = []
for label, prediction in zip(['16:00 Europe/Zurich (CEST)', '16:00 local solar time at pilot centre'],predictions['results']):
    matrix = Counter()
    rows = []
    for sample in prediction['samples']:
        x,y = sample['point'];col=int(np.floor((x-header['xllcorner'])/header['cellsize']))
        row=int(header['nrows'])-1-int(np.floor((y-header['yllcorner'])/header['cellsize']))
        value = float(raster[row,col]) if 0<=row<raster.shape[0] and 0<=col<raster.shape[1] else None
        if value == header['nodata_value']: value=None
        proxy = None if value is None else 'shade' if value < 100 else 'sun'
        matrix[f"{sample['exposure']}/{proxy or 'unknown'}"] += 1
        rows.append(dict(sample,externalRasterValue=value,externalThresholdClass=proxy))
    compared = sum(n for key,n in matrix.items() if all(k in ['sun','shade'] for k in key.split('/')))
    same = matrix['sun/sun']+matrix['shade/shade']
    results.append({'timeInterpretation':label,'instant':prediction['instant'],'samples':len(rows),
        'comparable':compared,'agreement':same,'disagreement':compared-same,'matrixCoolerWalksThenVampire':dict(matrix),
        'pointComparisons':rows})
report={'networkVersion':network['version'],'model':predictions['model'],
    'raster':{'repositoryCommit':'6b45390967718a4b785af11222fd0dc2688eeeac',
        'url':'https://raw.githubusercontent.com/sosm/cbf-routing-profiles/6b45390967718a4b785af11222fd0dc2688eeeac/vampire/shadows_zurich_city.asc',
        'sha256':source_hash,'header':header,
        'minimum':float(known.min()),'maximum':float(known.max()),'threshold':100},
    'methodSource':'https://geobeer.ch/slides/46/lightning-talks.pdf#page=17',
    'timeSource':'https://geobeer.ch/slides/46/lightning-talks.pdf#page=20',
    'timeConventionReference':'https://grass.osgeo.org/grass-stable/manuals/r.sun.html',
    'sampling':predictions['sampling'],'results':results,
    'limitations':['Exploratory model comparison, not accuracy.','The public ASC has no embedded timestamp, radiation-channel or civil_time setting; both time interpretations are retained.',
        'The talk describes a radiation threshold, not direct geometric visibility. Its units are ambiguous relative to r.sun mode-1 irradiance.',
        'External DSM includes vegetation and surface shape; Cooler Walks currently estimates buildings only at ground.',
        'Nearest raster cell includes resampling and georeferencing differences; disagreements do not establish which model is correct.',
        'The public profile contains a different hardcoded extent from the ASC header. This comparison uses the ASC header, not that profile.'],
    'shadowmap':{'status':'not compared: API partner access required','source':'https://shadowmap.org/api',
        'next':'Request documented point/time API access, Zurich data version, receiver height, batch limits and caching rights; run the same frozen points and retain unknowns.'}}
(ROOT / 'docs/pavement-tool-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print([{k:v for k,v in r.items() if k!='pointComparisons'} for r in results])
