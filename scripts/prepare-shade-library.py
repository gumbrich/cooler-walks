"""Reproducible 1 km 3D tiles. Same source surfaces and 2 m ground as the pilot.

Triangles crossing a tile boundary are retained in both tiles without clipping or
simplification. Runtime ray intervals prevent duplicated geometry extending the
source domain. Gzip tiles are immutable, individually hashed derived assets.
"""
import base64
import gzip
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import rasterio
from rasterio.enums import Resampling
from pyproj import Transformer
from shapely.geometry import Polygon, box, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-shade-library'
OUT = ROOT / 'public/data/zurich-shade'
BOUNDS = [2677000,1245000,2685624,1254000]
VERSION = 'zurich-roofs-dtm-library-2026-09-30-v2'
spec = importlib.util.spec_from_file_location('pilot', ROOT / 'scripts/prepare-detailed-shade.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def tiles():
    return [(f'{x}_{y}', [x,y,min(x+1000,BOUNDS[2]),min(y+1000,BOUNDS[3])])
            for x in range(BOUNDS[0],BOUNDS[2],1000) for y in range(BOUNDS[1],BOUNDS[3],1000)]


def ground(bounds):
    w,s,e,n = bounds
    data = np.full(((n-s)//2,(e-w)//2), -32768, dtype='<i2')
    sources = []
    for x in range(w,e,500):
        for y in range(s,n,500):
            path = RAW / f'{x}_{y}.tif'
            meta = json.loads(path.with_suffix('.source.json').read_text())
            if pilot.digest(path) != meta['sha256']: raise ValueError('Terrain source checksum changed')
            with rasterio.open(path) as src:
                if src.crs.to_epsg() != 2056 or tuple(src.bounds) != (x,y,x+500,y+500) or src.res not in [(.25,.25),(2,2)]:
                    raise ValueError('Unexpected terrain grid')
                a = src.read(1)
                if src.res == (.25,.25):
                    # Aligned 8x8 native cells. Any invalid source cell remains unknown.
                    valid = (src.read_masks(1) == 255).reshape(250,8,250,8).all(axis=(1,3))
                    averages = a.reshape(250,8,250,8).mean(axis=(1,3), dtype=np.float64)
                else:
                    # Official, bounded WCS DTM 2022 delivery, validated against native tiles.
                    valid = (src.read_masks(1) == 255) & np.isfinite(a)
                    averages = a.astype(np.float64)
                if np.any((averages[valid]<300)|(averages[valid]>1000)):
                    raise ValueError('Unexpected LN02 ground height')
                result = np.where(valid,np.rint(averages*10),-32768).astype('<i2')
                row,col=(n-y-500)//2,(x-w)//2
                count=min(250,data.shape[1]-col)
                data[row:row+250,col:col+count]=result[:,:count]
                sources.append(meta)
    return data,sources


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    scratch = RAW / 'triangles'
    scratch.mkdir(exist_ok=True)
    config=json.loads((ROOT/'src/lib/coverage/zurich-extract.json').read_text())
    catalogue=tiles()
    # Each run truncates only its ignored derived scratch files, never raw input.
    cache = scratch / 'geometry.json'
    if '--reuse-geometry' in sys.argv:
        saved=json.loads(cache.read_text())
        if saved['triangulationSha256'] != pilot.digest(ROOT/'scripts/prepare-detailed-shade.py'):
            raise ValueError('Geometry adapter changed; regenerate the scratch mesh')
        records,rejected,sources=saved['records'],saved['rejected'],saved['sources']
        for item in sources:
            if pilot.digest(ROOT/'data/raw'/f"buildings-{item['tile']}.zip") != item['sha256']:
                raise ValueError('Cached building source changed')
    else:
        handles={key:(scratch/f'{key}.bin').open('wb') for key,_ in catalogue}
        counts={key:0 for key,_ in catalogue}
        rejected,records,sources,seen=[],[],[],set()
        footprints=[]
        for tile in config['buildingTiles']:
            archive=ROOT/'data/raw'/f'buildings-{tile}.zip'
            stac=json.loads((ROOT/config['rawDirectory']/f'buildings-{tile}-stac.json').read_text())
            asset=next(v for k,v in stac['assets'].items() if k.endswith('_2056_5728.citygml.zip'))
            sha=pilot.digest(archive)
            if asset['file:checksum'].lower()!='1220'+sha: raise ValueError('Building source checksum changed')
            sources.append({'tile':tile,'sha256':sha,'url':asset['href'],'observation':'2019'})
            footprints.append(transform(Transformer.from_crs(4326,2056,always_xy=True).transform,shape(stac['geometry'])))
            print('Triangulating',tile,flush=True)
            with zipfile.ZipFile(archive) as z:
                for name in z.namelist():
                    if not name.endswith('.gml'): continue
                    with z.open(name) as f:
                        for _,e in ET.iterparse(f,events=['end']):
                            if e.tag!='{'+pilot.NS['b']+'}Building': continue
                            bid=e.get('{'+pilot.NS['g']+'}id')
                            if bid in seen: e.clear();continue
                            seen.add(bid)
                            rings=[pilot.ring(p) for p in e.findall('.//b:GroundSurface//g:exterior',pilot.NS)]
                            if not any(Polygon(p[:,:2]).intersects(box(*BOUNDS)) for p in rings): e.clear();continue
                            kinds={a.find('gen:value',pilot.NS).text for a in e.findall('.//gen:stringAttribute',pilot.NS) if a.get('name')=='OBJEKTART'}
                            if not kinds or not kinds.issubset(pilot.SUPPORTED): e.clear();continue
                            try:
                                if not e.findall('.//b:RoofSurface',pilot.NS) or not e.findall('.//b:WallSurface',pilot.NS):
                                    raise ValueError('Missing roof or facade')
                                faces=e.findall('.//b:RoofSurface//g:Polygon',pilot.NS)+e.findall('.//b:WallSurface//g:Polygon',pilot.NS)
                                parts=np.array([t for face in faces for t in pilot.triangulate(pilot.ring(face.find('g:exterior',pilot.NS)),[pilot.ring(p) for p in face.findall('g:interior',pilot.NS)])],dtype='<f8')
                                if not len(parts): raise ValueError('Empty source surfaces')
                            except ValueError as error:
                                rejected.append({'id':bid,'reason':str(error)});e.clear();continue
                            records.append({'id':bid,'triangles':len(parts)})
                            lo,hi=parts.min(axis=1),parts.max(axis=1)
                            for key,(w,s,east,n) in catalogue:
                                keep=(hi[:,0]>=w)&(lo[:,0]<=east)&(hi[:,1]>=s)&(lo[:,1]<=n)
                                if np.any(keep):
                                    handles[key].write(parts[keep].tobytes());counts[key]+=1
                            e.clear()
        for h in handles.values(): h.close()
        # STAC WGS84 vertices are rounded to ~1 cm. Never assume bbox coverage without checking the union.
        if not unary_union([p.buffer(.02) for p in footprints]).covers(box(*BOUNDS)):
            raise ValueError('Building tiles do not cover the requested library rectangle')
        cache.write_text(json.dumps({'triangulationSha256':pilot.digest(ROOT/'scripts/prepare-detailed-shade.py'), 'records':records,'rejected':rejected,'sources':sources}))
    if '--geometry-only' in sys.argv:
        print('Source mesh prepared:',len(records),'buildings',flush=True)
        return
    manifest={'schema':1,'version':VERSION,'crs':'EPSG:2056','verticalDatum':'LN02','bounds':BOUNDS,
              'coverage':BOUNDS,'excludedBuildings':[r['id'] for r in rejected],'tiles':[]}
    terrain,ground_cells,missing,total_triangles={},0,0,0
    for key,bounds in catalogue:
        tri=np.fromfile(scratch/f'{key}.bin',dtype='<f8').reshape(-1,3,3)
        max_z=float(tri[:,:,2].max()) if len(tri) else 0
        tri[:,:,0]-=bounds[0];tri[:,:,1]-=bounds[1]
        vertices,indices=np.unique(np.round(tri.reshape(-1,3),3),axis=0,return_inverse=True)
        dem,src=ground(bounds)
        for item in src: terrain[item['url']]=item
        valid=dem!=-32768;ground_cells+=int(valid.sum());missing+=int((~valid).sum())
        encoded=lambda a:base64.b64encode(a.tobytes()).decode()
        data={'version':VERSION,'crs':'EPSG:2056','verticalDatum':'LN02','bounds':bounds,'coverage':bounds,
              'resolution':2,'width':dem.shape[1],'height':dem.shape[0],
              'vertices':encoded(vertices.astype('<f4')),'triangles':encoded(indices.astype('<u4')),
              'ground':encoded(dem),'excludedBuildings':[]}
        raw=json.dumps(data,separators=(',',':')).encode()
        packed=gzip.compress(raw,compresslevel=9,mtime=0)
        sha=hashlib.sha256(packed).hexdigest()
        name=f'{key}-{sha[:16]}.shade'
        (OUT/name).write_bytes(packed)
        manifest['tiles'].append({'id':key,'bounds':bounds,'maxZ':max_z,'url':'/data/zurich-shade/'+name,
                                  'sha256':sha,'bytes':len(packed),'expandedBytes':len(raw)})
        total_triangles+=len(tri)
        print('Prepared',key,len(tri),'triangles',len(packed),'bytes',flush=True)
    out=ROOT/'public/data/zurich-shade-library.json'
    out.write_text(json.dumps(manifest,separators=(',',':')))
    report={'version':VERSION,'sourceBoundsLV95':BOUNDS,'tiles':len(catalogue),'buildings':len(records),
            'sourceTriangles':sum(r['triangles'] for r in records),'storedTrianglesIncludingSeams':total_triangles,
            'derivedBytes':sum(t['bytes'] for t in manifest['tiles']),
            'validGroundCells':ground_cells,'missingGroundCells':missing,'groundResolutionMeters':2,
            'groundQuantizationMeters':.1,'rejectedBuildings':rejected,'buildingsSource':sources,
            'terrainSources':list(terrain.values()),'manifestSha256':pilot.digest(out),
            'validation':'Experimental. Source age discrepancies and field-validation hold remain unresolved.'}
    (ROOT/'docs/shade-library-data.json').write_text(json.dumps(report,indent=2)+'\n')
    print({k:v for k,v in report.items() if k not in ['rejectedBuildings','buildingsSource','terrainSources']},flush=True)


if __name__=='__main__':main()
