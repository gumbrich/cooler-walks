"""Check actual counter coverage without assigning outer-road counts to city streets."""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET
from pyproj import Transformer

config = json.loads(Path('scripts/munich-coverage.json').read_text())
p = Path('data/raw/munich-extensions/baysis-counts.gml')
r = ET.parse(p)
assert r.getroot().attrib['numberMatched'] == r.getroot().attrib['numberReturned']
transform = Transformer.from_crs(25832, 4326, always_xy=True)
w, s, e, n = config['routeBounds']
rows = []
for member in r.findall('{*}member'):
    feature = member[0]
    row = {a.tag.split('}')[-1]: a.text for a in feature if a.text}
    pos = feature.find('.//{*}pos')
    assert pos is not None
    row['point'] = list(transform.transform(*map(float, pos.text.split())))
    x, y = row['point']
    row['withinWalkingCoverage'] = w <= x <= e and s <= y <= n
    rows.append(row)
report = {
    'source': 'https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/index.html',
    'endpoint': 'https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer',
    'typeName': 'BAYSIS_Verkehrsdaten:svz2021_zaehlstellen',
    'queryBoundsEPSG25832': config['sourceBounds'],
    'fetchedAt': r.getroot().attrib['timeStamp'],
    'sourceSha256': hashlib.sha256(p.read_bytes()).hexdigest(),
    'licence': 'CC BY 4.0',
    'attribution': 'Datenquelle: Bayerische Straßenbauverwaltung - BAYSIS (https://www.baysis.bayern.de)',
    'observationYear': 2021,
    'metric': 'DTV_Kfz, mean vehicles/day; not hourly or live traffic',
    'returned': len(rows), 'withinWalkingCoverage': sum(x['withinWalkingCoverage'] for x in rows),
    'counters': rows,
    'decision': 'No counters in the supported walking area; do not project motorway or outer-road counts onto nearby pedestrian streets. Municipal DAVe export or another suitable source remains necessary.'
}
assert report['withinWalkingCoverage'] == 0, 'Newly available counters require a fresh integration review'
Path('docs/munich-traffic-feasibility.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('BAYSIS:', report['returned'], 'nearby counters;', report['withinWalkingCoverage'], 'inside coverage')
