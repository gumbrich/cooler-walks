"""Resume the large official GeoPackage using four checked HTTP byte ranges.

This is a one-off data download, not an app service. Retains completed parts on
failure, verifies response offsets/lengths and SQLite integrity before replacing
the source file. Do not use to repeatedly refresh live data.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import sqlite3
import json
from urllib.request import Request, urlopen

url = 'https://geodaten.bayern.de/odd/m/8/baeume3d/data/124028_baeume.gpkg'
size = 493318144  # 2024 Munich block, from the actual server response
raw = Path('data/raw')
target = raw / 'munich-trees.gpkg'
plan = raw / 'munich-tree-ranges.json'
if target.exists() and target.stat().st_size == size:
    with sqlite3.connect(f'file:{target}?mode=ro', uri=True) as db:
        assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    print('Complete GeoPackage already present')
    raise SystemExit(0)
if plan.exists():
    ranges = json.loads(plan.read_text())
else:
    start = target.stat().st_size if target.exists() else 0
    ranges = []
    if start:
        shutil.copyfile(target, raw / 'munich-tree-prefix.bin')
        ranges.append([0, start-1, 'munich-tree-prefix.bin'])
    step = (size-start+3)//4
    for i, offset in enumerate(range(start, size, step)):
        ranges.append([offset, min(size-1, offset+step-1), f'munich-tree-part-{i}.bin'])
    plan.write_text(json.dumps(ranges))

def download(spec):
    start, end, name = spec
    path = raw / name
    have = path.stat().st_size if path.exists() else 0
    if have == end-start+1: return
    if have > end-start+1: raise ValueError('Oversized cached range')
    request_start = start+have
    request = Request(url, headers={'Range': f'bytes={request_start}-{end}', 'User-Agent': 'CoolerWalks-development/0.2'})
    with urlopen(request, timeout=180) as response:
        expected = f'bytes {request_start}-{end}/{size}'
        if response.status != 206 or response.headers.get('Content-Range') != expected:
            raise ValueError('Server did not honour the exact byte range')
        with path.open('ab') as output:
            shutil.copyfileobj(response, output, 1024*1024)
    if path.stat().st_size != end-start+1: raise ValueError('Incomplete range; rerun to resume')
    print('Completed', name, flush=True)

with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, ranges))
assembled = raw / 'munich-trees-complete.gpkg'
with assembled.open('wb') as output:
    for _, _, name in ranges:
        with (raw / name).open('rb') as part: shutil.copyfileobj(part, output)
assert assembled.stat().st_size == size
with sqlite3.connect(f'file:{assembled}?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
assembled.replace(target)
print('Complete GeoPackage verified:', size, 'bytes')
