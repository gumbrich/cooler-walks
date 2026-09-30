"""Bounded, resumable downloads from the official product-555 tile directory.

No export orders, account, notification email or runtime provider dependency.
The source rectangle supplies ground and a casting buffer around the walking area.
The official WCS exposes DTM 2022 at 2 m; downloaded native 25 cm tiles are
retained as independent resampling references. No live WCS dependency is added.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import requests
import rasterio

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-shade-library'
URL = 'https://maps.zh.ch/download/hoehen/2022/dtm/tif/'
WCS = 'https://wms.zh.ch/DEMWCS'
PARAMS = {'SERVICE':'WCS','VERSION':'1.0.0','REQUEST':'GetCoverage','COVERAGE':'dtm',
          'CRS':'EPSG:2056','RESPONSE_CRS':'EPSG:2056','RESX':2,'RESY':2,'FORMAT':'GeoTIFF','INTERPOLATION':'bilinear'}


def fetch(pair):
    x, y = pair
    path = RAW / f'{x}_{y}.tif'
    meta = path.with_suffix('.source.json')
    if path.exists() and meta.exists():
        record = json.loads(meta.read_text())
        with path.open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual == record['sha256']:
            return record
        # Interrupted/overlapping downloads are never accepted as source data.
        path.replace(path.with_suffix('.rejected'))
        meta.replace(meta.with_suffix('.rejected'))
        print('Replacing unverified source', path.name, flush=True)
    for attempt in range(3):
        try:
            with requests.get(WCS, params={**PARAMS,'BBOX':f'{x},{y},{x+500},{y+500}'}, stream=True, timeout=(30, 90)) as response:
                response.raise_for_status()
                tmp = path.with_suffix('.part')
                h, size = hashlib.sha256(), 0
                with tmp.open('wb') as f:
                    for chunk in response.iter_content(1024*1024):
                        size += len(chunk)
                        if size > 40_000_000:
                            raise ValueError('Unexpectedly large terrain tile')
                        h.update(chunk); f.write(chunk)
                with rasterio.open(tmp) as src:
                    if src.crs.to_epsg() != 2056 or tuple(src.bounds) != (x,y,x+500,y+500) or src.res != (2,2):
                        raise ValueError('Unexpected terrain CRS, grid or bounds')
                tmp.replace(path)
                record = {'url': response.url, 'service': 'WCS DTM 2022, bilinear request at 2 m', 'resolutionMeters': 2, 'sha256': h.hexdigest(), 'bytes': size,
                          'fetchedAt': datetime.now(timezone.utc).isoformat(), 'observation': '2021–2022'}
                meta.write_text(json.dumps(record, indent=2)+'\n')
                print('Fetched', path.name, size, flush=True)
                return record
        except requests.RequestException:
            if attempt == 2: raise
            time.sleep(2*(attempt+1))


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    response = requests.get(WCS, params={'SERVICE':'WCS','REQUEST':'GetCapabilities','VERSION':'1.0.0'}, timeout=30)
    response.raise_for_status()
    if '<label>DTM 2022</label>' not in response.text:
        raise ValueError('WCS source epoch changed; inspect before preparing a new model')
    (RAW / 'wcs-capabilities.xml').write_bytes(response.content)
    tiles = [(x,y) for x in range(2677000,2686000,500) for y in range(1245000,1254000,500)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(fetch, tiles))
    (RAW / 'sources.json').write_text(json.dumps(sources, indent=2)+'\n')
    print('Verified', len(sources), 'source tiles', flush=True)


if __name__ == '__main__': main()
