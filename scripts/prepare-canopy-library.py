"""Reproducible tiled expansion. The original lakeshore artifact/audits stay unchanged.

Four concurrent official source requests at most, bounded files, verified reusable
raw files and independent 500 m tiles. --fetch authorizes missing source downloads.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import time
import laspy
import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-canopy'
OUT = ROOT / 'public/data/zurich-canopy'
CONFIG = json.loads((ROOT / 'scripts/canopy-library.json').read_text())

def atomic_bytes(path, value):
    temporary = path.with_name(path.name + '.part')
    temporary.write_bytes(value)
    temporary.replace(path)

def atomic_text(path, value):
    atomic_bytes(path, value.encode('utf8'))

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def prepare(pair, allow_fetch):
    x, y = pair
    name = f'{x}_{y}'
    record_path = RAW / f'{name}.source.json'
    path = RAW / f'{name}.laz'
    if record_path.exists():
        source = json.loads(record_path.read_text())
        path = ROOT / source['localPath']
        if sha(path) != source['sha256']:
            raise ValueError(f'Changed cached source: {name}')
    else:
        if not allow_fetch:
            raise ValueError(f'Missing source: {name}; use --fetch')
        url = CONFIG['source'] + name + '.laz'
        for attempt in range(3):
            try:
                with requests.get(url, stream=True, timeout=(30, 150)) as response:
                    response.raise_for_status()
                    size = 0
                    with path.with_suffix('.part').open('wb') as stream:
                        for chunk in response.iter_content(1024 * 1024):
                            size += len(chunk)
                            if size > 200_000_000:
                                raise ValueError(f'Unexpected tile size: {name}')
                            stream.write(chunk)
                path.with_suffix('.part').replace(path)
                break
            except requests.RequestException:
                if attempt == 2: raise
                time.sleep(2 * (attempt + 1))
        source = {'name': name + '.laz', 'url': url, 'sha256': sha(path), 'bytes': path.stat().st_size,
                  'verifiedAt': datetime.now(timezone.utc).isoformat(), 'localPath': str(path.relative_to(ROOT)), 'epoch': CONFIG['epoch']}
        atomic_text(record_path, json.dumps(source, indent=2) + '\n')
    target = OUT / f'{name}.canopy'
    audit_path = RAW / f'{name}.derived-v2.json'
    if target.exists() and audit_path.exists():
        audit = json.loads(audit_path.read_text())
        if audit['sourceSha256'] == source['sha256'] and audit['config'] == CONFIG and sha(target) == audit['tile']['sha256']:
            return audit
    size = CONFIG['tileSize']
    count = size * size
    low = np.full(count, 65535, dtype='<u2')
    high = np.zeros(count, dtype='<u2')
    observed = np.zeros(count, dtype=bool)
    returns = 0
    with laspy.open(path) as reader:
        crs = reader.header.parse_crs()
        if not crs or [c.to_epsg() for c in crs.sub_crs_list] != [2056, 5728]:
            raise ValueError(f'Unexpected CRS: {name}')
        if reader.header.mins[0] < x or reader.header.maxs[0] >= x + size or reader.header.mins[1] < y or reader.header.maxs[1] >= y + size:
            raise ValueError(f'Unexpected source extent: {name}')
        source = {**source, 'points':reader.header.point_count, 'lasCreationDate':str(reader.header.creation_date), 'crs':'EPSG:2056 + EPSG:5728'}
        for cloud in reader.chunk_iterator(500_000):
            cx, cy, cz = np.asarray(cloud.x), np.asarray(cloud.y), np.asarray(cloud.z)
            valid = ~np.asarray(cloud.withheld).astype(bool)
            valid &= (cx >= x) & (cx < x + size) & (cy >= y) & (cy < y + size)
            def indices(mask):
                return (y + size - 1 - np.floor(cy[mask]).astype(int)) * size + np.floor(cx[mask]).astype(int) - x
            observed[indices(valid)] = True
            keep = valid & (np.asarray(cloud.classification) == CONFIG['classification'])
            z = cz[keep]
            if not np.all((z > 300) & (z < 2000)):
                raise ValueError(f'Unexpected canopy heights: {name}')
            index = indices(keep)
            np.minimum.at(low, index, np.floor((z - CONFIG['verticalPaddingMeters']) * 10).astype('<u2'))
            np.maximum.at(high, index, np.ceil((z + CONFIG['verticalPaddingMeters']) * 10).astype('<u2'))
            returns += len(z)
    occupied = np.flatnonzero(high).astype('<u4')
    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    bounds = [x,y,x+size,y+size]
    payload = {'schema':1,'version':CONFIG['version'],'cityId':CONFIG['cityId'],'crs':CONFIG['crs'],'verticalDatum':CONFIG['verticalDatum'],
               'bounds':bounds,'resolution':1,'width':size,'height':size,'columns':b64(occupied),'base':b64(low[occupied]),'top':b64(high[occupied]),
               'unknown':b64(np.packbits(~observed, bitorder='little')),'maxZ':max(1,float(high.max())/10),
               'scenario':CONFIG['scenario'],'epoch':CONFIG['epoch']}
    raw = (json.dumps(payload,separators=(',',':'))+'\n').encode()
    packed = gzip.compress(raw,compresslevel=9,mtime=0)
    atomic_bytes(target, packed)
    tile = {'id':name,'bounds':bounds,'url':f'/data/zurich-canopy/{name}.canopy','bytes':len(packed),'expandedBytes':len(raw),
            'sha256':hashlib.sha256(packed).hexdigest(),'maxZ':payload['maxZ'],'unknownCells':int((~observed).sum())}
    audit = {'tile':tile,'source':source,'sourceSha256':source['sha256'],'config':CONFIG,'columns':len(occupied),'vegetationReturns':returns}
    atomic_text(audit_path, json.dumps(audit,indent=2)+'\n')
    return audit

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true')
    args = parser.parse_args()
    RAW.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
    w,s,e,n = CONFIG['bounds']; step=CONFIG['tileSize']
    tiles=[(x,y) for x in range(w,e,step) for y in range(s,n,step)]
    audits=[]
    errors=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending={pool.submit(prepare,p,args.fetch):p for p in tiles}
        for future in as_completed(pending):
            try:
                audit=future.result()
            except Exception as error:
                errors.append((pending[future],str(error)))
                print(f'ERROR {pending[future]}: {error}',flush=True)
                continue
            audits.append(audit)
            print(f'{len(audits)}/{len(tiles)} {audit["tile"]["id"]} {audit["tile"]["bytes"]} bytes',flush=True)
    if errors:
        raise RuntimeError(f'{len(errors)} source tiles failed; completed tiles are reusable: {errors}')
    audits.sort(key=lambda a:a['tile']['id'])
    library={'schema':2,'version':CONFIG['version'],'cityId':CONFIG['cityId'],'crs':CONFIG['crs'],'verticalDatum':CONFIG['verticalDatum'],
             'bounds':CONFIG['bounds'],'tileSize':step,'resolution':1,'scenario':CONFIG['scenario'],'epoch':CONFIG['epoch'],
             'tiles':[a['tile'] for a in audits]}
    path=ROOT/'public/data/zurich-canopy-library.json'
    atomic_text(path, json.dumps(library,separators=(',',':'))+'\n')
    catalog={'format':'library','dataUrl':'/data/zurich-canopy-library.json','version':CONFIG['version'],'crs':CONFIG['crs'],'verticalDatum':CONFIG['verticalDatum'],
             'bytes':path.stat().st_size,'sha256':sha(path),'downloadBytes':sum(t['bytes'] for t in library['tiles'])}
    atomic_text(ROOT/'src/generated/canopy-catalog.json', json.dumps(catalog,indent=2)+'\n')
    report={'config':CONFIG,'tiles':audits,'sourceRectangleKm2':(e-w)*(n-s)/1e6,'sourceBytes':sum(a['source']['bytes'] for a in audits),
            'columns':sum(a['columns'] for a in audits),'vegetationReturns':sum(a['vegetationReturns'] for a in audits),
            'unknownCells':sum(a['tile']['unknownCells'] for a in audits),'downloadBytes':catalog['downloadBytes'],'catalog':catalog}
    atomic_text(ROOT/'docs/canopy-library-source-audit.json', json.dumps(report,indent=2)+'\n')
    print('Complete',len(audits),'tiles;',catalog['downloadBytes'],'compressed bytes',flush=True)

if __name__=='__main__': main()
