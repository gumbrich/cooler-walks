# Historical Zurich pavement pilot · 0.14.0

Superseded by the [expanded network](pavement-pilot.md). Counts and example results below describe the original 115-feature release.

The planner can now compare mapped pavements around **Talacker–Bahnhofstrasse**. Open `/?view=planner&network=pavements` (German: `/de/?view=planner&network=pavements`) or select **Try pavement pilot / Trottoir-Pilot testen** in Zurich. Return with **Zurich map / Zürich-Karte**. This is an experimental, selected-street network, not pavement-level coverage of Zurich.

## Source and topology

The [City of Zurich Fuss- und Velowegnetz](https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz) provides pavement lines and crossing connections under CC0. Its WFS `tbl_routennetz` supplies LV95 coordinates (EPSG:2056), `objectid`, `fuss`, street names and bicycle attributes. We retain only `fuss=1`; bicycle direction restrictions are not interpreted as pedestrian restrictions. Catalogue date: **19 October 2022**; extract fetched: **6 October 2026**. Neither establishes a recent survey date for each line.

The bounded WFS request returned 2,053 features. A pinned whitelist selects **115 features**, including **36 named crossing sections**, with 4.009 km of source linework. There are **733 nodes and 753 edges**, in one connected component. The [source audit](pavement-source-audit.json) retains feature IDs, bounds, source hash and four reference junctions. Selected streets and the pilot envelope are drawn on the map; a point inside the envelope can still be off the supported network.

We join only identical **original LV95 endpoints**. Interior shape vertices, lines crossing in plan view and even very small gaps are not joined. Each source line is subdivided into at most 6 m pieces while retaining its shape. The first broader extract had disconnected pieces; these have not been bridged with guessed connectors. The schema lacks explicit elevation/level and step attributes. The pilot avoids introducing grade-separated connections, but its source topology, public access, steps, construction and crossings still need field inspection. It is not an accessibility or safety assessment.

Start, destination and stop selection use the four source junctions or map points within 6 m of a graph node. This stricter limit reduces wrong-pavement snapping; it cannot establish a safe entrance connection or determine a phone user's pavement. General address search remains available on the regular Zurich network. No turn-by-turn left/right guidance is claimed.

## Routing and shade

The fastest route uses the source path lengths at the existing 80 m/min walking speed. Shade/sun alternatives remain within the chosen 0/5/10-minute extra-walking budget. Crossing distances count normally; signal waits are unknown and excluded. The displayed crossing count is the number of traversed **source crossing sections**, not the number of traffic lights or necessarily complete crossings.

Alternative search adds a 24 m-equivalent crossing preference cost, split across each source crossing section. This affects candidate choice only; it does not inflate reported distance or duration. A shade alternative must save at least 40 m of estimated direct-sun exposure per extra crossing section (minimum 40 m), alongside the existing coverage and detour rules. This discourages frequent switching for small model differences. These are explicit routing-policy choices, not measured crossing delays.

The existing roof/facade ray intersections, LiDAR-derived ground elevations, arrival-time sampling and uncertainty checks now operate on the pavement geometry. Ground correction is not terrain-horizon shadowing. Building shade is included; tree shade, clouds and thermal comfort are not. Greenery stays separate. Calmer-street and waterside preference controls are omitted in this bounded pilot; their normal Zurich implementation is unchanged.

Computed example, **Talacker / Pelikanstrasse → Bahnhofstrasse / Sihlstrasse, 21 June 2026, 14:00 Europe/Zurich**, +5-minute limit:

| Route                | Distance | Walking time | Estimated direct sun | Unknown | Crossing sections |
| -------------------- | -------: | -----------: | -------------------: | ------: | ----------------: |
| Fastest              |    399 m |     4.99 min |                399 m |     0 m |                 4 |
| More estimated shade |    490 m |     6.13 min |                186 m |     0 m |                 4 |

That is **1.14 additional minutes** and about **214 m less modelled direct sun** among the candidates evaluated. It is not a field measurement. At 18:00 the same trip has no qualifying better alternative. Zero extra minutes retains only the fastest route. Full results, winter/night cases, stops and normal-network recovery are in the [routing report](pavement-route-validation.json).

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

The small derived graph and independent regression fixtures are committed. A fresh checkout can run the pilot without raw downloads:

```sh
npm ci
npm run dev
npm run check
npm run data:verify:pavements
```

For source reproduction:

```sh
npm run data:fetch:pavements
npm run data:prepare:pavements
npm run data:packs
```

The preparer requires the pinned raw SHA-256 in `scripts/pavement-pilot.json`. If the source changes, review the geometry, topology and whitelist before updating the hash/version. Raw extracts stay in ignored `data/raw/`; the WFS query and limits are in `scripts/fetch-pavements.ts`. Re-preparation also writes the **blank** field template, so save completed observations separately.

The full independent audit needs the original roof/terrain archives from [shade-library preparation](shade-library.md) and the validation Python environment:

```sh
.venv-geo/bin/pip install -r scripts/requirements-validation.txt
npm run data:verify:pavements
npm run data:audit:pavements
curl --fail --location 'https://raw.githubusercontent.com/sosm/cbf-routing-profiles/6b45390967718a4b785af11222fd0dc2688eeeac/vampire/shadows_zurich_city.asc' --output data/raw/zurich-pavements/vampire-shadows.asc
npm run data:compare:pavements
```

The 88 MB comparison raster stays ignored; its pinned hash is checked before comparison. The live application has no competitor-service dependency. The pavement asset is also included in Zurich downloads and shared native assets.

## Next acceptance step

Use the [paired field locations and protocol](pavement-field-validation.md) to check both sides of Bahnhofstrasse and each reference route's crossings. The computational implementation and browser pilot are delivered; field accuracy and the Shadowmap comparison remain unresolved. Extend the pavement network only after reviewing additional source connections and field evidence.
