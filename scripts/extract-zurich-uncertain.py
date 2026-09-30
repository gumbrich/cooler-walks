"""Retain source objects without GroundSurface as conservative unknown masks.
These are real XY hulls, not fabricated solid buildings or measured heights.
"""
import hashlib
import json
from pathlib import Path
import xml.parsers.expat
import zipfile
from shapely.geometry import MultiPoint, box

root = Path(__file__).resolve().parents[1]
config = json.loads((root/'src/lib/coverage/zurich-extract.json').read_text())
dest = root/config['rawDirectory']
report_path = root/'docs/zurich-building-coverage.json'
report = json.loads(report_path.read_text())
clip = box(*report['extractionBoundsLV95'])
all_masks = {}
for tile in config['buildingTiles']:
    archive = root/'data/raw'/('buildings-'+tile+'.zip')
    signature = {'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bounds':list(clip.bounds),'version':1}
    cache = dest/('uncertain-'+tile+'.json')
    saved = json.loads(cache.read_text()) if cache.exists() else None
    if saved and saved['signature']==signature:
        masks = saved['masks']
    else:
        masks = []
        print('Auditing objects without ground surfaces',tile,flush=True)
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not name.lower().endswith(('.gml','.xml')):continue
                state = {'id':None,'ground':False,'positions':[],'position':None}
                def start(tag,attrs):
                    local=tag.rsplit('|',1)[-1]
                    if local=='Building':
                        state.update(id=attrs.get('http://www.opengis.net/gml|id'),ground=False,positions=[],position=None)
                        if not state['id']:raise ValueError('Building without source identity')
                    elif state['id'] and local=='GroundSurface':state['ground']=True
                    elif state['id'] and local=='posList':state['position']=[]
                def characters(text):
                    if state['position'] is not None:state['position'].append(text)
                def end(tag):
                    local=tag.rsplit('|',1)[-1]
                    if local=='posList' and state['position'] is not None:
                        state['positions'].append(''.join(state['position']))
                        state['position']=None
                    elif local=='Building' and state['id']:
                        if not state['ground']:
                            points=[]
                            for text in state['positions']:
                                values=list(map(float,text.split()))
                                if len(values)%3:raise ValueError('Expected source XYZ coordinates')
                                points.extend(zip(values[0::3],values[1::3]))
                            hull=MultiPoint(points).convex_hull if points else None
                            if hull is not None and hull.geom_type=='Polygon' and hull.intersects(clip):
                                masks.append({'id':state['id']+':unknown','ring':list(hull.exterior.coords),'holes':[],
                                              'height':150,'ground':None,'tile':archive.name,'uncertain':True})
                        state['id']=None
                        state['positions']=[]
                parser=xml.parsers.expat.ParserCreate(namespace_separator='|')
                parser.StartElementHandler=start
                parser.EndElementHandler=end
                parser.CharacterDataHandler=characters
                with z.open(name) as source:
                    while chunk:=source.read(1024*1024):parser.Parse(chunk,False)
                    parser.Parse(b'',True)
        cache.write_text(json.dumps({'signature':signature,'masks':masks},separators=(',',':')))
    for b in masks:all_masks[b['id']]=b
    print(tile,len(masks),'unknown source hulls',flush=True)
(dest/'unsupported-building-masks-lv95.json').write_text(json.dumps(list(all_masks.values()),separators=(',',':')))
report['objectsWithoutGroundSurface']=len(all_masks)
report['noGroundRule']='Source XY convex hulls without GroundSurface are unknown masks; 150 m is the conservative supported model ceiling, never a measured height. Ground reference stays null.'
report_path.write_text(json.dumps(report,indent=2)+'\n')
