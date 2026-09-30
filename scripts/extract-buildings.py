"""Extract ground footprints and actual roof-to-ground heights from Swiss CityGML.
Raw tiles stay in data/raw. No source observation dates are inferred from fetch time.
"""
import json
import argparse
import pathlib
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {'b':'http://www.opengis.net/citygml/building/2.0','g':'http://www.opengis.net/gml'}
parser = argparse.ArgumentParser()
parser.add_argument('--expanded', action='store_true', help='Use the verified two-tile Zurich surroundings')
args = parser.parse_args()
# Expanded envelope includes every vertex of the model rectangle in LV95,
# plus a small margin for footprints intersecting the boundary.
BBOX = (2681200,1244950,2685675,1251050) if args.expanded else (2681600,1245400,2685100,1250300)
if args.expanded:
    from shapely.geometry import shape, box
    from shapely.ops import unary_union
    sources = [json.loads((ROOT/'data/raw/zurich-expansion'/('buildings-'+tile+'-stac.json')).read_text()) for tile in ['1091-23','1091-41']]
    if not unary_union([shape(s['geometry']) for s in sources]).covers(box(8.5152,47.351,8.5717,47.4041)):
        raise ValueError('The model rectangle is not fully covered by actual source tile polygons')
buildings = []
seen = set()
for archive in sorted((ROOT/'data/raw').glob('buildings-*.zip')):
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if not name.lower().endswith(('.gml','.xml')): continue
            print('Reading', archive.name, name, flush=True)
            with z.open(name) as source:
                for _, elem in ET.iterparse(source, events=('end',)):
                    if elem.tag != '{'+NS['b']+'}Building': continue
                    bid = elem.attrib.get('{'+NS['g']+'}id','')
                    if bid in seen: elem.clear(); continue
                    ground = []
                    for surface in elem.findall('.//b:GroundSurface',NS):
                        for pos in surface.findall('.//g:exterior//g:posList',NS):
                            nums = list(map(float,(pos.text or '').split()))
                            pts = [nums[i:i+3] for i in range(0,len(nums),3)]
                            if len(pts)>=4: ground.append(pts)
                    if not ground: elem.clear(); continue
                    allpts = []
                    for pos in elem.findall('.//g:posList',NS):
                        nums = list(map(float,(pos.text or '').split()))
                        allpts.extend([nums[i:i+3] for i in range(0,len(nums),3)])
                    zmin = min(p[2] for ring in ground for p in ring)
                    zmax = max(p[2] for p in allpts)
                    height = zmax-zmin
                    if height<=0 or height>150: elem.clear(); continue
                    for i,ring in enumerate(ground):
                        if not any(BBOX[0]<=p[0]<=BBOX[2] and BBOX[1]<=p[1]<=BBOX[3] for p in ring): continue
                        buildings.append({'id':bid+':'+str(i),'ring':[[p[0],p[1]] for p in ring], 'height':round(height,2),'ground':round(zmin,2),'tile':archive.name})
                    seen.add(bid)
                    elem.clear()
if not buildings: raise RuntimeError('No supported ground surfaces found; do not publish shade capability.')
(ROOT/'data/raw/buildings-lv95.json').write_text(json.dumps(buildings,separators=(',',':')))
print('Extracted',len(buildings),'ground surfaces')
