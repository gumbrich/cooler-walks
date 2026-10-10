# Zurich pavements and crossings · 0.18.0

**0.21.0 update (10 October 2026):** Zurich now uses municipal pavements and tree shade by default, as requested by the user. The interface no longer calls these optional pilots. This is an integration/default change, not new evidence of field accuracy or seasonal foliage calibration. Traffic context and barrier avoidance are documented in [preferences](preferences.md) and [accessibility routing](accessibility-routing.md). Historical results below retain their original versions and settings.

The optional pavement mode now covers **all complete municipal walking lines inside the current Zurich map**, not just Talacker–Bahnhofstrasse. Open [the planner](https://coolerwalks.ch/de/?view=planner&network=pavements) or choose **Use pavements & crossings / Trottoirs und Querungen nutzen**. The supported area remains **57.77 km²**, bounded by the city polygon and `[8.472, 47.353, 8.570, 47.427]`: centre, north and west, including Oerlikon and Altstetten. This is experimental coverage of that area, not every street in the municipality or field-validated access.

## Source and topology

The [City of Zurich Fuss- und Velowegnetz](https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz) is CC0. The documented WFS `tbl_routennetz` supplies LV95 (EPSG:2056) lines, `objectid`, `fuss`, street names and bicycle attributes. Source/catalogue date: **19 October 2022**; metadata revision: **12 January 2026**; fetched **6 October 2026**. The latter dates do not establish a new street survey. No per-feature observation date, walking height or complete steps inventory exists.

The full WFS request and independent `resultType=hits` both return **40,467 unique features**. Of these, 31,263 have `FUSS=1`; **25,740** lie completely inside the existing walking area. All vertices and segments are checked. Boundary-crossing features are omitted whole, without clipping and inventing new connections. `MAP_FUSS=0` is retained: that field describes printed-route categories, not pedestrian access. Bicycle one-way attributes are not pedestrian restrictions.

The result contains **1,360.33 km of combined path linework**, **5,118 named crossing sections**, **268,742 derived edges** and **5,844 searchable junctions**. Linework counts both pavements where present; it is not unique street length. There are **40 connected components**. The largest has 25,662 features and 1,356.09 km; smaller pieces remain disconnected. Only identical original endpoints connect. Interior vertices, apparent 2D intersections and even small coordinate gaps do not create connections. Curved source lines are subdivided into at most 6 m pieces without straightening their shape.

Four unnamed lines retain an empty name. Source names are not corrected by guesswork; occasional inconsistent names (including a “Gessnerbrücke” label far from the central bridge) need municipal/field review. The original 115 features and their independent validation points are preserved unchanged. [Full source audit](pavement-source-audit.json) · [original audit](pavement-source-audit-v1.json) · [historical release](pavement-pilot-v1.md).

## Choosing a route

Enter an official address, a junction such as **Franklinstrasse / Hofwiesenstrasse**, or choose a map point. Addresses and map points show up to four numbered walking-point choices within 80 m. Select the side you can actually reach. The address remains the trip label; the route begins or ends at the selected municipal path. **No unverified entrance connector or road crossing is drawn or counted.** The access distance shown beside a choice is straight-line proximity, not walking distance.

Choices are sampled from the same ≤6 m source pieces as routing. The chosen source ID restricts the final ≤6 m graph-node snap, so a coincident but unconnected bridge, underpass or opposite pavement cannot steal the endpoint. Only identical original source endpoints are consolidated in the choice list. Junction search already chooses a mapped source endpoint. Changing either network preserves the trip, ordered stops, time and budget; returning to standard routing uses the original address/map anchor. Existing pavement choices stay available when returning to pavement routing. Nothing is written to journey history.

These controls finish the address-to-pavement workflow that previously required a separate demonstration trip and junction-only search. The old **pavement pilot** wording has been replaced by the actual network name. This is a usability milestone, not graduation to field-validated shade or access. The feature remains optional. The broader Zurich shade estimate remains explicitly experimental.

The fastest route uses actual source lengths and the existing 80 m/min assumption. Alternatives obey the 0/5/10-minute extra-walking limit. Crossing distance counts; signal waits are unknown. The crossing count refers to traversed named source sections, not necessarily complete road crossings or traffic lights. A 24 m-equivalent crossing preference affects candidate choice only. A shade alternative must save at least 40 m of estimated direct sun per additional crossing section (minimum 40 m), alongside the existing coverage rules. These are routing policies, not measured delays.

The full network is compactly encoded as original LV95 integer coordinate deltas. All original coordinates, including six-decimal coordinates and endpoint identities, are verified through a lossless round trip. Encoded precision is not survey accuracy. The 3.24 MB asset expands to the detailed routing graph only when pavement mode is selected, inside the worker. The main map draws original source lines with zoom-dependent styling. The base Zurich offline pack is approximately **81.5 MB compressed / 188.8 MB expanded**, within the unchanged base-pack limits. The complete download also includes the separate **123.4 MB tree library** (about 205 MB total). Checksums detect old packs; this workflow update does not change source assets.

## Shade and uncertain walking heights

Existing roof/facade ray intersections and LiDAR-derived ground heights operate at arrival time along each path. Buildings are modelled; tree proximity remains greenery. The optional [full-foliage tree scenario](tree-shade-expansion.md) is available across the supported map on both networks. Distant terrain-horizon shadows, clouds and thermal comfort are not included. Waterside preference now uses the existing surface-water geometry on municipal paths too, within the same detour budget. Traffic observations and street classifications have not been matched to these paths; the interface directs calmer-street comparisons to the standard network.

Municipal lines contain no height/level information. **1,128 features** are therefore explicitly marked unknown for geometric shade: named bridges, underpasses, passages, platforms and stairs; lines crossing mapped surface water; and lines substantially overlapping an OSM walking feature already tagged as non-ground/covered. The latter requires at least **80% of the line length within 4 m**, sampled at at most 3 m intervals. This is a conservative association rule, not a measured confidence. Simply passing near or across an underground line is insufficient. An initial 12 m proximity rule incorrectly withheld ordinary surface streets and was rejected before release.

These masks do not guarantee that every bridge, underpass or elevated pavement is identified. Some neighbouring or covered paths may still be withheld unnecessarily. **121 named stair features** are marked as known steps; absence of that flag is not evidence of a step-free route. No turn-by-turn pavement guidance, current closure, crossing-safety or accessibility claim is made.

At least 95% known model coverage is required for shade/sun comparison. Otherwise the app shows the available greenery comparison and retains shade as unknown. For example, the checked Bahnhofbrücke trip has unknown shade throughout because river-bed elevation would be an invalid receiver. No shade benefit is claimed there.

## Workflow checks

[Address-selection checks](pavement-address-validation.json) exercise real official addresses in Oerlikon and Altstetten plus the Bahnhofquai–Bürkliplatz trip, 0/5/10-minute limits, explicit source-constrained endpoints, exposure accounting and waterside ranking. Synthetic checks retain separate coincident interiors, small gaps and opposite pavements, while merging true shared endpoints. A distant line with nearby interior geometry is not lost by endpoint-only filtering. These are implementation checks; none establishes a safe entrance connection.

Browser scenarios cover retained addresses, explicit map/list selection, network switching, keyboard-accessible controls, German phone/desktop layouts and recovery outside coverage. See [platform evidence](platform.md) for the release's actual runs. [Desktop selection](screenshots/desktop-pavement-address-choice-de.png) · [phone selection](screenshots/phone-pavement-address-choice-de.png).

## Expansion checks

[Eight real journeys](pavement-expansion-validation.json) cover Altstetten, Oerlikon, Höngg, Wiedikon, Seefeld, Wipkingen and Bahnhofbrücke, including a 5.77 km Altstetten–Oerlikon walk. Oerlikon, Wiedikon and Seefeld have qualifying shade alternatives in the checked summer scenario; other cases either have no better evaluated route or insufficient shade coverage. Checks cover full-edge coverage, exposure/distance accounting, the detour limit, unknown bridge height and genuinely disconnected paths. The [central regression](pavement-route-validation.json) retains summer/winter/night, zero detour, sun preference, ordered stops and return to the regular network.

The original Talacker → Bahnhofstrasse summer-noon comparison remains 399 m fastest versus 490 m with more estimated shade, +1.14 min and about 214 m less modelled direct sun. These are computations, not field observations.

## Independent checks and other tools

Direct plane/polygon intersections against the original CityGML faces agree with **all 267 stable pavement samples** from the runtime mesh. This comparator does not use the production triangulator. The independent NREL SPA solar direction differs by at most **0.042°**; one classification becomes boundary-uncertain within the 2 cm edge tolerance rather than changing to the opposite sun/shade class. See the [audit](pavement-shadow-audit.json). These tests establish implementation agreement on the same historical buildings and ground, not current street accuracy. Earlier roof discrepancies and the photo disagreement remain in [shadow validation](shadow-validation.md).

The [Vampire Routing author's GeoBeer slides](https://geobeer.ch/slides/46/lightning-talks.pdf) describe a GRASS `r.sun` workflow using swissSURFACE3D and a swissALTI3D horizon, resampled for routing. They use values below 100 as a shade proxy and give 1 August 2024 at 16:00. The public raster does not record the radiation channel or clock convention. [GRASS documentation](https://grass.osgeo.org/grass-stable/manuals/r.sun.html) distinguishes default local solar time from explicit civil time.

We froze **251 pavement midpoints** and compared the pinned [public raster](https://github.com/sosm/cbf-routing-profiles/tree/6b45390967718a4b785af11222fd0dc2688eeeac/vampire) under both interpretations, using a departure-time snapshot to match the static raster:

| Interpretation         | UTC instant   | Agreement | Disagreement |
| ---------------------- | ------------- | --------: | -----------: |
| 16:00 CEST             | 14:00:00Z     | 168 / 251 |           83 |
| 16:00 local solar time | 15:32:09.700Z | 206 / 251 |           45 |

**These are model agreements, not accuracy scores.** Radiation thresholding differs from direct geometric visibility; vegetation, distant terrain, source dates and raster resampling also differ. The public routing profile's hardcoded extent differs from the ASC header, so this audit uses the header. Neither time interpretation is selected as correct. All point results and uncertainties are retained in the [comparison report](pavement-tool-comparison.json); no external raster is shipped in the app.

Reusable work: evaluate GRASS/GDAL surface-and-horizon preprocessing in a separate offline experiment. The public routing-profile code has a permissive notice, but its old OSRM setup is not a drop-in replacement for the current router. This milestone reuses the public comparison evidence, not its runtime.

[Shadowmap's point/time sunlight API](https://shadowmap.org/api) would support the same point set, but access is currently offered to selected partners. No credentials, API results, signup or contact submission exist. Before integration, obtain endpoint-specific Zurich data/version, receiver-height semantics, query limits and caching/offline rights. Shadowmap's 3D raycasting principle is comparable to ours; broader rendering or terrain/vegetation support does not establish superior accuracy at our Zurich points. A numerical Shadowmap comparison remains blocked on that access.

## Reproduce

A fresh checkout includes the compact source lines and independent regression fixtures; raw downloads are not needed to run the app:

```sh
npm ci
npm run dev
npm run check
npm run data:verify:pavements
```

To reproduce the municipal extract:

```sh
npm run data:fetch:pavements
npm run data:prepare:pavements
npm run data:packs
```

The fetcher verifies the source count before accepting a full response. Preparation requires the pinned source SHA-256 in `scripts/pavement-pilot.json`, then checks geographic coverage and the preserved original geometry. If the source changes, review it and version the data deliberately. Raw data stays in ignored `data/raw/zurich-pavements-expansion/`. The original field template is preserved and never overwritten by expansion preparation.

For independent source-shape/solar checks, use the original roof/terrain archives from [shade-library preparation](shade-library.md) and the validation environment. `npm run data:audit:pavements` reads the current central predictions and writes separate `*-expansion` outputs for v2, preserving the original 267-point fixture. The optional Vampire comparison deliberately keeps the original 251 points in `tests/fixtures/pavement-network-v1.json`; it does not silently change its sample population to the expanded city network. Its 88 MB raster stays ignored and is not a runtime dependency.

## Next acceptance step

Use the [paired field protocol](pavement-field-validation.md), adding district walks from the expansion report. Check which pavements are open, source junctions and crossings, named/unnamed steps, bridge/underpass receivers and dated shadows. Wider source availability is authorized; model accuracy remains on hold pending field evidence. Extend traffic matching to municipal paths only after checking side-of-street alignment. Shadowmap access and the external-raster timestamp ambiguity remain unresolved.
