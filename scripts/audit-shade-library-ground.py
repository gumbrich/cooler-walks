"""Check WCS delivery against independent native 25 cm source tiles.

The WCS advertises a 0.5 m service grid. Do not assume that its requested 2 m
values match native area means: test that claim across west, centre, north and
east, and keep missing-data masks separate from elevation errors.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import requests
import numpy as np
import rasterio

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw/zurich-shade-library'
AUDIT=RAW/'ground-audit'
AUDIT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('fetch',ROOT/'scripts/fetch-zurich-shade-library.py')
fetch=importlib.util.module_from_spec(spec);spec.loader.exec_module(fetch)


def download(url,path,params=None):
    if not path.exists():
        r=requests.get(url,params=params,timeout=90);r.raise_for_status()
        tmp=path.with_suffix('.part');tmp.write_bytes(r.content);tmp.replace(path)
    return path


def check(pair):
    x,y=pair
    name=f'{x}_{y}.tif'
    existing=RAW/name
    with rasterio.open(existing) as src: native=src.res==(.25,.25)
    source=existing if native else download(fetch.URL+name,AUDIT/('native-'+name))
    response=download(fetch.WCS,AUDIT/('wcs-'+name),{**fetch.PARAMS,'BBOX':f'{x},{y},{x+500},{y+500}'})
    with rasterio.open(source) as src:
        assert src.res==(.25,.25) and tuple(src.bounds)==(x,y,x+500,y+500)
        pixels=src.read(1).astype(np.float64)
        mask=src.read_masks(1)==255
    # Independent strided sum rather than the ingestion reshape/reduce.
    mean=np.zeros((250,250)); valid=np.ones((250,250),dtype=bool)
    for row in range(8):
        for col in range(8):
            mean+=pixels[row::8,col::8]/64
            valid &= mask[row::8,col::8]
    with rasterio.open(response) as src:
        assert src.crs.to_epsg()==2056 and tuple(src.bounds)==(x,y,x+500,y+500) and src.res==(2,2)
        delivered=src.read(1); delivered_valid=src.read_masks(1)==255
    delta=abs(delivered[valid&delivered_valid]-mean[valid&delivered_valid])
    digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    report={'tile':name,'cellsCompared':len(delta),'maxDifferenceMeters':float(delta.max()),
            'p95DifferenceMeters':float(np.quantile(delta,.95)),
            'validityMasksEqual':bool(np.array_equal(valid,delivered_valid)),
            'nativeUrl':fetch.URL+name,'nativeSha256':digest(source),
            'wcsUrl':requests.Request('GET',fetch.WCS,params={**fetch.PARAMS,'BBOX':f'{x},{y},{x+500},{y+500}'}).prepare().url,
            'wcsSha256':digest(response)}
    report['passed']=report['validityMasksEqual'] and report['maxDifferenceMeters']<=.001
    print(report['tile'],report['maxDifferenceMeters'],report['passed'],flush=True)
    return report


def main():
    # Frozen stratification before reading delivery differences.
    samples=[(2677000,1245000),(2677000,1253000),(2677500,1248000),(2678000,1250000),
             (2682000,1246000),(2682000,1248000),(2683000,1247500),
             (2682000,1252000),(2685000,1252500),(2684500,1245500)]
    with ThreadPoolExecutor(max_workers=3) as pool: records=list(pool.map(check,samples))
    report={'checkedAt':datetime.now(timezone.utc).isoformat(),'toleranceMeters':.001,
            'cellsCompared':sum(r['cellsCompared'] for r in records),'tiles':records,
            'passed':all(r['passed'] for r in records),
            'scope':'Source-delivery and resampling equivalence, not field accuracy. WCS requests name DTM 2022; provider changes must be reviewed.'}
    (ROOT/'docs/shade-library-ground-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    if not report['passed']:raise SystemExit('Terrain equivalence failed; investigate before release')


if __name__=='__main__':main()
