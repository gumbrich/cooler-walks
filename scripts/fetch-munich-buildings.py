"""Download only the configured official LoD2 tiles used by the Munich beta.

Resume partial files; validate the published byte count and SHA-256 before use.
Raw CityGML stays out of Git. The municipal metalink is the source of URLs.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

CONFIG = json.loads(Path('scripts/munich-coverage.json').read_text())
w, s, e, n = CONFIG['sourceBounds']
TILES = [f'{x//1000}_{y//1000}' for x in range(w, e, 2000) for y in range(s, n, 2000)]

if __name__ == '__main__':
    raw = Path('data/raw')
    if hashlib.sha256((raw / CONFIG['buildingIndex']).read_bytes()).hexdigest() != CONFIG['buildingIndexSha256']:
        raise ValueError('Building index differs from the reviewed publication')
    index = ET.parse(raw / CONFIG['buildingIndex']).getroot()
    def fetch(tile):
        entry = index.find(f"{{*}}file[@name='{tile}.gml']")
        if entry is None:
            raise ValueError(f'Missing published tile {tile}')
        target = raw / f'munich-{tile}.gml'
        size = int(entry.find('{*}size').text)
        expected = entry.find('{*}hash').text
        stamp = target.with_suffix('.gml.download-sha')
        valid = target.exists() and target.stat().st_size == size and hashlib.sha256(target.read_bytes()).hexdigest() == expected
        if not valid:
            # Never resume a new publication onto bytes from the old one.
            if target.exists() and (not stamp.exists() or stamp.read_text() != expected):
                old = hashlib.sha256(target.read_bytes()).hexdigest()
                target.rename(target.with_suffix(f'.{old[:16]}.previous'))
            stamp.write_text(expected)
            for attempt in range(4):
                result = subprocess.run(['curl', '-fsSL', '-C', '-', '--retry', '2', '--max-time', '600',
                                         entry.find('{*}url').text, '-o', str(target)])
                if result.returncode == 0: break
            else: raise ValueError(f'Download failed: {tile}')
        if target.stat().st_size != size or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Tile {tile} failed its source checksum')
        print(tile, 'verified', flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(fetch, TILES))
