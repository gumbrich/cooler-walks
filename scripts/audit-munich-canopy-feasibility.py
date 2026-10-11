"""Screen a real laser/CIR sample; no derived canopy enters routing.

Requires requirements-validation-review.txt and fetch-munich-research.py.
Colour agreement is source screening, not a tree-classification accuracy score.
"""
from pathlib import Path
import json,hashlib,laspy,numpy as np,rasterio
from PIL import Image
from datetime import datetime,timedelta,timezone
raw=Path('data/raw/munich-extensions')
p=raw/'692_5337.laz'
assert hashlib.sha256(p.read_bytes()).hexdigest() == 'a063fd9c9d2427cfb87655390a935375cd217986349c337524f0ef660616a522'
assert hashlib.sha256((raw/'cir-692_5337.png').read_bytes()).hexdigest() == 'e1660999077217a90012631597929763cb2b4750094d799ce1344f352d2ac436'
assert '24.08.2024' in (raw/'cir-692_5337-info.html').read_text()
l=laspy.read(p)
assert int(l.header.global_encoding.gps_time_type) == 1
rgb=np.asarray(Image.open(raw/'cir-692_5337.png')).astype(float)[:,:,:3]
x=np.asarray(l.x);y=np.asarray(l.y);z=np.asarray(l.z)
c=np.clip(((x-692000)*2).astype(int),0,1999);r=np.clip(((5338000-y)*2).astype(int),0,1999)
# Display-channel contrast only: this WMS image is rendered, not calibrated reflectance.
red=rgb[r,c,0];green=rgb[r,c,1]
vegetation=(red-green)/(red+green+1)>0.10
objects=np.asarray(l.classification)==20
with rasterio.open(raw/'692_5337.tif') as ds:
 ground=ds.read(1);gr=np.clip(((5338000-y)).astype(int),0,999);gc=np.clip((x-692000).astype(int),0,999)
 elevated=(z-ground[gr,gc])>2
valid=objects & elevated
points=np.array([np.asarray(l.gps_time).min(),np.asarray(l.gps_time).max()])
report={'decision':'research only; not enabled in routing','tile':'692_5337','bounds':[692000,5337000,693000,5338000],'crs':'EPSG:25832','verticalDatum':'DHHN2016 (provider definition; LAS header has no CRS VLR)',
'laser':{'url':'https://geodaten.bayern.de/odd_data/laser/692_5337.laz','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'fileCreationDate':str(l.header.creation_date),'gpsTimeEncoding':'LAS adjusted standard GPS time; +1e9 seconds since 1980-01-06, minus 18s GPS-UTC','observedUtcRange':[(datetime(1980,1,6,tzinfo=timezone.utc)+timedelta(seconds=float(t)+1e9-18)).isoformat() for t in points],
'classes':{str(int(k)):int(v) for k,v in zip(*np.unique(l.classification,return_counts=True))}},
'imagery':{'service':'https://geoservices.bayern.de/od/wms/dop/v1/dop20','layer':'by_dop20cir','size':[2000,2000],'format':'image/png','crs':'EPSG:25832','flightDate':'2024-08-24','flight':'124028/0','sha256':hashlib.sha256((raw/'cir-692_5337.png').read_bytes()).hexdigest()},
'screening':{'method':'Class-20 returns >2m above DGM1; rendered CIR red-green channel contrast >0.10 at each return. This is a candidate screen, not calibrated NDVI or validated classification.','elevatedObjectReturns':int(valid.sum()),'withVegetationContrast':int((valid&vegetation).sum()),'withoutVegetationContrast':int((valid&~vegetation).sum())},
'blockers':['Laser returns observed in winter 2022; imagery in summer 2024. Growth, removal, construction and seasonal state can disagree.','Class 20 includes non-vegetation objects; rendered colour contrast alone cannot validate individual crowns or vertical foliage gaps.','Require matched epoch DOM/CIR/laser checks, explicit roof/wire/vehicle rejection and stratified canopy/source audits before enabling.']}
Path('docs/munich-canopy-feasibility.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
