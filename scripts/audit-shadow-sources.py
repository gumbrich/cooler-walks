"""Independent validation, not production data preparation.

Reference rays intersect original CityGML planes/polygons (no triangulation).
Ground reference uses direct aligned pixel blocks (no raster reprojection).
Solar reference uses pvlib's NREL SPA, not SunCalc.
"""
import base64
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import pandas as pd
import pvlib
import rasterio
from shapely.geometry import LineString, Point, Polygon, box
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/shadow-validation'
NS = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml',
      'gen': 'http://www.opengis.net/citygml/generics/2.0'}


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def summary(values):
    a = np.array(values, dtype=float)
    if not len(a):
        return {'count': 0}
    return {'count': len(a), 'minimum': float(a.min()), 'median': float(np.median(a)),
            'p95Absolute': float(np.quantile(abs(a), .95)), 'maximumAbsolute': float(abs(a).max())}


def audit_solar(predictions):
    results, fixtures = [], []
    for row in predictions['solarCases']:
        lon, lat = row['point']
        ref = pvlib.solarposition.spa_python(pd.DatetimeIndex([row['instant']]), lat, lon,
                                           pressure=0, delta_t=69.184).iloc[0]
        altitude, azimuth = np.radians([ref.elevation, ref.azimuth])
        def vector(a, z):
            return np.array([math.cos(a)*math.sin(z), math.cos(a)*math.cos(z), math.sin(a)])
        angle = math.degrees(math.acos(float(np.clip(
            vector(altitude, azimuth) @ vector(row['altitude'], row['azimuth']), -1, 1))))
        results.append({'place': row['place'], 'instant': row['instant'], 'angleDegrees': angle})
        fixtures.append({'place': row['place'], 'point': row['point'], 'instant': row['instant'],
                         'altitude': float(altitude), 'azimuth': float(azimuth)})
    target = ROOT / 'tests/fixtures/solar-spa.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({'reference': 'pvlib 0.16.1 NREL SPA geometric elevation',
                                 'deltaTSeconds': 69.184, 'toleranceDegrees': .25,
                                 'cases': fixtures}, indent=2) + '\n')
    report = {'reference': 'pvlib 0.16.1 NREL SPA', 'angularErrorDegrees': summary([r['angleDegrees'] for r in results]),
              'toleranceDegrees': .25, 'worstCases': sorted(results, key=lambda r: r['angleDegrees'], reverse=True)[:8],
              'passed': all(r['angleDegrees'] <= .25 for r in results),
              'scope': 'Geometric direction only, including night. No atmospheric or field validation.'}
    print('Solar:', json.dumps(report), flush=True)
    return report


class Rasters:
    def __init__(self):
        self.files, self.cache = {}, OrderedDict()
        for part in ['south', 'north']:
            archive = ROOT / f'data/raw/zurich-shadow/raster-{part}.zip'
            with zipfile.ZipFile(archive) as z:
                for name in z.namelist():
                    if not name.endswith('.tif'):
                        continue
                    kind = 'dtm' if 'dtm' in name.lower() else 'building' if 'nDOM_Geb' in name else 'vegetation'
                    x, y = map(int, Path(name).stem.split('_')[-2:])
                    self.files.setdefault((kind, x, y), (archive, name))

    def tile(self, key):
        if key not in self.files:
            return None
        if key not in self.cache:
            archive, name = self.files[key]
            with rasterio.open(f'/vsizip/{archive}/{name}') as raster:
                assert raster.res == (.25, .25)
                _, x, y = key
                assert raster.shape == (2000, 2000)
                assert tuple(raster.bounds) == (x, y, x+500, y+500)
                self.cache[key] = (raster.read(1), raster.read_masks(1))
            if len(self.cache) > 4:
                self.cache.popitem(last=False)
        self.cache.move_to_end(key)
        return self.cache[key]

    def at(self, kind, x, y):
        tx, ty = math.floor(x/500)*500, math.floor(y/500)*500
        tile = self.tile((kind, tx, ty))
        if tile is None:
            return None
        row, col = min(1999, int((ty+500-y)*4)), min(1999, int((x-tx)*4))
        return float(tile[0][row, col]) if tile[1][row, col] == 255 else None


