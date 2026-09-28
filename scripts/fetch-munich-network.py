"""One-off, bounded OSM API extract. No network calls are made by the app.

The small map requests stay below the API's 50,000-node limit. Complete relevant
area relations are fetched separately so no water/park boundary is invented.
"""
import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

raw = Path('data/raw')
raw.mkdir(exist_ok=True)
agent = 'CoolerWalks-development/0.2 (+https://github.com/gumbrich/cooler-walks)'
def fetch(url, path):
    if not path.exists():
        with urlopen(Request(url, headers={'User-Agent': agent}), timeout=120) as response:
            content = response.read()
        ET.fromstring(content)  # Reject failed/partial responses before saving.
        path.write_bytes(content)
    return ET.parse(path).getroot()

def elements(root):
    for e in root:
        if e.tag not in ('node', 'way', 'relation'): continue
        result = {'type': e.tag, 'id': int(e.attrib['id'])}
        if e.tag == 'node': result.update(lon=float(e.attrib['lon']), lat=float(e.attrib['lat']))
        if e.tag == 'way': result['nodes'] = [int(n.attrib['ref']) for n in e.findall('nd')]
        if e.tag == 'relation':
            result['members'] = [{**m.attrib, 'ref': int(m.attrib['ref'])} for m in e.findall('member')]
        tags = {t.attrib['k']: t.attrib['v'] for t in e.findall('tag')}
        if tags: result['tags'] = tags
        yield result

all_elements = {}
requests = []
xs, ys = [11.550, 11.568, 11.585, 11.603], [48.127, 48.137, 48.147, 48.157, 48.167]
for x in range(len(xs)-1):
    for y in range(len(ys)-1):
        bbox = ','.join(map(str, [xs[x], ys[y], xs[x+1], ys[y+1]]))
        url = f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}'
        requests.append(url)
        print('Reading map', x, y, flush=True)
        for e in elements(fetch(url, raw / f'munich-map-{x}-{y}.osm')):
            all_elements[(e['type'], e['id'])] = e

areas = {}
for e in list(all_elements.values()):
    tags = e.get('tags', {})
    if e['type'] != 'relation' or tags.get('type') != 'multipolygon': continue
    if tags.get('natural') != 'water' and tags.get('leisure') != 'park': continue
    url = f"https://api.openstreetmap.org/api/0.6/relation/{e['id']}/full"
    requests.append(url)
    print('Reading complete area', e['id'], flush=True)
    for part in elements(fetch(url, raw / f"munich-relation-{e['id']}.osm")):
        areas[(part['type'], part['id'])] = part

stamp = datetime.now(timezone.utc).isoformat()
for suffix, collection in [('osm', all_elements), ('areas', areas)]:
    (raw / f'munich-{suffix}.json').write_text(json.dumps({
        'elements': list(collection.values()),
        'source': 'OpenStreetMap API v0.6 bounded map download',
        'fetchedAt': stamp,
        'requests': requests,
    }, separators=(',', ':')))
print('Saved', len(all_elements), 'map elements and', len(areas), 'area elements')
