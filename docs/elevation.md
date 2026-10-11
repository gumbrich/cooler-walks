# Zurich elevation preference

**Munich update · 0.23.0:** Munich now also supports this preference using official Bavarian DGM1, averaged to 2 m in EPSG:25832 / DHHN2016. It uses the same coverage and comparison rules below. Ground is not a bridge deck: unsupported walking heights remain unknown. [Munich sources, tests and limitations](munich.md).

Choose **Flatter routes** / **Flachere Wege** as the main priority or an optional wish. Elevation is off by default. Since 0.20.0 it can be combined with shade or sun, water and supported traffic preferences; the visible order determines priority. See [combined preferences](preferences.md) for the ranking and trade-offs. The 0/5/10-minute detour limit still applies to the same fastest mapped walk. Available on the standard and municipal pavement networks across the supported 57.77 km² Zurich map, subject to walking-height coverage. Other cities do not advertise elevation yet.

The result cards show estimated ascent/descent rounded to 5 m (10 ft). Open **Elevation profile / Höhenprofil** below the cards for the selected route's ground-height profile, model coverage and gaps. A flatter route can still include steps; this is neither step-free routing nor a guarantee of level ground. Walking duration and arrival-time shade sampling still use 4.8 km/h without a slope-speed adjustment.

## Source and preparation

Reuse the existing checksum-verified [Zurich ground/roof tiles](shade-library.md). No new data download, credential or remote elevation API is needed. The [cantonal DTM 2021–2022 metadata](https://geolion.zh.ch/geodatensatz/4269.html), checked 8 October 2026, describes LiDAR ground returns, a 0.25 m source raster, LV95 coordinates and a 30 April 2022 data state. This is bare-earth terrain, not bridge decks. The app's existing preparation averages the source into **2 m cells**, stores **0.1 m increments** in LN02 heights, and retains missing cells. Source resolution/accuracy does not establish walking-profile accuracy. [Preparation and attribution](data-sources.md); `npm run data:prepare:shade` reproduces these already-included tiles.

`City.elevation.resolution` enables the capability independently of terrain-cast shadows, which remain disabled. Both route networks use the same metric grid. Other cities need a licensed ground model, coordinate/vertical references, missing-data masks and route verification before enabling it. The current adapter obtains ground cells from the detailed-shade library; another provider should implement the same height lookup before setting the capability.

## Model and comparison

Model identifier: `ground-profile-10m-1m-v1` in `src/lib/elevation.ts`.

- Bilinear interpolation uses the four surrounding 2 m cell centres. Neighbouring tiles are loaded when needed; a missing contributing cell remains unknown. Provisional passes are discarded before showing results.
- Profile samples follow each continuous ground-level run every 10 m, including its endpoints. This spacing is independent of graph subdivision, important for short municipal path edges. Known bridges, tunnels and other non-ground edges break the profile; heights are never connected across those gaps.
- Ascent/descent suppress vertical reversals below 1 m while retaining net endpoint change. This reduces accumulated grid noise, but does not remove all retaining-wall, alignment or survey errors. Missing sample heights break accumulated climbing as well as the chart. The reported known distance is the sum of intervals with both endpoint heights available.
- Additional candidate searches use `length + strength × (vertical change + 10 × grade burden)`, with strengths 5, 15 and 40. Grade burden is the sum of `rise² / horizontal distance` over profile intervals, including descent. This is a search heuristic, not walking time or a displayed effort score. Unknown edges receive a conservative search penalty.
- Final comparison requires **complete sampled walking-height coverage on both routes** (0.01 m numerical tolerance), the existing time budget, and at least 10% new path length. Partial coverage cannot produce a flatter recommendation, even if missing sections happen to look flat on a basemap.
- An improvement means at least 5 m and 10% less total ascent plus descent; alternatively, a gentler slope distribution means at least 25% and 1 m less grade burden with no more than 2 m additional total vertical change. Eligible improvements rank by total vertical change in 5 m bands, then grade burden, then duration. These thresholds are engineering choices awaiting field evaluation, not confidence probabilities.
- The result is the best of the candidates evaluated, not a globally optimal or necessarily stair-free path. A hill between endpoints may have no useful flatter option. Fixed ground data does not change with departure time; shade displayed alongside it does.

Unknown height can prevent comparison on an otherwise ordinary city trip. In particular, the default Bahnhofquai–Bürkliplatz walk contains non-ground geometry. Keeping the fastest route and explaining the missing heights is deliberate. Future bridge-deck data should improve this instead of filling heights from riverbeds.

## Verification and reproduction

```sh
npm run check
npm run data:verify:elevation
PLAYWRIGHT_BROWSERS_PATH=/tmp/cooler-playwright npx playwright test tests/browser/elevation.spec.ts
```

The unit suite checks independent analytic planes, tile-seam interpolation, uphill/downhill symmetry, graph-subdivision invariance, small-noise suppression, sustained gentle climbs, real hill reversals, missing ground, bridges, display units, detour budgets, waypoints and unsupported cities. Synthetic geometry is confined to tests.

[Computed real-route evidence](elevation-validation.json) includes 33 standard-network cases (11 pairs × 0/5/10 minutes) and 9 municipal-pavement cases. These cover uphill, nearly level, no-improvement and unknown-height journeys. Bucheggplatz–Waidbadstrasse provides a real improvement: roughly 95 m up / 6 m down becomes 89 m up / 0 m down for about 2.3 extra minutes on the standard graph at the +5-minute setting. Meierhofplatz 2–Am Hönggerberg demonstrates a gentler alternative with a similar net climb. These are model outputs, not field observations.

Next: walk the paired hilly routes and check path alignment, steps, gradients and actual travel times. Add authoritative bridge/underpass walking heights before widening comparison eligibility. Then evaluate a separate, documented gradient-aware duration model.
