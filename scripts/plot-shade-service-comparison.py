"""Draw actual returned routes on the committed Zurich geography (no basemap requests)."""
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/shade-services'
report = json.loads((OUT / 'comparison.json').read_text())
ours = json.loads((OUT / 'cooler-routes.json').read_text())
others = json.loads((OUT / 'external-routes.json').read_text())
city = json.loads((ROOT / 'public/data/zurich.json').read_text())
transform = Transformer.from_crs(4326, 2056, always_xy=True).transform
def project(points):
    return np.array([transform(*p) for p in points])
nodes = project([p['point'] for p in city['nodes']])
roads = nodes[np.array([[e['a'], e['b']] for e in city['edges']])]
buildings = [project(b['ring']) for b in city['buildings']]
waters = [project(w['rings'][0]) for w in city['water']]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'text.color': '#173f35'})
fig, axes = plt.subplots(2, 3, figsize=(15, 11), facecolor='#f7f4eb')
fig.suptitle('Five Zurich walks: Cooler Walks and Vampire Routing', fontsize=23, x=.055, ha='left', y=.98)
fig.text(.055, .935, 'Fixed A/B coordinates · 1 August 2024, 16:00 CEST scenario · experimental estimates', fontsize=12)
colors = {'fast': '#667675', 'ours': '#1a785d', 'vampire': '#986092'}
for index, (r, cw, ext, ax) in enumerate(zip(report['rows'], ours['records'], others['records'], axes.flat)):
    s = cw['scenarios'][0]
    routes = [project(s['fastest']['coordinates']), project(s['selected']['coordinates']),
              project(ext['services']['vampire']['routes'][0]['coordinates'])]
    all_points = np.concatenate(routes)
    center = (all_points.min(axis=0) + all_points.max(axis=0)) / 2
    span = max(np.ptp(all_points, axis=0)) * 1.16
    lo, hi = center - span / 2, center + span / 2
    ax.set_facecolor('#eeeae0')
    def visible(a):
        return np.all(a.max(axis=0) >= lo) and np.all(a.min(axis=0) <= hi)
    ax.add_collection(PolyCollection([w for w in waters if visible(w)], facecolor='#b6d3d8', edgecolor='none'))
    ax.add_collection(PolyCollection([b for b in buildings if visible(b)], facecolor='#d2cec2', edgecolor='none'))
    keep = np.all(roads.max(axis=1) >= lo, axis=1) & np.all(roads.min(axis=1) <= hi, axis=1)
    ax.add_collection(LineCollection(roads[keep], colors='#fffdf6', linewidths=1.4))
    for coords, key, width, style in zip(routes, ['fast', 'ours', 'vampire'], [2, 3.5, 2.4], [':', '-', '--']):
        ax.plot(*coords.T, color=colors[key], lw=width, ls=style, zorder=5)
    for label, point in [('A', r['a']), ('B', r['b'])]:
        p = transform(*point)
        ax.annotate(label, p, xytext=(5, 6), textcoords='offset points', fontsize=11, weight='bold',
                    bbox={'boxstyle': 'circle,pad=.15', 'fc': '#fffdf6', 'ec': '#173f35'}, zorder=7)
        ax.plot(*p, 'o', color='#173f35', ms=4, zorder=6)
    ax.set_xlim(lo[0], hi[0]); ax.set_ylim(lo[1], hi[1]); ax.set_aspect('equal')
    ax.set_xticks([]); ax.set_yticks([])
    for spine in ax.spines.values(): spine.set_visible(False)
    ax.set_title(f"{index + 1}. {r['from']}\n→ {r['to']}", loc='left', fontsize=11, pad=10)
    scale = 100 if span > 650 else 50
    x, y = lo + span * .06
    ax.plot([x, x + scale], [y, y], color='#173f35', lw=2)
    ax.text(x, y + span * .025, f'{scale} m', fontsize=8)
    ax.text(.95, .95, 'N ↑', transform=ax.transAxes, ha='right', va='top', fontsize=9)
    ax.text(0, -.07, f"Cooler Walks {r['coolerSelectedMeters']:.0f} m  ·  Vampire {r['vampireMeters']:.0f} m", transform=ax.transAxes, fontsize=10)
    if r['coolerMode'] != 'shade':
        ax.text(0, -.12, 'Cooler: fastest shown; shade coverage insufficient', transform=ax.transAxes, fontsize=8)
    else:
        ax.text(0, -.12, f"Cooler: {r['coolerExtraMinutes']:.1f} extra min; {r['coolerNativeCoveragePercent']:.0f}% modelled", transform=ax.transAxes, fontsize=8)
legend = axes[1, 2]
legend.set_axis_off()
legend.legend(handles=[Line2D([], [], color=colors['ours'], lw=3, label='Cooler Walks selected'),
                       Line2D([], [], color=colors['vampire'], lw=3, ls='--', label='Vampire first result'),
                       Line2D([], [], color=colors['fast'], lw=2, ls=':', label='Cooler Walks fastest')],
              loc='upper left', frameon=False, fontsize=12)
legend.text(.04, .66, 'These maps compare route choice.\nThey do not validate shadow accuracy.\n\nShade agreement is measured separately\nalong the same fastest path, with unknown\ncoverage excluded and reported.\n\nVampire’s time convention and deployed\nraster version remain unresolved.\n\nShadowmap: matching date/API access\nblocked; no numerical result obtained.', va='top', linespacing=1.7, fontsize=11)
fig.text(.055, .025, 'Geometry © OpenStreetMap contributors (ODbL), City of Zurich / swisstopo. Routes: Cooler Walks 0.15.0 and SOSM routing.osm.ch.', fontsize=8)
fig.subplots_adjust(left=.055, right=.96, top=.86, bottom=.10, hspace=.43, wspace=.2)
fig.savefig(OUT / 'five-route-maps.png', dpi=150, facecolor=fig.get_facecolor())
print(OUT / 'five-route-maps.png')
