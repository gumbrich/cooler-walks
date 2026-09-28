"""Repair the Rhine relation clipped by the Switzerland-only Overpass service.

Use the complete original OSM relation and node IDs, never invented closure lines.
Run after fetching basel-areas.json; the complete XML is cached for repeatability.
"""
import json
from pathlib import Path
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

raw = Path('data/raw')
url = 'https://api.openstreetmap.org/api/0.6/relation/7518910/full'
path = raw / 'basel-rhine.osm'
if not path.exists():
    with urlopen(Request(url, headers={'User-Agent': 'CoolerWalks-development/0.2'}), timeout=120) as response:
        content = response.read()
    ET.fromstring(content)
    path.write_bytes(content)
data = json.loads((raw / 'basel-areas.json').read_text())
elements = {(e['type'], e['id']): e for e in data['elements']}
for e in ET.parse(path).getroot():
    if e.tag not in ('node', 'way', 'relation'): continue
    value = {'type': e.tag, 'id': int(e.attrib['id'])}
    if e.tag == 'node': value.update(lon=float(e.attrib['lon']), lat=float(e.attrib['lat']))
    if e.tag == 'way': value['nodes'] = [int(n.attrib['ref']) for n in e.findall('nd')]
    if e.tag == 'relation': value['members'] = [{**m.attrib, 'ref': int(m.attrib['ref'])} for m in e.findall('member')]
    tags = {t.attrib['k']: t.attrib['v'] for t in e.findall('tag')}
    if tags: value['tags'] = tags
    elements[(e.tag, value['id'])] = value
data['elements'] = list(elements.values())
data['completeAreaSource'] = url
(raw / 'basel-areas.json').write_text(json.dumps(data, separators=(',', ':')))
print('Completed Rhine boundary:', len(elements), 'elements')
