"""Bounded, cached Munich sources. Raw data stays outside Git; checksums pin inputs.

Run before prepare-munich-shade.py and prepare-munich-features.ts. The municipal
address CSV has no coordinates and is retained as feasibility evidence only.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/munich-extensions'
NS = {'m': 'urn:ietf:params:xml:ns:metalink'}
SOURCES = {
    'dgm.meta4': 'https://geodaten.bayern.de/odd/a/dgm/dgm1/meta/metalink/09162000.meta4',
    'zones.geojson': 'https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=mor_wfs:rad_rsp_tempo30zone_poly&outputFormat=application/json',
    'addresses.txt': 'https://karten.muenchen.de/resources/gsm/__docs/adressen_aktuell.txt',
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch(name, url, expected=None):
    path = RAW / name
    record_path = path.with_suffix(path.suffix + '.source.json')
    if record_path.exists():
        record = json.loads(record_path.read_text())
        if record['url'] != url or digest(path) != record['sha256']:
            raise ValueError('Cached source changed: ' + name)
    elif not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'CoolerWalks data preparation'})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read(8_000_001)
        if len(data) > 8_000_000:
            raise ValueError('Source exceeds bounded download: ' + name)
        path.write_bytes(data)
    sha = digest(path)
    if expected and expected != sha:
        raise ValueError('Official checksum mismatch: ' + name)
    if not record_path.exists():
        record = {'url': url, 'sha256': sha, 'bytes': path.stat().st_size,
                  'fetchedAt': datetime.now(timezone.utc).isoformat()}
        record_path.write_text(json.dumps(record, indent=2) + '\n')
    print('Verified', name, path.stat().st_size, flush=True)
    return path


if __name__ == '__main__':
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        fetch(name, url)
    files = ET.parse(RAW / 'dgm.meta4').findall('m:file', NS)
    w, s, e, n = json.loads((ROOT / 'scripts/munich-coverage.json').read_text())['sourceBounds']
    selected = {f'{x//1000}_{y//1000}.tif' for x in range(w, e, 1000) for y in range(s, n, 1000)}
    jobs = [(f.attrib['name'], f.find('m:url', NS).text, f.find('m:hash', NS).text)
            for f in files if f.attrib['name'] in selected]
    if len(jobs) != len(selected):
        raise ValueError('Incomplete ground coverage')
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda job: fetch(*job), jobs))
