"""Prepare a bounded, ground-referenced CityGML shadow model. Raw data stays ignored.

Uses real roof/facade polygons, preserving holes; triangulates in each face's plane.
The DTM supplies receiver elevation only: distant terrain and foliage are NOT occluders.
"""
import base64
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
from pyproj import Transformer
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterio.transform import from_origin
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon, box

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-shadow'
BOUNDS = [2682000, 1246000, 2684000, 1248500]
INNER = [2682200, 1246200, 2683800, 1248300]
RES = 2
NS = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml', 'gen': 'http://www.opengis.net/citygml/generics/2.0'}
SUPPORTED = {'Gebaeude Einzelhaus', 'Hochhaus', 'Sakrales Gebaeude', 'Sakraler Turm', 'Lagertank'}


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def ring(element):
    nums = np.fromstring(element.find('.//g:posList', NS).text, sep=' ')
    if len(nums) % 3 or len(nums) < 12:
        raise ValueError('Invalid XYZ ring')
    pts = nums.reshape(-1, 3)
    if not np.all(np.isfinite(pts)) or not np.allclose(pts[0], pts[-1]):
        raise ValueError('Unclosed or invalid XYZ ring')
    return pts[:-1]


def triangulate(exterior, interiors=()):
    """Constrained triangulation preserves concave roof edges and courtyard holes."""
    origin = exterior[0]
    # Newell normal, stable for a polygon whose first three vertices are collinear.
    local = exterior - origin
    normal = np.cross(local, np.roll(local, -1, axis=0)).sum(axis=0)
    norm = np.linalg.norm(normal)
    if norm < 1e-7:
        raise ValueError('Degenerate surface')
    normal = normal / norm
    if max(abs((p - origin) @ normal) for r in [exterior, *interiors] for p in r) > .05:
        raise ValueError('Non-planar source surface exceeds 5 cm')
    axis = int(np.argmax(abs(normal)))
    axes = [i for i in range(3) if i != axis]
    poly = Polygon(exterior[:, axes], [r[:, axes] for r in interiors])
    if not poly.is_valid or poly.area < 1e-7:
        raise ValueError('Invalid projected polygon')
    result = []
    for tri in constrained_delaunay_triangles(poly).geoms:
        xy = np.array(tri.exterior.coords)[:3]
        xyz = np.zeros((3, 3))
        xyz[:, axes] = xy
        xyz[:, axis] = origin[axis] - ((xy - origin[axes]) @ normal[axes]) / normal[axis]
        result.append(xyz)
    if abs(sum(Polygon(t[:, axes]).area for t in result) - poly.area) > .001:
        raise ValueError('Triangulation changed polygon area')
    return result