def audit_ground(model, predictions, rasters):
    west, south, east, north = model['bounds']
    ground = np.frombuffer(base64.b64decode(model['ground']), dtype='<i2').reshape(model['height'], model['width'])
    differences, masks_equal, checked = [], True, 0
    for x in range(west, east, 500):
        for y in range(south, north, 500):
            pixels, mask = rasters.tile(('dtm', x, y))
            # Source and target grids align exactly: 8x8 source cells per output cell.
            average = pixels.astype(np.float64).reshape(250, 8, 250, 8).mean(axis=(1, 3))
            valid = (mask.reshape(250, 8, 250, 8) == 255).all(axis=(1, 3))
            r, c = (north-y-500)//2, (x-west)//2
            stored = ground[r:r+250, c:c+250]
            masks_equal &= bool(np.array_equal(stored != -32768, valid))
            differences.extend((stored[valid]/10-average[valid]).tolist())
            checked += int(valid.sum())
    native_differences = []
    for row in predictions['rays']:
        native = rasters.at('dtm', *row['point'])
        if native is not None and row['ground'] is not None:
            native_differences.append(row['ground']-native)
    stats = summary(differences)
    report = {'cellsChecked': checked, 'storedMinusIndependentMeanMeters': stats,
              'missingMasksAgree': masks_equal, 'toleranceMeters': .051,
              'passed': masks_equal and stats['maximumAbsolute'] <= .051,
              'routeGridMinusNativePixelMeters': summary(native_differences),
              'scope': 'Processing fidelity and resolution sensitivity, not terrain survey accuracy.'}
    print('Ground:', json.dumps(report), flush=True)
    return report


def xyz(boundary):
    values = [float(v) for v in boundary.find('.//g:posList', NS).text.split()]
    points = np.array(values).reshape(-1, 3)
    assert np.linalg.norm(points[0]-points[-1]) < 1e-5
    return points[:-1]


