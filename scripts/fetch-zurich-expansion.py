"""Bounded Zurich refresh. Explicit one-off downloads, never a runtime service.
Run once, inspect new sources, then prepare data. Raw files stay out of Git.
"""
import json
import hashlib
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'src/lib/coverage/zurich-extract.json').read_text())
DEST = ROOT / CONFIG['rawDirectory']
ADDRESSES = ROOT / CONFIG['addressDirectory']
ADDRESSES.mkdir(parents=True, exist_ok=True)
DEST.mkdir(parents=True, exist_ok=True)
BBOX = CONFIG['modelBounds']

def download(name, base, params, directory=DEST):
    path = directory / name
    url = base + '?' + urllib.parse.urlencode(params)
    if path.exists():
        print('Reusing', name, flush=True)
        return
    print('Fetching', name, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'CoolerWalks-data-preparation/0.8'})
    body = urllib.request.urlopen(request, timeout=180).read()
    obj = json.loads(body)
    if (name in ['osm.json', 'areas.json', 'trees.json', 'addresses.json'] and not isinstance(obj.get('features', obj.get('elements')), list)) or obj.get('remark'):
        raise ValueError(f'{name}: provider returned incomplete data')
    temp = path.with_suffix('.tmp')
    temp.write_bytes(body)
    temp.replace(path)
    (directory / (name + '.source.json')).write_text(json.dumps({
        'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'bytes': len(body),
    }, indent=2) + '\n')
    print(name, len(body), 'bytes', flush=True)

download('addresses-metadata.json', 'https://data.stadt-zuerich.ch/api/3/action/package_show', {'id': 'geo_adressen_stadt_zuerich'}, ADDRESSES)
for tile in CONFIG['buildingTiles']:
    item = f"swissbuildings3d_3_0_{CONFIG['buildingYear']}_{tile}"
    metadata = 'buildings-' + tile + '-stac.json'
    download(metadata, 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissbuildings3d_3_0/items/' + item, {})
    stac = json.loads((DEST / metadata).read_text())
    assets = [v for k, v in stac['assets'].items() if k.endswith('_2056_5728.citygml.zip')]
    if len(assets) != 1 or assets[0]['proj:epsg'] != 2056:
        raise ValueError('Inspect changed building asset schema')
    asset = assets[0]
    archive = ROOT / 'data/raw' / ('buildings-' + tile + '.zip')
    if not archive.exists():
        import shutil
        print('Fetching historical building tile', tile, flush=True)
        temp = archive.with_suffix('.tmp')
        with urllib.request.urlopen(asset['href'], timeout=1800) as source, temp.open('wb') as target:
            shutil.copyfileobj(source, target)
        temp.replace(archive)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    expected = asset['file:checksum'].lower()
    if expected != '1220' + actual:
        raise ValueError(f'{archive.name}: source checksum mismatch; inspect before reuse')
    print('Verified source checksum', tile, flush=True)

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
 {**params, 'typename': 'adrstzh_adressen_stzh_p'}, ADDRESSES)
download('municipal-boundary.json', 'https://maps.zh.ch/wfs/GemZHWFS', {
    'SERVICE': 'WFS', 'REQUEST': 'GetFeature', 'VERSION': '1.1.0',
    'TYPENAME': 'gem_grenzen', 'OUTPUTFORMAT': 'application/json', 'SRSNAME': 'EPSG:2056',
    'FILTER': '<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>bfs</PropertyName><Literal>261</Literal></PropertyIsEqualTo></Filter>',
})
