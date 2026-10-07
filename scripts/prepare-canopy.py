"""Build a small, separately labelled canopy-shadow diagnostic from classified LiDAR.

--fetch allows bounded public downloads; ordinary runs require cached, hashed inputs.
Raw point clouds remain ignored. No building or existing shade geometry is edited.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import laspy
import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-canopy'
CONFIG = json.loads((ROOT / 'scripts/canopy-pilot.json').read_text())


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch(name):
    path = RAW / name
    metadata = path.with_suffix('.source.json')
    if metadata.exists():
        record = json.loads(metadata.read_text())
        path = ROOT / record['localPath']
        if digest(path) != record['sha256']:
            raise ValueError('Cached canopy source checksum changed')
        return path, record
    existing = ROOT / 'data/raw/shadow-validation/lidar' / name
    if existing.exists():
        path = existing
    else:
        temp = path.with_suffix('.part')
        with requests.get(CONFIG['source'] + name, stream=True, timeout=(30, 180)) as response:
            response.raise_for_status()
            size = 0
            with temp.open('wb') as stream:
                for chunk in response.iter_content(1024 * 1024):
                    size += len(chunk)
                    if size > 100_000_000:
                        raise ValueError('Canopy source exceeds tile download limit')
                    stream.write(chunk)
        temp.replace(path)
    record = {'name': name, 'url': CONFIG['source'] + name, 'sha256': digest(path),
              'bytes': path.stat().st_size, 'verifiedAt': datetime.now(timezone.utc).isoformat(),
              'localPath': str(path.relative_to(ROOT)), 'epoch': CONFIG['epoch']}
    metadata.write_text(json.dumps(record, indent=2) + '\n')
    print('Source ready', name, record['bytes'], flush=True)
    return path, record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    west, south, east, north = CONFIG['bounds']
    width, height = east - west, north - south
    names = [f'{x}_{y}.laz' for x in range(west, east, 500) for y in range(south, north, 500)]
    if args.fetch:
        with ThreadPoolExecutor(max_workers=2) as executor:
            sources = list(executor.map(fetch, names))
    else:
        sources = []
        for name in names:
            record = json.loads((RAW / name).with_suffix('.source.json').read_text())
            path = ROOT / record['localPath']
            if digest(path) != record['sha256']:
                raise ValueError('Canopy source checksum changed')
            sources.append((path, record))
    lows = np.full(width * height, 65535, dtype='<u2')
    highs = np.zeros(width * height, dtype='<u2')
    all_counts = np.zeros(width * height, dtype=np.uint16)
    vegetation_returns = 0
    for path, record in sources:
        with laspy.open(path) as reader:
            crs = reader.header.parse_crs()
            assert crs and [c.to_epsg() for c in crs.sub_crs_list] == [2056, 5728]
            record['points'] = reader.header.point_count
            record['lasCreationDate'] = str(reader.header.creation_date)
            record['crs'] = 'EPSG:2056 + EPSG:5728'
            for cloud in reader.chunk_iterator(500_000):
                x, y, z = np.asarray(cloud.x), np.asarray(cloud.y), np.asarray(cloud.z)
                valid = ~np.asarray(cloud.withheld).astype(bool)
                valid &= (x >= west) & (x < east) & (y >= south) & (y < north)
                idx = (north - 1 - np.floor(y[valid]).astype(int)) * width + np.floor(x[valid]).astype(int) - west
                # Any observed return supports scan coverage; unobserved cells remain unknown.
                np.maximum.at(all_counts, idx, 1)
                keep = valid & (np.asarray(cloud.classification) == CONFIG['classification'])
                idx = (north - 1 - np.floor(y[keep]).astype(int)) * width + np.floor(x[keep]).astype(int) - west
                z = z[keep]
                assert np.all((z > 300) & (z < 1000))
                np.minimum.at(lows, idx, np.floor((z - CONFIG['verticalPaddingMeters']) * 10).astype('<u2'))
                np.maximum.at(highs, idx, np.ceil((z + CONFIG['verticalPaddingMeters']) * 10).astype('<u2'))
                vegetation_returns += len(z)
        print('Prepared', path.name, flush=True)
    indices = np.flatnonzero(highs).astype('<u4')
    unknown = np.flatnonzero(all_counts == 0).astype('<u4')
    b64 = lambda values: base64.b64encode(values.tobytes()).decode()
    out = {'schema': 1, 'version': CONFIG['version'], 'cityId': CONFIG['cityId'],
           'crs': CONFIG['crs'], 'verticalDatum': CONFIG['verticalDatum'],
           'bounds': CONFIG['bounds'], 'resolution': 1, 'width': width, 'height': height,
           'columns': b64(indices), 'base': b64(lows[indices]), 'top': b64(highs[indices]),
           'unknown': b64(np.packbits(all_counts == 0, bitorder='little')), 'maxZ': float(highs.max()) / 10,
           'scenario': 'opaque-observed-vegetation-envelope', 'epoch': CONFIG['epoch']}
    target = ROOT / 'public/data/zurich-canopy.json'
    target.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    report = {'config': CONFIG, 'sources': [r for _, r in sources], 'vegetationReturns': vegetation_returns,
              'columns': len(indices), 'unknownCells': len(unknown), 'totalCells': width * height,
              'maxZ': out['maxZ'], 'bytes': target.stat().st_size, 'sha256': digest(target),
              'limitations': CONFIG['scope']}
    (ROOT / 'docs/canopy-source-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print({k: v for k, v in report.items() if k not in ['sources', 'config']}, flush=True)


if __name__ == '__main__':
    main()
