"""Fetch pinned Munich source indices and the dated regional OSM extract."""
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.request import urlopen

RAW = Path('data/raw')
RAW.mkdir(parents=True, exist_ok=True)
config = json.loads(Path('scripts/munich-coverage.json').read_text())
index = RAW / config['buildingIndex']
if not index.exists():
    with urlopen('https://geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09162000.meta4', timeout=60) as r:
        index.write_bytes(r.read(2_000_000))
if hashlib.sha256(index.read_bytes()).hexdigest() != config['buildingIndexSha256']:
    raise ValueError('Building publication changed. Review the source and deliberately update munich-coverage.json.')
pbf = RAW / config['osmFile']
if not pbf.exists() or pbf.stat().st_size != config['osmBytes']:
    for attempt in range(4):
        if subprocess.run(['curl', '-fsSL', '-C', '-', '--max-time', '600', config['osmUrl'], '-o', str(pbf)]).returncode == 0:
            break
    else: raise ValueError('OSM download incomplete')
with pbf.open('rb') as stream:
    if hashlib.file_digest(stream, 'md5').hexdigest() != config['osmMd5']:
        raise ValueError('Dated Geofabrik source checksum mismatch')
pbf.with_suffix('.pbf.md5').write_text(config['osmMd5'] + '  ' + pbf.name + '\n')
print('Pinned Munich building index and regional OSM source verified')
