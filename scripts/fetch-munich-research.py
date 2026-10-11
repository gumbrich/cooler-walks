"""Bounded official samples for canopy/count feasibility; never app dependencies."""
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.parse import urlencode
from urllib.request import urlopen

RAW = Path('data/raw/munich-extensions')
RAW.mkdir(parents=True, exist_ok=True)
def fetch(name, url, limit):
    path = RAW / name
    if not path.exists():
        with urlopen(url, timeout=120) as r:
            body = r.read(limit + 1)
        if len(body) > limit: raise ValueError('Research sample exceeds bound')
        path.write_bytes(body)
    return path

laser = RAW / '692_5337.laz'
expected = 'a063fd9c9d2427cfb87655390a935375cd217986349c337524f0ef660616a522'
if not laser.exists() or laser.stat().st_size != 145914574:
    for attempt in range(4):
        if subprocess.run(['curl', '-fsSL', '-C', '-', '--max-time', '600',
            'https://geodaten.bayern.de/odd_data/laser/692_5337.laz', '-o', str(laser)]).returncode == 0: break
    else: raise ValueError('Laser sample incomplete')
if hashlib.sha256(laser.read_bytes()).hexdigest() != expected:
    raise ValueError('Laser sample publication changed')
params = dict(service='WMS', version='1.3.0', request='GetMap', layers='by_dop20cir', styles='',
    crs='EPSG:25832', bbox='692000,5337000,693000,5338000', width=2000, height=2000, format='image/png')
base = 'https://geoservices.bayern.de/od/wms/dop/v1/dop20?'
fetch('cir-692_5337.png', base + urlencode(params), 20_000_000)
params.update(request='GetFeatureInfo', query_layers='by_dop20_info', info_format='text/html', i=1000, j=1000)
fetch('cir-692_5337-info.html', base + urlencode(params), 100_000)
params = dict(service='WFS', version='2.0.0', request='GetFeature',
    typenames='BAYSIS_Verkehrsdaten:svz2021_zaehlstellen', srsName='EPSG:25832',
    bbox='688000,5332000,696000,5340000,EPSG:25832', count=1000)
fetch('baysis-counts.gml', 'https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer?' + urlencode(params), 3_000_000)
print('Munich research samples available; review dates and hashes before interpreting results.')
