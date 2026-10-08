"""Render the saved route/sample comparison on real committed Zurich geography."""
import json
import os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR', '/tmp/cooler-mpl')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection
from matplotlib.lines import Line2D
import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import substring

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/tree-shade-comparison'
report = json.loads((OUT / 'comparison.json').read_text())
ours = json.loads((OUT / 'cooler-routes.json').read_text())
external = json.loads((OUT / 'external-routes.json').read_text())
points = json.loads((OUT / 'point-comparisons.json').read_text())[0]['points']
data = json.loads((ROOT / 'public/data/zurich.json').read_text())
projector = Transformer.from_crs(4326, 2056, always_xy=True).transform
def project(coords):
    return np.array([projector(*p) for p in coords])

variants = ours['scenarios'][0]['variants']
routes = [project(variants[0]['selected']['coordinates']), project(variants[1]['selected']['coordinates']),
          project(external['services']['vampire']['routes'][0]['coordinates'])]
combined = np.concatenate(routes)
lo, hi = combined.min(axis=0) - [170, 130], combined.max(axis=0) + [170, 130]
def visible(poly):
    return np.all(poly.max(axis=0) >= lo) and np.all(poly.min(axis=0) <= hi)

nodes = project([n['point'] for n in data['nodes']])
roads = nodes[np.array([[e['a'], e['b']] for e in data['edges']])]
roads = roads[np.all(roads.max(axis=1) >= lo, axis=1) & np.all(roads.min(axis=1) <= hi, axis=1)]
buildings = [p for b in data['buildings'] if visible(p := project(b['ring']))]
waters = [p for w in data['water'] if visible(p := project(w['rings'][0]))]
positions = project([p['point'] for p in points])
fixed_line = LineString(routes[1])
scale = fixed_line.length / points[-1]['toMeters']
sample_segments = [np.array(substring(fixed_line, p['fromMeters'] * scale, p['toMeters'] * scale).coords) for p in points]
colors = {'shade': '#176247', 'sun': '#d69025', 'unknown': '#8d9292'}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'text.color': '#173f35'})
fig, axes = plt.subplots(1, 3, figsize=(15, 10), facecolor='#f7f4eb')
fig.suptitle('Tree shade comparison · Bellevue → Zürichhorn', x=.055, y=.965, ha='left', fontsize=23)
fig.text(.055, .92, '1 August 2024, 16:00 CEST interpretation · 457 fixed points on the same 1.594 km path', fontsize=12)
titles = ['Route choice', 'Cooler Walks: buildings + trees', 'Published Vampire raster']
for i, ax in enumerate(axes):
    ax.set_facecolor('#eeeae0')
    ax.add_collection(PolyCollection(waters, facecolor='#b6d3d8', edgecolor='none'))
    ax.add_collection(PolyCollection(buildings, facecolor='#d2cec2', edgecolor='none'))
    ax.add_collection(LineCollection(roads, colors='#fffdf6', linewidths=1.1))
    ax.set_xlim(lo[0], hi[0]); ax.set_ylim(lo[1], hi[1]); ax.set_aspect('equal')
    ax.set_xticks([]); ax.set_yticks([])
    for spine in ax.spines.values(): spine.set_visible(False)
    ax.set_title(titles[i], loc='left', fontsize=12, pad=14)
    if i == 0:
        for coords, col, width, style in zip(routes, ['#777d79', '#176247', '#a05288'], [2, 3.8, 2.3], [':', '-', '--']):
            ax.plot(*coords.T, color=col, lw=width, ls=style, zorder=5)
    else:
        ax.plot(*routes[1].T, color='white', lw=5, zorder=4)
        key = 'tree' if i == 1 else 'vampire'
        ax.add_collection(LineCollection(sample_segments, colors=[colors[p[key]] for p in points], linewidths=3, capstyle='butt', zorder=5))
    for label, point in [('A', report['case']['a']), ('B', report['case']['b'])]:
        ax.annotate(label, projector(*point), xytext=(-16, 0), textcoords='offset points',
                    va='center', weight='bold', bbox={'boxstyle':'circle,pad=.2','fc':'#fffdf6','ec':'#173f35'}, zorder=6)
    x, y = lo + (hi - lo) * [.07, .045]
    ax.plot([x, x + 100], [y, y], color='#173f35', lw=2)
    ax.text(x, y + 27, '100 m', fontsize=8)
    ax.text(.93, .96, 'N ↑', ha='right', transform=ax.transAxes, fontsize=10)

axes[0].legend(handles=[Line2D([],[],color='#176247',lw=3,label='Tree mode: fastest, 1,594 m'),
                        Line2D([],[],color='#a05288',lw=2,ls='--',label='Live Vampire result, 1,573 m'),
                        Line2D([],[],color='#777d79',lw=2,ls=':',label='Buildings-only detour, 1,964 m')],
               loc='upper left', bbox_to_anchor=(-.01,-.025), frameon=False, fontsize=9)
for ax in axes[1:]:
    ax.legend(handles=[Line2D([],[],color=colors[k],marker='o',ls='',label=k.title()) for k in ['shade','sun','unknown']],
              loc='upper left', bbox_to_anchor=(-.015,-.025), frameon=False, fontsize=9, ncol=3, columnspacing=.8, handletextpad=.2)
fig.text(.055,.14,'On the same 87% of the path: 59% potential shade in our tree scenario; 45% in the published raster.',fontsize=12,weight='bold')
fig.text(.055,.108,'Sun/shade agreement: 59% (buildings alone: 56% on that same portion). The remaining 13% is unknown in our tree model.',fontsize=11)
fig.text(.055,.065,'Model comparison, not field accuracy. Vampire’s deployed raster and time convention are unresolved.\nOur tree mode shows the fastest route because coverage is insufficient for a shade recommendation.',fontsize=10,linespacing=1.5)
fig.text(.055,.02,'Geometry © OpenStreetMap contributors (ODbL), City of Zurich / swisstopo. Tree data: Kanton Zürich. External route: SOSM, fetched 8 October 2026.',fontsize=8)
fig.subplots_adjust(left=.055,right=.97,top=.86,bottom=.26,wspace=.18)
fig.savefig(OUT / 'lakeshore-comparison.png',dpi=150,facecolor=fig.get_facecolor())
fig.savefig(OUT / 'lakeshore-comparison.pdf',facecolor=fig.get_facecolor())
print(OUT / 'lakeshore-comparison.png')
