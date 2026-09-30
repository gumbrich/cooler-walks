# Oerlikon and Altstetten · 0.8.0

The Zurich walking area expands from **21.81 to 57.77 km² (2.65×)**. The walking boundary is the intersection of the official Zurich municipal polygon with WGS84 bounds `[8.472,47.353,8.570,47.427]`; it includes Altstetten, Oerlikon, Höngg and more of Affoltern, while retaining the centre, Wiedikon and Seefeld. This remains a bounded, experimental pilot, not complete municipal coverage. Other integrated cities remain beta.

## Verified sources

The shared configuration in `src/lib/coverage/zurich-extract.json` defines routing/model bounds, raw source directories, source year and the explicit tile list. It prevents stale smaller extracts or unrelated cached archives from silently being reused.

Six **2019** swissBUILDINGS3D 3.0 Beta CityGML 2.0 tiles support the larger model: `1091-12`, `1091-14`, `1091-21`, `1091-23`, `1091-32`, `1091-41`. Four are new downloads; two reuse verified archives. Each file must match the official STAC SHA-256 multihash. Shapely verifies the **union of actual rotated source polygons**, rather than their bounding boxes, covers the entire model rectangle `[8.468,47.3514,8.5717,47.431]`. The LV95 extraction envelope is derived using PROJ, with an additional 50 m margin. Ground triangles intersecting this envelope are retained, including crossing triangles whose vertices are outside it. Courtyards survive consolidation.