class SourceFaces:
    def __init__(self, bounds, source_audit, query_region=None):
        self.faces, boxes, seen = [], [], set()
        self.max_z = -math.inf
        supported = {'Gebaeude Einzelhaus', 'Hochhaus', 'Sakrales Gebaeude', 'Sakraler Turm', 'Lagertank'}
        region = box(*bounds) if query_region is None else query_region
        for source in source_audit['roofsAndFacades']:
            archive = ROOT / f"data/raw/buildings-{source['tile']}.zip"
            assert sha(archive) == source['sha256'], 'Raw building archive changed'
            print('Independent source faces:', source['tile'], flush=True)
            with zipfile.ZipFile(archive) as z:
                for name in z.namelist():
                    if not name.endswith('.gml'):
                        continue
                    with z.open(name) as stream:
                        for _, element in ET.iterparse(stream, events=['end']):
                            if element.tag != '{'+NS['b']+'}Building':
                                continue
                            bid = element.get('{'+NS['g']+'}id')
                            grounds = element.findall('.//b:GroundSurface//g:exterior', NS)
                            kinds = {e.find('gen:value', NS).text for e in element.findall('.//gen:stringAttribute', NS)
                                     if e.get('name') == 'OBJEKTART'}
                            if (bid in seen or not kinds or not kinds.issubset(supported)
                                    or bid in {r['id'] for r in source_audit['rejectedBuildings']}
                                    or not any(Polygon(xyz(g)[:, :2]).intersects(region) for g in grounds)):
                                element.clear(); continue
                            seen.add(bid)
                            for kind in ['RoofSurface', 'WallSurface']:
                                for face in element.findall(f'.//b:{kind}//g:Polygon', NS):
                                    exterior = xyz(face.find('g:exterior', NS))
                                    holes = [xyz(h) for h in face.findall('g:interior', NS)]
                                    origin = exterior.mean(axis=0)
                                    # Independent least-squares plane, not the production Newell triangulation.
                                    _, _, vh = np.linalg.svd(exterior-origin, full_matrices=False)
                                    normal = vh[-1]
                                    axes = [i for i in range(3) if i != int(abs(normal).argmax())]
                                    polygon = Polygon(exterior[:, axes], [h[:, axes] for h in holes])
                                    assert polygon.is_valid
                                    lo, hi = exterior.min(axis=0), exterior.max(axis=0)
                                    self.max_z = max(self.max_z, float(hi[2]))
                                    self.faces.append((origin, normal, axes, polygon, bid, kind))
                                    boxes.append(box(lo[0], lo[1], hi[0], hi[1]))
                            element.clear()
        if query_region is None:
            assert len(seen) == source_audit['buildings'], 'Reference/source building selection disagrees'
        self.building_count = len(seen)
        self.tree = STRtree(boxes)
        self.normals = np.array([f[1] for f in self.faces])
        self.origins = np.array([f[0] for f in self.faces])
        print('Reference:', len(seen), 'buildings;', len(self.faces), 'original CityGML faces', flush=True)

    def exposure(self, row, bounds):
        if row['ground'] is None or row['altitude'] < math.radians(10):
            return 'unknown', None
        x, y = row['point']
        origin = np.array([x, y, row['ground']])
        direction = np.array([math.sin(row['azimuth']), math.cos(row['azimuth']), math.tan(row['altitude'])])
        reach = max(0, (self.max_z-origin[2])/direction[2])
        end = origin[:2]+reach*direction[:2]
        candidates = self.tree.query(LineString([origin[:2], end]))
        denominator = self.normals[candidates] @ direction
        with np.errstate(divide='ignore', invalid='ignore'):
            distances = ((self.origins[candidates]-origin)*self.normals[candidates]).sum(axis=1)/denominator
        valid = (abs(denominator) > 1e-10) & (distances > 1e-5/np.linalg.norm(direction)) & (distances <= reach+.01)
        near_edge = False
        for index, distance in zip(candidates[valid], distances[valid]):
            _, _, axes, polygon, bid, _ = self.faces[index]
            point = Point((origin+distance*direction)[axes])
            if polygon.boundary.distance(point) <= .02:
                near_edge = True
            elif polygon.contains(point):
                return 'shade', bid
        if near_edge:
            return 'boundary', None
        return ('sun' if box(*bounds).covers(Point(end)) else 'unknown'), None

    def roof(self, x, y):
        hits = []
        for index in self.tree.query(Point(x, y)):
            origin, normal, axes, polygon, bid, kind = self.faces[index]
            if kind != 'RoofSurface' or abs(normal[2]) < 1e-9:
                continue
            z = origin[2] - ((x-origin[0])*normal[0]+(y-origin[1])*normal[1])/normal[2]
            p = Point(np.array([x, y, z])[axes])
            if polygon.covers(p):
                hits.append((float(z), bid, polygon.boundary.distance(p)))
        if not hits:
            return None
        # Choose the actual uppermost roof BEFORE applying the edge exclusion.
        # Otherwise a lower covered roof can masquerade as the visible surface.
        top = max(hits)
        return top[:2] if top[2] >= 1 else None


