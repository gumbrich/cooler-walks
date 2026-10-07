"""Independently check selected runtime columns against the classified source returns.
No import from the preparation script. Sampling checks ingestion, not field accuracy.
"""
import base64
import hashlib
import json
import math
from pathlib import Path
import laspy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
audit = json.loads((ROOT / 'docs/canopy-source-audit.json').read_text())
raw = (ROOT / 'public/data/zurich-canopy.json').read_bytes()
model = json.loads(raw)
indices = np.frombuffer(base64.b64decode(model['columns']), dtype='<u4')
bases = np.frombuffer(base64.b64decode(model['base']), dtype='<u2')
tops = np.frombuffer(base64.b64decode(model['top']), dtype='<u2')
missing = np.unpackbits(np.frombuffer(base64.b64decode(model['unknown']), dtype=np.uint8), bitorder='little')[:model['width']*model['height']]
west, south, east, north = model['bounds']
xs = west + indices % model['width']
ys = north - 1 - indices // model['width']
records = []
for source in audit['sources']:
    tx, ty = map(int, source['name'].removesuffix('.laz').split('_'))
    path = ROOT / source['localPath']
    with path.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == source['sha256']
    inside = np.flatnonzero((xs >= tx) & (xs < tx+500) & (ys >= ty) & (ys < ty+500))
    selected = inside[np.linspace(0,len(inside)-1,3,dtype=int)] if len(inside) else []
    cells = {(int(xs[i]),int(ys[i])): {'index':int(indices[i]), 'baseDm':int(bases[i]), 'topDm':int(tops[i]),'unknown':False} for i in selected}
    # One scan gap and one observed non-vegetation column per tile, where present.
    for is_missing in [True,False]:
        for y in range(ty,ty+500):
            found = False
            for x in range(tx,tx+500):
                idx = (north-1-y)*model['width']+x-west
                k = np.searchsorted(indices,idx)
                if bool(missing[idx]) == is_missing and (k == len(indices) or indices[k] != idx):
                    cells[(x,y)] = {'index':idx,'baseDm':0,'topDm':0,'unknown':is_missing}
                    found = True
                    break
            if found: break
    results = {cell: {'returns':0,'vegetation':[]} for cell in cells}
    with laspy.open(path) as reader:
        for cloud in reader.chunk_iterator(500_000):
            x,y,z=np.asarray(cloud.x),np.asarray(cloud.y),np.asarray(cloud.z)
            valid=~np.asarray(cloud.withheld).astype(bool)
            classification=np.asarray(cloud.classification)
            for (cx,cy), result in results.items():
                keep=valid & (x>=cx) & (x<cx+1) & (y>=cy) & (y<cy+1)
                result['returns']+=int(keep.sum())
                result['vegetation'].extend(z[keep & (classification == 5)].tolist())
    for (x,y),expected in cells.items():
        result=results[(x,y)]
        values=result['vegetation']
        lo=math.floor((min(values)-0.5)*10) if values else 0
        hi=math.ceil((max(values)+0.5)*10) if values else 0
        assert lo==expected['baseDm'] and hi==expected['topDm']
        assert (result['returns']==0)==expected['unknown']
        records.append({'source':source['name'],'x':x,'y':y,**expected,'allReturns':result['returns'],'vegetationReturns':len(values),'rawMin':min(values) if values else None,'rawMax':max(values) if values else None})
    print(source['name'],len(cells),'columns match',flush=True)
report={'schema':1,'method':'Independent coordinate selection from original non-withheld LAS returns; three vegetation envelopes, one scan gap and one non-vegetation column per tile where present. Not field validation.','assetSha256':hashlib.sha256(raw).hexdigest(),'columns':records}
(ROOT / 'tests/fixtures/canopy-source-reference.json').write_text(json.dumps(report,indent=2)+'\n')
print(len(records),'independently checked columns')
