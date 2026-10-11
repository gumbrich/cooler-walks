"""Munich LoD2 roof/facade rays with DGM1 receiver heights, in UTM32/DHHN2016.

Uses the same checked triangulation and runtime tile schema as Zurich. Building
parts, courtyards, source heights and unknown ground cells are preserved. Terrain
does not cast shadows. No tree crowns are inferred from Bavaria's tree points.
"""
import base64
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
OUT = ROOT / 'public/data/munich-shade'
CONFIG = json.loads((ROOT / 'scripts/munich-coverage.json').read_text())
BOUNDS = CONFIG['sourceBounds']
VERSION = CONFIG['shadeVersion']
spec = importlib.util.spec_from_file_location('mesh', ROOT / 'scripts/prepare-detailed-shade.py')
mesh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mesh)
NS = {'b': 'http://www.opengis.net/citygml/building/1.0', 'g': 'http://www.opengis.net/gml'}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    env = json.loads((RAW / 'munich-environment.json').read_text())
    by_part = {}
    for b in env['buildings']:
        by_part.setdefault(b['id'].rsplit(':', 1)[0], []).append(b)
    catalogue = [(f'{x}_{y}', [x, y, x+1000, y+1000])
                 for x in range(BOUNDS[0], BOUNDS[2], 1000)
                 for y in range(BOUNDS[1], BOUNDS[3], 1000)]
    triangles = {key: [] for key, _ in catalogue}
    accepted, rejected, seen, sources = [], [], set(), []
    for tile, expected in env['tileSha256'].items():
        path = RAW / f'munich-{tile}.gml'
        if mesh.digest(path) != expected:
            raise ValueError('Building source changed')
        sources.append({'tile': tile, 'sha256': expected})
        for _, element in ET.iterparse(path, events=['end']):
            if element.tag != '{'+NS['b']+'}Building':
                continue
            for part in [element, *element.findall('.//b:BuildingPart', NS)]:
                bid = part.attrib['{'+NS['g']+'}id']
                records = by_part.get(bid)
                if not records or bid in seen:
                    continue
                seen.add(bid)
                try:
                    if any(b.get('uncertain') for b in records):
                        raise ValueError('Existing unsupported-structure/height-disagreement mask')
                    roof = part.findall('./b:boundedBy/b:RoofSurface//g:Polygon', NS)
                    walls = part.findall('./b:boundedBy/b:WallSurface//g:Polygon', NS)
                    if not roof or not walls:
                        raise ValueError('Missing roof or facade')
                    faces = np.asarray([t for face in roof+walls
                                        for t in mesh.triangulate(mesh.ring(face.find('g:exterior', NS)),
                                        [mesh.ring(r) for r in face.findall('g:interior', NS)])], dtype='<f8')
                    if not len(faces):
                        raise ValueError('Empty mesh')
                    if not np.all((faces[:, :, 2] > 400) & (faces[:, :, 2] < 900)):
                        raise ValueError('Unexpected DHHN2016 height')
                except ValueError as error:
                    rejected.extend({'id': b['id'], 'reason': str(error)} for b in records)
                    continue
                accepted.append({'id': bid, 'triangles': len(faces)})
                lo, hi = faces.min(axis=1), faces.max(axis=1)
                for key, (w, s, e, n) in catalogue:
                    mask = (hi[:, 0] >= w) & (lo[:, 0] <= e) & (hi[:, 1] >= s) & (lo[:, 1] <= n)
                    if np.any(mask):
                        triangles[key].append(faces[mask])
            element.clear()
        print('Triangulated', tile, len(accepted), 'parts', flush=True)
    if seen != set(by_part):
        raise ValueError('Not all footprint objects were checked')
    manifest = {'schema': 1, 'version': VERSION, 'crs': 'EPSG:25832', 'verticalDatum': 'DHHN2016',
                'bounds': BOUNDS, 'coverage': BOUNDS,
                'excludedBuildings': sorted({r['id'].rsplit(':', 1)[0] for r in rejected}), 'tiles': []}
    ground_sources, valid_cells, missing_cells = [], 0, 0
    for key, bounds in catalogue:
        w, s, e, n = bounds
        path = RAW / 'munich-extensions' / f'{w//1000}_{s//1000}.tif'
        meta = json.loads(path.with_suffix('.tif.source.json').read_text())
        if mesh.digest(path) != meta['sha256']:
            raise ValueError('Terrain source changed')
        with rasterio.open(path) as src:
            if src.crs.to_epsg() != 25832 or tuple(src.bounds) != tuple(bounds) or src.res != (1, 1):
                raise ValueError('Unexpected DGM1 grid')
            raw = src.read(1)
            valid = ((src.read_masks(1) == 255) & np.isfinite(raw)).reshape(500, 2, 500, 2).all(axis=(1, 3))
            mean = raw.reshape(500, 2, 500, 2).mean(axis=(1, 3), dtype=np.float64)
            if np.any((mean[valid] < 400) | (mean[valid] > 650)):
                raise ValueError('Unexpected Munich ground heights')
            dem = np.where(valid, np.rint(mean*10), -32768).astype('<i2')
            meta['rasterTags'] = src.tags()
        ground_sources.append(meta)
        valid_cells += int(valid.sum()); missing_cells += int((~valid).sum())
        tri = np.concatenate(triangles[key]) if triangles[key] else np.empty((0, 3, 3))
        max_z = float(tri[:, :, 2].max()) if len(tri) else 0
        tri[:, :, 0] -= w; tri[:, :, 1] -= s
        vertices, indices = np.unique(np.round(tri.reshape(-1, 3), 3), axis=0, return_inverse=True)
        encode = lambda a: base64.b64encode(a.tobytes()).decode()
        data = {'version': VERSION, 'crs': 'EPSG:25832', 'verticalDatum': 'DHHN2016',
                'bounds': bounds, 'coverage': bounds, 'resolution': 2, 'width': 500, 'height': 500,
                'vertices': encode(vertices.astype('<f4')), 'triangles': encode(indices.astype('<u4')),
                'ground': encode(dem), 'excludedBuildings': []}
        raw = json.dumps(data, separators=(',', ':')).encode()
        packed = gzip.compress(raw, compresslevel=9, mtime=0)
        sha = hashlib.sha256(packed).hexdigest()
        name = f'{key}-{sha[:16]}.shade'
        (OUT / name).write_bytes(packed)
        manifest['tiles'].append({'id': key, 'bounds': bounds, 'maxZ': max_z, 'url': '/data/munich-shade/'+name,
                                  'sha256': sha, 'bytes': len(packed), 'expandedBytes': len(raw)})
        print('Prepared', key, len(tri), 'triangles', len(packed), 'bytes', flush=True)
    (ROOT / 'public/data/munich-shade-library.json').write_text(json.dumps(manifest, separators=(',', ':')))
    # Content-addressed files from earlier builds must not inflate deploy/native assets.
    current = {Path(t['url']).name for t in manifest['tiles']}
    for path in OUT.glob('*.shade'):
        if path.name not in current:
            path.unlink()
    report = {'version': VERSION, 'boundsUTM32': BOUNDS, 'crs': 'EPSG:25832', 'verticalDatum': 'DHHN2016',
              'sourceTriangles': sum(r['triangles'] for r in accepted), 'acceptedParts': len(accepted),
              'rejectedBuildings': rejected, 'buildingSources': sources, 'groundSources': ground_sources,
              'tiles': len(catalogue), 'bytes': sum(t['bytes'] for t in manifest['tiles']),
              'validGroundCells': valid_cells, 'missingGroundCells': missing_cells,
              'groundResolutionMeters': 2, 'quantizationMeters': .1,
              'limits': 'Experimental LoD2 roofs, not a surveyed digital twin. DGM1 supplies receiver heights only. No tree or terrain occlusion; uncertain objects and bridges remain unknown. Field validation pending.'}
    (ROOT / 'docs/munich-shade-data.json').write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    main()
