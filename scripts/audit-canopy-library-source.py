"""Independent original-return checks in eight Zurich districts; not field validation."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path
import laspy
import numpy as np
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'public/data/zurich-canopy-library.json').read_text())
audit=json.loads((ROOT/'docs/canopy-library-source-audit.json').read_text())
places={p['name']:p['point'] for p in json.loads((ROOT/'public/data/zurich.json').read_text())['places']}
project=Transformer.from_crs(4326,2056,always_xy=True)
records=[]
for district,address in [('Oerlikon','Hofwiesenstrasse 350'),('Altstetten','Altstetterstrasse 145'),('Höngg','Limmattalstrasse 180'),('Wipkingen','Nordstrasse 275'),('Wiedikon','Birmensdorferstrasse 91'),('University','Universitätstrasse 100'),('Centre','Bahnhofquai'),('Lakeshore','Zürichhorn')]:
    x,y=project.transform(*places[address]);tx,ty=math.floor(x/500)*500,math.floor(y/500)*500
    entry=next(a for a in audit['tiles'] if a['tile']['id']==f'{tx}_{ty}')
    tile=entry['tile'];source=entry['source']
    raw=(ROOT/('public'+tile['url'])).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==tile['sha256']
    model=json.loads(gzip.decompress(raw))
    indices=np.frombuffer(base64.b64decode(model['columns']),dtype='<u4')
    bases=np.frombuffer(base64.b64decode(model['base']),dtype='<u2');tops=np.frombuffer(base64.b64decode(model['top']),dtype='<u2')
    missing=np.unpackbits(np.frombuffer(base64.b64decode(model['unknown']),dtype=np.uint8),bitorder='little')
    occupied=np.zeros(250000,dtype=bool);occupied[indices]=True
    selected={int(indices[i]) for i in np.linspace(0,len(indices)-1,min(3,len(indices)),dtype=int)}
    for flag in [True,False]:
        choices=np.flatnonzero((missing==flag)&~occupied)
        if len(choices):selected.add(int(choices[len(choices)//2]))
    cells={i:(tx+i%500,ty+499-i//500) for i in selected}
    results={i:{'returns':0,'vegetation':[]} for i in selected}
    path=ROOT/source['localPath']
    with path.open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==source['sha256']
    with laspy.open(path) as reader:
        for cloud in reader.chunk_iterator(500_000):
            cx,cy,cz=np.asarray(cloud.x),np.asarray(cloud.y),np.asarray(cloud.z)
            valid=~np.asarray(cloud.withheld).astype(bool);classification=np.asarray(cloud.classification)
            for i,(x,y) in cells.items():
                keep=valid&(cx>=x)&(cx<x+1)&(cy>=y)&(cy<y+1)
                results[i]['returns']+=int(keep.sum())
                results[i]['vegetation'].extend(cz[keep&(classification==5)].tolist())
    for i in sorted(selected):
        values=results[i]['vegetation'];k=np.searchsorted(indices,i)
        lo=int(bases[k]) if k<len(indices) and indices[k]==i else 0
        hi=int(tops[k]) if k<len(indices) and indices[k]==i else 0
        assert lo==(math.floor((min(values)-.5)*10) if values else 0)
        assert hi==(math.ceil((max(values)+.5)*10) if values else 0)
        assert bool(missing[i])==(results[i]['returns']==0)
        records.append({'district':district,'tileId':tile['id'],'tileSha256':tile['sha256'],'sourceSha256':source['sha256'],'index':i,'baseDm':lo,'topDm':hi,'unknown':bool(missing[i]),'x':cells[i][0],'y':cells[i][1],'allReturns':results[i]['returns'],'vegetationReturns':len(values),'rawMin':min(values) if values else None,'rawMax':max(values) if values else None})
    print(district,len(selected),'source columns match',flush=True)
report={'schema':1,'version':manifest['version'],'manifestSha256':hashlib.sha256((ROOT/'public/data/zurich-canopy-library.json').read_bytes()).hexdigest(),'method':'Independent coordinate selection from original non-withheld LAS returns in eight districts. Three vegetation columns plus scan-gap/open columns where available. No field-accuracy claim.','columns':records}
(ROOT/'tests/fixtures/canopy-library-source-reference.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(len(records),'independently checked columns')
