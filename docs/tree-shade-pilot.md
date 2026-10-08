# Tree shade pilot · 0.16.0

An optional **Tree shade pilot / Baumschatten-Pilot** adds a potential canopy-shadow scenario around Bellevue–Zürichhorn. It is off by default. The website, PWA and native app use the same implementation. Ordinary tree markers and the greenery indicator are unchanged.

## Data and coverage

The input is the canton’s [classified 2021–2022 LiDAR point cloud, product 557](https://geolion.zh.ch/geodatensatz/4289), downloaded from the [official tile directory](https://maps.zh.ch/download/hoehen/2022/lidar/). The source permits free reuse and redistribution; retain Kanton Zürich attribution. The [technical report](https://geolion.zh.ch/geodatensatz/4291/pdf) describes the predominantly leaf-off acquisition. File creation and download dates are not flight dates.

Fifteen 500 m tiles cover LV95 `[2683000,1245000,2684500,1247500]`: a **3.75 km² source rectangle**, including water and surrounding vegetation. This is not 3.75 km² of guaranteed walking or shade coverage. The planner draws its dotted boundary. Casting rays can run out of coverage near its edge, and unobserved cells remain unknown. Coordinates use EPSG:2056; absolute heights use LN02, EPSG:5728, matching the building model’s receiver elevations.

The derived asset contains 449,289 vegetation columns from 10,290,732 non-withheld class-5 (high vegetation) returns. Of 3,750,000 cells, 495,167 have no non-withheld return of any class; these are scan gaps, not proven open sky. The compact asset is 5,417,821 bytes. [Source URLs, individual hashes and preparation totals](canopy-source-audit.json).

We also investigated the [city’s 0.5 m canopy-height model](https://data.stadt-zuerich.ch/dataset/geo_baumhoehen_2022__chm_aus_lidar_) and the [canton’s vegetation height model](https://geolion.zh.ch/geodatensatz/4291). A top-height surface alone cannot describe space below a crown. The classified returns allow an observed lower as well as upper envelope, so they are used directly here. Neither dataset establishes current summer foliage or transmission.

## What the scenario calculates

1. Group observed high-vegetation returns into 1 m horizontal columns. Keep their minimum and maximum absolute elevations, add 0.5 m vertical padding, and round outwards to decimetres. The padding is a modelling assumption, not a survey accuracy claim.
2. Assume each recorded interval is opaque. Do not extend it to ground, interpolate across empty columns, invent crowns around inventory points, or fit unverified tree radii. This is a **full-foliage, opaque-envelope scenario**, not a reconstructed summer crown. Low/medium vegetation classes are excluded.
3. Trace a ray from the same LiDAR ground receiver used for building shade towards the arrival-time sun. Use exact grid traversal and ray/vertical-interval intersections in LV95. The existing true-north/grid conversion, solar method, maximum 8 m route sampling and 4.8 km/h arrival-time calculation are retained.
4. Known building shade stays building shade. Only known building-sun samples can gain a canopy contribution. Known vegetation interception gives potential shade; an unresolved ray gives unknown. Buildings and trees are never double-counted. Missing ground, uncertain building evidence and non-ground paths remain unknown.
5. Preserve shade, sun, unknown and night lengths separately. Displayed percentages divide by **known modelled daylight distance**, with its route coverage alongside. “About this walk” reports building shade and the additional potential tree contribution in metres.
6. Recommend a shade/sun alternative only when the fastest and candidate routes pass the existing 95% coverage rule. Unknown length never improves ranking. In the tree scenario, insufficient coverage produces the fastest walk and an explanation, rather than a greenery alternative that could be mistaken for a shade recommendation. Explicit water/traffic preferences remain separate.

The toggle does **not** predict leaf state from a calendar, temperature or species. It is off on each new visit and city change. Keeping it on in winter still means the explicitly selected full-foliage scenario; it is not a winter shade forecast. Buildings-only mode remains available by switching it off. There is no invented seasonal transmission percentage.

## Computed examples, not observations

Fixed reference: Bellevue `[8.5443354,47.3668209]` to Zürichhorn `[8.5520945,47.3543016]`, 1 August 2024, Europe/Zurich, fastest walk 1,594 m / about 20 minutes. Exposure advances with the walker.

| Departure  | Building shade | Additional potential tree shade | Unknown | Model coverage | Comparison                                       |
| ---------- | -------------: | ------------------------------: | ------: | -------------: | ------------------------------------------------ |
| 10:00 CEST |          359 m |                           861 m |    71 m |          95.5% | Eligible; no qualifying better alternative found |
| 16:00 CEST |           60 m |                           766 m |   195 m |          87.7% | Shade comparison withheld                        |

At 16:00 the card shows **59% potential shade over the known 88% of the walk**. This is not 59% observed shade, not a transmission measurement, and not a claim of improved field accuracy. The earlier five-service benchmark used a departure snapshot and a different sampling interval; do not subtract these arrival-time figures from its percentages as though protocols matched.

[Seven reproducible route cases](canopy-route-validation.json) include zero detour, a municipal-pavement trip, night, a winter full-foliage scenario and Oerlikon outside coverage. Switching the toggle off restores the exact original building-only result. The partial pavement example has only 70% coverage: no side-of-street tree-shade recommendation is made there.

## Validation and remaining issues

The [8 October lakeshore comparison with Vampire Routing](tree-shade-service-comparison.md) reuses the original 457 path samples. At 16:00 CEST, trees narrow the total-shade gap but improve same-point agreement only from 56.0% to 58.6% on the same 86.7% known portion. This does not establish field accuracy; Vampire's clock and deployed raster identity remain unresolved.

- Synthetic tests compare thousands of sun rays against an independent analytic ray-box intersection, including opposite directions, crown-understorey space, zenith, gaps, boundaries, invalid data and low sun.
- An independent raw-LAS check verifies 69 selected columns across all 15 source tiles, including vegetation envelopes, observed non-vegetation and scan gaps. [Pinned original-return reference](../tests/fixtures/canopy-source-reference.json). This verifies ingestion, not the real crown boundary or tree presence today.
- Seven real-route checks retain duration bounds, arrival-time changes, separate contributions, unknown accounting and unchanged building-only behaviour. Public download integrity uses a size bound and SHA-256. Offline packs carry the same versioned asset.
- Source classification can be wrong. Leaf-off returns may miss summer crown extent; assuming opaque vertical intervals may also overstate interception. These opposing effects mean the scenario is **neither a defensible upper nor lower bound** on actual shade.
- Ground-level receivers, 1 m columns, up-to-8 m sampling, centreline paths outside the pavement mode, historical vegetation and missing bridge heights limit spatial precision. No tree-transmission probabilities or thermal-comfort claims are made.
- **Field-validation HOLD remains.** This does not resolve roof-source discrepancies, timestamped-photo disagreements or the external services’ time/raster ambiguity. See [shadow validation](shadow-validation.md).

Next: field-check paired sunny/tree-covered samples along the lakeshore at two times, record foliage/cloud state and accurately locate the walking side. Then assess a leaf-on source or measured crown/transmission model before broader tree coverage or default-on use.

## Reproduce

The derived asset is checked into Git. Raw LAZ downloads remain ignored.

```sh
python3 -m venv .venv-geo
.venv-geo/bin/pip install -r scripts/requirements-validation.txt
.venv-geo/bin/python scripts/prepare-canopy.py --fetch
npm run data:audit:canopy
npm run data:verify:canopy
npx vitest run tests/canopy.test.ts
npx playwright test tests/browser/canopy.spec.ts
```

The preparation command downloads only the 15 configured public tiles, at most two at once, checks compound CRS, and records hashes. Subsequent preparation without `--fetch` requires the cached matching sources. Re-run audits before deliberately changing a source/model version; do not silently accept changed remote files or replace historical comparison evidence. Node 22 and Node 26 can produce different gzip pack bytes: deploy matching catalogues and packs together.
