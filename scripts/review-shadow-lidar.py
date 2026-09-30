"""Investigate flagged source heights using original classified LiDAR returns.

This never edits production geometry. Public tiles stay in ignored data/raw.
Run with --fetch to fetch only tiles containing the pre-existing 26 flags.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import laspy
import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/shadow-validation/lidar'
BASE = 'https://maps.zh.ch/download/hoehen/2022/lidar/'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch(name):
    path = RAW / name
    if path.exists():
        return
    temporary = path.with_suffix('.part')
    with requests.get(BASE + name, stream=True, timeout=(30, 180)) as response:
        response.raise_for_status()
        size = 0
        with temporary.open('wb') as stream:
            for chunk in response.iter_content(1024*1024):
                size += len(chunk)
                if size > 100_000_000:
                    raise ValueError('Unexpected tile size; stop before large download')
                stream.write(chunk)
    with laspy.open(temporary) as reader:
        assert reader.header.point_count > 0
    temporary.replace(path)
    print('Fetched', name, size, flush=True)


def neighborhood(xyz, classes, withheld, point, radius=1):
    distance = np.linalg.norm(xyz[:, :2] - point, axis=1)
    valid = (distance <= radius) & ~withheld
    building = valid & (classes == 6)
    points = xyz[building]
    counts = {str(k): int(v) for k, v in zip(*np.unique(classes[valid], return_counts=True))}
    result = {'radiusMeters': radius, 'classCounts': counts, 'buildingReturns': len(points)}
    if not len(points):
        return result
    nearest = np.argmin(np.linalg.norm(points[:, :2] - point, axis=1))
    result.update(nearestBuildingReturn=points[nearest].tolist(),
                  medianBuildingHeight=float(np.median(points[:, 2])),
                  minimumBuildingHeight=float(points[:, 2].min()),
                  maximumBuildingHeight=float(points[:, 2].max()))
    # A local fit is an investigation aid, not proof of a single physical roof.
    design = np.column_stack([points[:, :2] - point, np.ones(len(points))])
    fit, _, rank, _ = np.linalg.lstsq(design, points[:, 2], rcond=None)
    if len(points) >= 5 and rank == 3:
        result.update(fittedHeightAtSample=float(fit[2]),
                      planeResidualRMSE=float(np.sqrt(np.mean((design @ fit - points[:, 2])**2))))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    audit_path = ROOT / 'docs/shadow-validation-audit.json'
    audit = json.loads(audit_path.read_text())
    groups = {}
    for row in audit['roofConsistency']['outliers']:
        x, y = row['pointLV95']
        name = f'{x//500*500}_{y//500*500}.laz'
        groups.setdefault(name, []).append(row)
    if args.fetch:
        # Two bounded independent public reads; no export order/email/account.
        with ThreadPoolExecutor(max_workers=2) as executor:
            list(executor.map(fetch, sorted(groups)))
    sources, results = [], []
    for name, rows in sorted(groups.items()):
        path = RAW / name
        if not path.exists():
            raise FileNotFoundError(f'{path}; rerun with --fetch')
        cloud = laspy.read(path)
        crs = cloud.header.parse_crs()
        assert crs and crs.sub_crs_list[0].to_epsg() == 2056
        assert crs.sub_crs_list[1].to_epsg() == 5728  # LN02, not ellipsoid height
        xyz = np.column_stack([cloud.x, cloud.y, cloud.z])
        classes, withheld = np.asarray(cloud.classification), np.asarray(cloud.withheld).astype(bool)
        sources.append({'url': BASE+name, 'sha256': sha(path), 'bytes': path.stat().st_size,
                        'points': len(xyz), 'crs': 'EPSG:2056 + EPSG:5728',
                        'lasCreationDate': str(cloud.header.creation_date),
                        'gpsTimeType': str(cloud.header.global_encoding.gps_time_type),
                        'observationEpoch': 'Provider product 2021–2022; LAS creation date is not capture time.'})
        for row in rows:
            result = {**row, 'tile': name, **neighborhood(xyz, classes, withheld, row['pointLV95'])}
            if 'fittedHeightAtSample' in result:
                z = result['fittedHeightAtSample']
                result['citygmlMinusLocalFitMeters'] = row['citygmlRoofLN02']-z
                result['rasterMinusLocalFitMeters'] = row['lidarDTMPlusBuildingLN02']-z
            results.append(result)
        print('Reviewed', name, len(rows), 'flags', flush=True)
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(),
              'inputAuditSha256': sha(audit_path), 'modelSha256': audit['modelSha256'],
              'method': 'All previously flagged samples; class 6, non-withheld returns within 1 m; local least-squares plane and unfiltered height range reported.',
              'scope': 'Independent raw-return check of raster and historical roof consistency. Same LiDAR survey as the raster; not an independent field-shadow measurement. No source is automatically declared correct.',
              'sources': sources, 'samples': results, 'expansionGate': 'hold'}
    (ROOT / 'docs/shadow-lidar-review.json').write_text(json.dumps(report, indent=2)+'\n')
    print('Reviewed', len(results), 'samples. Expansion remains HOLD.', flush=True)


if __name__ == '__main__':
    main()