Sources: [swisstopo product and terms](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta), [CityGML format](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-citygml-20240814), [official STAC documentation](https://docs.geo.admin.ch/download-data/stac-api/overview.html). Attribution remains **© swisstopo**. Source coordinates are **EPSG:2056 / LN02**, with relative heights calculated from actual maximum XYZ elevation minus minimum GroundSurface elevation. No absolute elevation is used as building height.

The catalogue also exposes a **2026 nationwide FileGDB archive (14.14 GB)**. It has not been downloaded or validated here. Its publication date does not establish a new survey for Zurich. This release deliberately keeps the inspected regional CityGML geometry and advertises its 2019 source date; newer geometry needs a separate adapter and comparison before replacement.

Source `OBJEKTART` values distinguish solid buildings from open structures. Open buildings, canopies, construction sites, greenhouses, missing and unrecognized categories remain **uncertain obstructions**, using a conservative model mask. Where actual GroundSurface geometry exists, maximum source Z minus minimum ground Z bounds its possible shadow reach; uncertain geometry still cannot establish shade. They are not treated as solid barriers when snapping. Validated building types are ordinary buildings, high-rises, religious buildings/towers and storage tanks. The model remains a flat-ground extrusion, without tree shade or terrain effects. Objects with no GroundSurface are audited separately. Their actual source XY convex hulls become conservative unknown masks, with no invented ground elevation. The 150 m supported model ceiling is an uncertainty bound, not a measured height. Source coverage and checksum checks establish extraction integrity, not present-day field accuracy.

Walking/map/water data comes from new bounded Swiss Overpass extracts, processed locally with original node identities and legal pedestrian restrictions. Every graph segment must stay inside advertised coverage. Trees use a new bounded municipal Bauminventar response: unchanged source coordinates, inferred woodland points excluded, no invented crowns. WGS84 output is independently compared with the provider's LV95 fields. Agreement checks transformation fidelity, not whether a tree still exists. Municipal traffic zones, 2025 measured count profiles and the same-day full-city official address export are reused and re-clipped where appropriate.

## Municipal edge gaps

The tile audit found that the rectangular extent includes **3.11 km² outside Zurich**, where municipal trees and this CityGML release cannot be assumed complete. The final advertised area is therefore **57.77 km²**, not the 60.88 km² bounding rectangle. The official cantonal `gem_grenzen` WFS polygon is filtered by **BFS 261**, checked in its declared EPSG:2056 coordinates and transformed with PROJ. Licence: **CC0**, [Gemeindegrenzen](https://data.stadt-zuerich.ch/dataset/ktzh_gemeindegrenzen__ogd_). The actual polygon is retained, without an outward simplification; every routing edge must stay inside it.

For shade near the irregular municipal edge, an offline spatial index computes each graph endpoint’s distance to the nearest source boundary segment. Each edge receives a conservative lower bound valid along its entire length: minimum endpoint clearance minus half its length, rounded down with a one-metre transformation guard. A sample cannot be classified as sunny or shaded if this clearance is below the maximum possible model shadow reach for that departure. Thus a building missing just across the municipal boundary cannot make a walk appear sunnier. This supplements the existing model-rectangle checks. The algorithm is `flat-buildings-snapshot-v5`; absent clearance in other cities preserves their existing declared coverage rules.

See [municipal source and clearance audit](zurich-municipal-coverage.json). The boundary was fetched 30 September 2026; that is not a survey date. The municipality’s outline is used as a conservative source-data limit, not a claim that every current building or tree is present.

## Reproduce

Ordinary development uses checked-in derived data and needs only `npm ci`. For source preparation, use the pinned environment in `scripts/requirements-geo.txt`, plus the existing traffic/count preparation described in [traffic.md](traffic.md) and [vehicle-counts.md](vehicle-counts.md):

```sh
npm run data:fetch:zurich
.venv-geo/bin/python scripts/prepare-zurich-boundary.py
.venv-geo/bin/python scripts/extract-buildings.py
.venv-geo/bin/python scripts/compact-buildings.py
npm run data:prepare
npm run data:verify
npm run data:packs
```

The fetch script records live-source URLs and timestamps, validates immutable building checksums and reuses cached files. Per-tile extraction caches are keyed by source hash, bounds and extractor version. Raw sources remain ignored. A deliberate live-source refresh needs cache replacement, a new data version and validation; later downloads are not promised to reproduce historical snapshots.

## Route validation

Reference addresses come from the actual official source: **Hofwiesenstrasse 350 → Wallisellenstrasse 45** in Oerlikon, **Altstetterstrasse 145 → Hohlstrasse 554** in Altstetten, and **Wehntalerstrasse 490 → Hofwiesenstrasse 350** across the north. `scripts/verify-coverage.ts` checks complete-route coverage and the extra-time limit, including zero extra time. It records actual distances, durations and coverage in [coverage-validation.json](coverage-validation.json).

The official address coordinates are map-label positions, not verified entrances. Existing 45 m graph snapping and building/coverage guards still apply. **Wehntalerstrasse 790** remains outside the new boundary and exercises the honest unsupported-area state. Search and routing stay on the device; no external geocoder receives addresses.

Generated provenance and counts are in [data-manifest.json](data-manifest.json), [building coverage](zurich-building-coverage.json), [addresses](zurich-addresses-validation.json) and [vehicle counts](vehicle-counts-validation.json). Validation outcomes and platform limitations are recorded in [platform.md](platform.md).

## Prepared data and checked examples

The final bundle contains **155,277 nodes, 170,105 walking edges, 112,794 unaltered tree positions and 42,719 building/uncertainty polygons**. Of 56,704 searchable existing addresses, **45,795** lie inside the walking area. Historical count coverage is **144 directional points at 80 sites**. A displaced historical counter remains excluded; missing counts never imply quiet streets. The offline bundle is **16.6 MB compressed on the public host / 100.1 MB expanded** (16.8 MB with local Node 26 compression; the payloads are identical). The 2 GB Android emulator passes offline Oerlikon route and map checks; physical-phone memory testing is still needed.

At 14:00 Zurich time on 21 June 2026, the Oerlikon reference is **800 m / 10.0 min**, with a distinct alternative **833 m / 10.4 min**. The Altstetten reference is **498 m / 6.2 min** with no better distinct shade alternative. The northern connection is **2,722 m / 34.0 min**, with an alternative **2,847 m / 35.6 min**. All satisfy the 95% model-coverage rule and five-minute budget; zero-extra-time checks return only the fastest route. These are calculated examples, not field observations.

Source-address checks also exposed real access limitations: Hohlstrasse 560 snaps to a disconnected mapped spur, and the Wehntalerstrasse 500 label is separated from the nearest public path by a building. The app retains the corresponding access errors; it does not draw an invented approach. The working examples use Hohlstrasse 554 and Wehntalerstrasse 490 instead.

The stronger uncertainty handling can withhold a comparison that older releases showed. For example, the central reference at 10:00 and 18:00 now explicitly falls back to greenery when unknown exposure exceeds the comparison limit; the 14:00 shade and sun comparisons still work. No threshold was relaxed to make the expansion pass.

## Memory and map rendering

The larger model exposed Android WebView heap exhaustion during reload. Routing data now loads and parses in its dedicated worker; saved compressed bytes transfer ownership to that worker. Only addresses, tree positions and counter metadata cross to the interface. The worker projects building arrays in place, then drops redundant source geometry; a focused test confirms identical routes, exposure and water results, while ordinary library callers retain their inputs unchanged.

Map sources are not reloaded when unchanged. Individual recorded trees render at street scale (zoom 14+) inside the visible neighbourhood; all source trees remain in routing calculations. A bounded rendered-tile cache and explicit worker/map cleanup on navigation limit repeated-load memory. Neighbourhood labels come from actual OSM suburb/quarter features and make Oerlikon, Altstetten and the larger extent easier to find.

The winter browser check verifies both outcomes: the central reference correctly withholds a sun recommendation where unknown exposure is excessive, and the Oerlikon reference offers a real sun comparison on 21 December at noon. It also checks the zero-extra-time setting and night behaviour.