def audit_geometry(predictions, model, faces):
    mismatches, boundaries, counts, fixtures = [], 0, {}, []
    for row in predictions['rays']:
        reference, building = faces.exposure(row, model['bounds'])
        counts[reference] = counts.get(reference, 0)+1
        if reference == 'boundary':
            boundaries += 1
            continue
        if reference != row['geometryExposure']:
            mismatches.append({**row, 'reference': reference, 'referenceBuilding': building})
        fixtures.append({'point': row['point'], 'altitude': row['altitude'], 'azimuth': row['azimuth'],
                         'expected': reference})
    (ROOT / 'tests/fixtures/shadow-source-reference.json').write_text(json.dumps(
        {'modelSha256': predictions['modelSha256'], 'reference': 'Direct source CityGML plane/polygon intersections',
         'cases': fixtures}, separators=(',', ':'))+'\n')
    report = {'rays': len(predictions['rays']), 'routes': len(predictions['routes']), 'classCounts': counts,
              'excludedBoundaryRays': boundaries, 'stableComparisons': len(fixtures), 'mismatches': mismatches,
              'passed': not mismatches and len(fixtures) > 0,
              'scope': 'Raw-face versus runtime mesh agreement at sampled real routes. Not field-shadow accuracy.'}
    print('Geometry:', json.dumps({k: v for k, v in report.items() if k != 'mismatches'}), flush=True)
    return report


def audit_roof_heights(model, faces, rasters):
    differences, outliers, missing = [], [], 0
    west, south, east, north = model['coverage']
    for x in range(west+10, east, 20):
        for y in range(south+10, north, 20):
            roof = faces.roof(x, y)
            if roof is None:
                continue
            ground = rasters.at('dtm', x, y)
            height = rasters.at('building', x, y)
            if ground is None or height is None or height <= 0:
                missing += 1; continue
            difference = roof[0]-(ground+height)
            differences.append(difference)
            if abs(difference) > 2:
                outliers.append({'pointLV95': [x, y], 'buildingId': roof[1], 'citygmlRoofLN02': roof[0],
                                 'lidarDTMPlusBuildingLN02': ground+height, 'differenceMeters': difference})
    report = {'citygmlMinusLidarMeters': summary(differences), 'missingLidarSamples': missing,
              'flagThresholdMeters': 2, 'flaggedSamples': len(outliers),
              'outliers': sorted(outliers, key=lambda r: abs(r['differenceMeters']), reverse=True),
              'status': 'needs-review' if outliers else 'no-large-discrepancy-in-sample',
              'scope': '2019 photogrammetric roof versus 2021–2022 LiDAR at a fixed 20 m grid, >=1 m inside a roof face. Different dates, raster resolution and roof details prevent treating either as current ground truth.'}
    print('Roof consistency:', json.dumps({k: v for k, v in report.items() if k != 'outliers'}), flush=True)
    return report


def main():
    predictions = json.loads((RAW / 'predictions.json').read_text())
    path = ROOT / 'public/data/zurich-detailed-shade.json'
    assert sha(path) == predictions['modelSha256']
    model = json.loads(path.read_text())
    source_audit = json.loads((ROOT / 'docs/detailed-shade-data.json').read_text())
    for archive, expected in {(r['archive'], r['sha256']) for r in source_audit['groundSources']}:
        assert sha(ROOT / 'data/raw/zurich-shadow' / archive) == expected
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'model': predictions['model'],
              'sourceRevision': predictions['sourceRevision'], 'modelSha256': predictions['modelSha256'],
              'dataVersion': predictions['dataVersion'], 'solar': audit_solar(predictions)}
    rasters = Rasters()
    report['ground'] = audit_ground(model, predictions, rasters)
    faces = SourceFaces(model['bounds'], source_audit)
    report['geometry'] = audit_geometry(predictions, model, faces)
    report['roofConsistency'] = audit_roof_heights(model, faces, rasters)
    report['fieldValidation'] = {'status': 'not-performed', 'observationCount': 0}
    report['expansionGate'] = 'hold'
    (ROOT / 'docs/shadow-validation-audit.json').write_text(json.dumps(report, indent=2)+'\n')
    print('Expansion gate: HOLD. Real-world observation validation is still required.', flush=True)
    if not all(report[k]['passed'] for k in ['solar', 'ground', 'geometry']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