def main():
    RAW.mkdir(exist_ok=True)
    config = json.loads((ROOT / 'src/lib/coverage/zurich-extract.json').read_text())
    clip = box(*BOUNDS)
    triangles, records, sources, rejected, seen = [], [], [], [], set()
    for tile in config['buildingTiles']:
        archive = ROOT / 'data/raw' / f'buildings-{tile}.zip'
        stac = json.loads((ROOT / config['rawDirectory'] / f'buildings-{tile}-stac.json').read_text())
        asset = next(v for k, v in stac['assets'].items() if k.endswith('_2056_5728.citygml.zip'))
        sha = digest(archive)
        if asset['file:checksum'].lower() != '1220' + sha:
            raise ValueError('CityGML checksum mismatch')
        sources.append({'tile': tile, 'sha256': sha, 'url': asset['href'], 'observation': '2019', 'crs': 'EPSG:2056 / EPSG:5728 (LN02)'})
        print('Reading roof and wall geometry', tile, flush=True)
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not name.endswith('.gml'):
                    continue
                with z.open(name) as f:
                    for _, e in ET.iterparse(f, events=['end']):
                        if e.tag != '{' + NS['b'] + '}Building':
                            continue
                        bid = e.get('{' + NS['g'] + '}id')
                        ground = e.findall('.//b:GroundSurface//g:exterior', NS)
                        rings = [ring(p) for p in ground]
                        intersects = any(Polygon(p[:, :2]).intersects(clip) for p in rings)
                        if not intersects or bid in seen:
                            e.clear(); continue
                        seen.add(bid)
                        kinds = {a.find('gen:value', NS).text for a in e.findall('.//gen:stringAttribute', NS) if a.get('name') == 'OBJEKTART'}
                        if not kinds or not kinds.issubset(SUPPORTED):
                            e.clear(); continue
                        faces = e.findall('.//b:RoofSurface//g:Polygon', NS) + e.findall('.//b:WallSurface//g:Polygon', NS)
                        if not e.findall('.//b:RoofSurface', NS) or not e.findall('.//b:WallSurface', NS):
                            rejected.append({'id': bid, 'reason': 'Missing roof or facade'}); e.clear(); continue
                        part = []
                        try:
                            for face in faces:
                                part.extend(triangulate(ring(face.find('g:exterior', NS)), [ring(p) for p in face.findall('g:interior', NS)]))
                        except ValueError as error:
                            rejected.append({'id': bid, 'reason': str(error)}); e.clear(); continue
                        records.append({'id': bid, 'triangles': len(part)})
                        triangles.extend(part)
                        e.clear()
    if not triangles:
        raise ValueError('No real roof geometry')
    # Small local coordinates retain centimetre source detail in Float32.
    tri = np.array(triangles, dtype=np.float64)
    tri[:, :, 0] -= BOUNDS[0]
    tri[:, :, 1] -= BOUNDS[1]
    vertices, indices = np.unique(np.round(tri.reshape(-1, 3), 3), axis=0, return_inverse=True)
    vertices = vertices.astype('<f4')
    indices = indices.astype('<u4')
    print('Mesh prepared:', len(records), 'buildings,', len(tri), 'triangles;', len(rejected), 'excluded', flush=True)
    width, height = (BOUNDS[2] - BOUNDS[0]) // RES, (BOUNDS[3] - BOUNDS[1]) // RES
    target = np.full((height, width), -9999, dtype=np.float32)
    transform = from_origin(BOUNDS[0], BOUNDS[3], RES, RES)
    raster_sources = []
    for part in ['south', 'north']:
        archive = RAW / f'raster-{part}.zip'
        if not archive.exists() or not zipfile.is_zipfile(archive):
            raise ValueError(f'Complete raster export needed: {archive}')
        archive_sha = digest(archive)
        with zipfile.ZipFile(archive) as z:
            names = [n for n in z.namelist() if n.lower().endswith('.tif') and 'dtm' in n.lower()]
        if not names:
            raise ValueError('DTM TIFF not found in export')
        for name in names:
            with rasterio.open(f'/vsizip/{archive}/{name}') as src:
                crs = rasterio.crs.CRS.from_epsg(2056)
                if src.crs not in [None, crs]:
                    raise ValueError('Unexpected raster coordinates')
                # Delivered TIFFs omit the EPSG tag. Product 555 explicitly specifies
                # CH1903+ / LV95; check filename/worldfile grid before assigning it.
                match = re.fullmatch(r'(\d{7})_(\d{7})\.tif', Path(name).name)
                if not match:
                    raise ValueError('Unexpected terrain tile name')
                x, y = map(int, match.groups())
                if tuple(src.bounds) != (x, y, x+500, y+500) or src.res != (.25, .25):
                    raise ValueError('Terrain worldfile disagrees with LV95 tile grid')
                tmp = np.full_like(target, -9999)
                reproject(rasterio.band(src, 1), tmp, src_transform=src.transform, src_crs=crs,
                          dst_transform=transform, dst_crs=crs, dst_nodata=-9999, resampling=Resampling.average)
                mask = np.zeros_like(target, dtype=np.uint8)
                reproject(src.read_masks(1), mask, src_transform=src.transform, src_crs=crs,
                          dst_transform=transform, dst_crs=crs, resampling=Resampling.min)
                valid = (tmp != -9999) & (mask == 255)
                target[valid] = tmp[valid]
                raster_sources.append({'archive': archive.name, 'sha256': archive_sha, 'member': name,
                                       'crs': 'LV95 assigned from product 555 metadata; checked against tile worldfile', 'resolution': list(src.res), 'nodata': src.nodata, 'bounds': list(src.bounds)})
    valid = target != -9999
    if not np.any(valid) or np.any((target[valid] < 300) | (target[valid] > 900)):
        raise ValueError('Unexpected LN02 terrain elevations')
    # Decimetres above LN02; -32768 preserves missing data. No hole filling.
    ground = np.full_like(target, -32768, dtype='<i2')
    ground[valid] = np.rint(target[valid] * 10).astype('<i2')
    data = {'version': 'zurich-roofs-dtm-2026-09-30-v1', 'crs': 'EPSG:2056', 'verticalDatum': 'LN02',
            'bounds': BOUNDS, 'coverage': INNER, 'resolution': RES, 'width': width, 'height': height,
            'vertices': base64.b64encode(vertices.tobytes()).decode(),
            'triangles': base64.b64encode(indices.tobytes()).decode(), 'ground': base64.b64encode(ground.tobytes()).decode(),
            'excludedBuildings': [r['id'] for r in rejected]}
    out = ROOT / 'public/data/zurich-detailed-shade.json'
    out.write_text(json.dumps(data, separators=(',', ':')))
    # OSM elevated/underground ways cannot use bare-earth elevation as a walking deck.
    raw = json.loads((ROOT / config['rawDirectory'] / 'osm.json').read_text())
    excluded_ways = sorted(e['id'] for e in raw['elements'] if e['type'] == 'way' and any(
        e.get('tags', {}).get(key, 'no') not in ['no', '0', 'false'] for key in ['bridge', 'tunnel', 'covered', 'layer', 'level']))
    (RAW / 'non-ground-ways.json').write_text(json.dumps(excluded_ways))
    report = {'version': data['version'], 'fetchedAt': '2026-09-30', 'modelBoundsLV95': BOUNDS,
              'receiverCoverageLV95': INNER, 'groundResolutionMeters': RES, 'groundQuantizationMeters': .1,
              'triangles': len(tri), 'vertices': len(vertices), 'buildings': len(records), 'rejectedBuildings': rejected,
              'validGroundCells': int(valid.sum()), 'missingGroundCells': int((~valid).sum()),
              'groundRangeLN02': [float(target[valid].min()), float(target[valid].max())],
              'roofsAndFacades': sources, 'groundSources': raster_sources, 'derivedSha256': digest(out),
              'derivedBytes': out.stat().st_size, 'nonGroundWays': len(excluded_ways),
              'treeDecision': '2021/2022 LiDAR was predominantly leaf-off; canopy height alone does not establish crown base or leaf-on transmission. No tree shade credited.',
              'terrainDecision': 'DTM provides receiver elevation. No terrain obstruction: the bounded extract cannot establish distant hill horizons.',
              'limitations': ['Historical 2019 buildings with 2021/2022 ground', 'Roof holes retained; glass/open structures remain uncertain',
                              'Ground grid averaged to 2 m; not pavement-side precision', 'No field observation validation',
                              'Outside detailed coverage: existing flat-ground model; bridges/tunnels in detailed area: unknown']}
    (ROOT / 'docs/detailed-shade-data.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['triangles', 'buildings', 'validGroundCells', 'missingGroundCells', 'derivedBytes']}), flush=True)


if __name__ == '__main__':
    main()
