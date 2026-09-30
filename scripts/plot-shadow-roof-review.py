"""Plot original source roof cross-sections against classified LiDAR returns."""
import os
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

os.environ.setdefault('MPLCONFIGDIR', '/tmp/cooler-walks-matplotlib')
os.environ.setdefault('XDG_CACHE_HOME', '/tmp/cooler-walks-cache')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import laspy
import numpy as np
from shapely.geometry import Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/shadow-validation'
NS = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml'}


def extract_buildings(ids):
    """Use the audited original archives; extracted fragments remain ignored."""
    remaining = {bid for bid in ids if not (RAW / (bid+'.gml')).exists()}
    audit = json.loads((ROOT / 'docs/detailed-shade-data.json').read_text())
    for source in audit['roofsAndFacades']:
        if not remaining:
            break
        archive = ROOT / f"data/raw/buildings-{source['tile']}.zip"
        with archive.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == source['sha256']
        with zipfile.ZipFile(archive) as zipped:
            for name in zipped.namelist():
                if not name.endswith('.gml'):
                    continue
                with zipped.open(name) as stream:
                    for _, element in ET.iterparse(stream, events=['end']):
                        if element.tag != '{'+NS['b']+'}Building':
                            continue
                        bid = element.get('{'+NS['g']+'}id')
                        if bid in remaining:
                            ET.ElementTree(element).write(RAW / (bid+'.gml'), encoding='utf-8')
                            remaining.remove(bid)
                        element.clear()
    assert not remaining, f'Missing source buildings: {remaining}'


def roofs(path):
    faces = []
    for element in ET.parse(path).findall('.//b:RoofSurface//g:Polygon', NS):
        rings = []
        for tag in ['exterior', 'interior']:
            for ring in element.findall('g:'+tag, NS):
                xyz = np.array(list(map(float, ring.find('.//g:posList', NS).text.split()))).reshape(-1, 3)[:-1]
                rings.append(xyz)
        origin = rings[0].mean(axis=0)
        _, _, vh = np.linalg.svd(rings[0]-origin)
        normal = vh[-1]
        if abs(normal[2]) < 1e-9:
            continue
        faces.append((origin, normal, Polygon(rings[0][:, :2], [r[:, :2] for r in rings[1:]])))
    return faces


def top(faces, x, y):
    hits = [o[2] - ((x-o[0])*n[0]+(y-o[1])*n[1])/n[2]
            for o, n, polygon in faces if polygon.covers(Point(x, y))]
    return max(hits) if hits else np.nan


def main():
    cases = [
        ('Zurich HB south wing', 'ID_2B72335B-84F1-4A56-B970-BE46D7EE410D', 2683210, 1247990, 75),
        ('Paradeplatz / Bärengasse courtyard', 'ID_AEAE79C4-E970-47D5-8A83-BD6FBCE5E7BE', 2683070, 1247190, 22),
    ]
    extract_buildings([case[1] for case in cases])
    fig, axes = plt.subplots(2, 1, figsize=(10, 7.5), layout='constrained')
    for ax, (label, bid, x, y, radius) in zip(axes, cases):
        faces = roofs(RAW / (bid+'.gml'))
        cloud = laspy.read(RAW / 'lidar' / f'{x//500*500}_{y//500*500}.laz')
        valid = ((abs(cloud.y-y) <= .5) & (abs(cloud.x-x) <= radius)
                 & (np.asarray(cloud.classification) == 6) & ~np.asarray(cloud.withheld).astype(bool))
        ax.scatter(np.asarray(cloud.x)[valid]-x, np.asarray(cloud.z)[valid], s=3, alpha=.45,
                   color='#387a94', label='2021–2022 LiDAR building returns (±0.5 m strip)')
        eastings = np.arange(x-radius, x+radius, .2)
        ax.plot(eastings-x, [top(faces, e, y) for e in eastings], color='#b55132', lw=1.6,
                label='2019 CityGML uppermost roof at the section line')
        ax.axvline(0, color='#222', lw=.7, ls=':')
        ax.set(title=f'{label} · northing {y:,} m', xlabel=f'Easting offset from {x:,} m (LV95)', ylabel='Height (m LN02)')
        ax.grid(alpha=.15)
        ax.legend(loc='best', fontsize=8)
    fig.suptitle('Different historical surfaces — neither source is current ground truth', fontsize=13)
    fig.text(.01, -.035, 'Sources: © swisstopo, swissBUILDINGS3D 3.0 beta; Canton Zurich LiDAR 2021–2022.\nStation: SBB documents a temporary protective roof and a new roof storey during the 2018–2023 renovation.', fontsize=8)
    target = ROOT / 'docs/validation/roof-source-sections.png'
    target.parent.mkdir(exist_ok=True)
    fig.savefig(target, dpi=160, bbox_inches='tight')
    plt.close(fig)


if __name__ == '__main__':
    main()
