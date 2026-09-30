"""Bounded Zurich refresh. Explicit one-off downloads, never a runtime service.
Run once, inspect new sources, then prepare data. Raw files stay out of Git.
"""
import json
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/raw/zurich-expansion'
DEST.mkdir(parents=True, exist_ok=True)
BBOX = (8.5152, 47.351, 8.5717, 47.4041)

def download(name, base, params):
    path = DEST / name
    url = base + '?' + urllib.parse.urlencode(params)
    if path.exists():
        print('Reusing', name, flush=True)
        return
    print('Fetching', name, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'CoolerWalks-data-preparation/0.7'})
    body = urllib.request.urlopen(request, timeout=180).read()
    obj = json.loads(body)
    if (name in ['osm.json', 'areas.json', 'trees.json', 'addresses.json'] and not isinstance(obj.get('features', obj.get('elements')), list)) or obj.get('remark'):
        raise ValueError(f'{name}: provider returned incomplete data')
    temp = path.with_suffix('.tmp')
    temp.write_bytes(body)
    temp.replace(path)
    (DEST / (name + '.source.json')).write_text(json.dumps({
        'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'bytes': len(body),
    }, indent=2) + '\n')
    print(name, len(body), 'bytes', flush=True)

download('addresses-metadata.json', 'https://data.stadt-zuerich.ch/api/3/action/package_show', {'id': 'geo_adressen_stadt_zuerich'})
for tile in ['1091-23', '1091-41']:
    download('buildings-' + tile + '-stac.json', 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissbuildings3d_3_0/items/swissbuildings3d_3_0_2019_' + tile, {})
    archive = ROOT / 'data/raw' / ('buildings-' + tile + '.zip')
    if not archive.exists():
        import shutil
        url = 'https://data.geo.admin.ch/ch.swisstopo.swissbuildings3d_3_0/swissbuildings3d_3_0_2019_' + tile + '/swissbuildings3d_3_0_2019_' + tile + '_2056_5728.citygml.zip'
        print('Fetching historical building tile', tile, flush=True)
        temp = archive.with_suffix('.tmp')
        with urllib.request.urlopen(url, timeout=1800) as source, temp.open('wb') as target:
            shutil.copyfileobj(source, target)
        temp.replace(archive)

box = f'{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]}'
download('osm.json', 'https://overpass.osm.ch/api/interpreter', {'data':
 f'[out:json][timeout:120];(way[highway]({box});way[building]({box});way[natural=water]({box});way[waterway]({box});way[leisure=park]({box});node[name][tourism]({box});node[place]({box}););out body;>;out skel qt;'})
download('areas.json', 'https://overpass.osm.ch/api/interpreter', {'data':
 f'[out:json][timeout:120];(relation[natural=water]({box});relation[leisure=park]({box}););out body;>;out skel qt;'})
params = {'service': 'WFS', 'version': '1.1.0', 'request': 'GetFeature',
          'outputFormat': 'GeoJSON', 'srsName': 'EPSG:4326'}
download('trees.json', 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Bauminventar',
 {**params, 'typename': 'bauminventar', 'bbox': ','.join(map(str, BBOX)) + ',EPSG:4326'})
download('addresses.json', 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Adressen_Stadt_Zuerich',
 {**params, 'typename': 'adrstzh_adressen_stzh_p'})
