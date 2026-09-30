# Zurich focus, addresses and expanded coverage · 0.7.0

Zurich is the primary product focus. Basel, Munich and Cambridge remain usable, clearly labelled **beta** areas; Paris remains unavailable and under review. Swiss cities appear first in the selector, coverage view and downloads. The shared international architecture is preserved.

## Verified geographic extent

Routing expands from **8.06 to 21.81 km² (2.71×)**: `[8.517, 47.353, 8.570, 47.402]` in WGS84. It includes more of Wipkingen, Unterstrass, Wiedikon and Seefeld. This is a rectangular walking area, **not the entire municipality**; Altstetten, Oerlikon and other outer neighbourhoods remain partly or wholly outside it.

The graph contains 66,720 actual OSM nodes and 73,011 pedestrian edges. The expanded environmental extract contains 48,477 retained tree positions and 20,637 simplified building footprints. The unchanged tree-location and building-height limitations apply. Historical traffic evidence expands to 75 directional counters at 42 sites, without changing the street-context ranking into a vehicle-volume score.

Building surroundings use model rectangle `[8.5152,47.351,8.5717,47.4041]`. Shapely checks that the entire rectangle lies inside the **union of the actual STAC polygons**, rather than their axis-aligned envelopes, for cached 2019 tiles 1091-23 and 1091-41. The extraction includes its full LV95 envelope. The runtime still checks maximum shadow reach at each sample: edge gaps remain unknown, and comparison requires at least 95% model coverage. Tree shade, terrain and weather remain unmodelled.

New-area route checks use official Schaffhauserstrasse 100, Dufourstrasse 150 and Birmensdorferstrasse 93 addresses. Their coordinates, routes, coverage and detours are recorded by `scripts/verify-coverage.ts` in `coverage-validation.json`. Address-to-address checking also uses Bahnhofstrasse 1 → Münsterhof 2. These are real source locations, never synthetic route fixtures.

## Official address search

Source: [Adressen Stadt Zürich](https://data.stadt-zuerich.ch/dataset/geo_adressen_stadt_zuerich), **CC0**, City of Zurich / Geomatik + Vermessung. WFS 1.1.0 layer `adrstzh_adressen_stzh_p`, GeoJSON output in EPSG:4326, fetched 30 September 2026. Catalogue metadata was modified that day; individual field-observation dates are not established by this timestamp.

Of 59,362 records, **56,704** have `status=3` and `status_txt=real`. The other 2,658 projected records are excluded. **21,318** retained addresses fall within the walking boundary. All real municipal addresses remain searchable, with outside-area results labelled; selecting one outside the supported area produces a clear coverage error and no route.

Retained fields: address label, house-number reference ID, postcode and source coordinates. Other source attributes are not shipped. Source LV95 easting/northing are independently compared with projected GeoJSON coordinates: the maximum discrepancy is **0.069 m**, below the one-metre validation threshold. This verifies transformation fidelity, not the survey accuracy or entrance position.

The source explicitly says its coordinates are **map-label positions**, not actual building entrances. Routing snaps to an existing public-path node within 45 m, subject to the existing coverage/building-crossing guards, or explains why it cannot connect. No straight-line approach is added to the route. Final access to an entrance is unverified; address presence does not establish public access.

Search accepts a street/house number, an optional postcode, umlaut transliteration, case differences and `str.` abbreviations. Numeric tokens match exactly, so number 1 is not silently selected as number 10. Local place names are preserved. Search and routing run on the device; queries and precise journeys are not stored or sent to a geocoder. The address index is included in the versioned offline bundle, rather than a live lookup.

## Map selection

Each trip field has a labelled **Map / Karte** action. It enters a deliberate selection mode with a visible cancel action and Escape support. Clicking an unselected part of the planner map opens start/destination/stop actions; selecting an existing route still selects that alternative. Outside-boundary map points explain the limitation and cannot replace the journey. The ordered three-stop limit remains unchanged.

## Reproduce the data

Normal development uses checked-in derived data. To reproduce this release from raw sources:

```sh
npm run data:fetch:zurich
.venv-geo/bin/python scripts/extract-buildings.py --expanded
.venv-geo/bin/python scripts/compact-buildings.py
npm run data:prepare
npm run data:verify
```

Create `.venv-geo` with `scripts/requirements-geo.txt` first. Traffic-zone and measured-count source preparation remain as documented in `traffic.md` and `vehicle-counts.md`; `data:prepare` now reapplies them and the address adapter, preventing a core rebuild from accidentally dropping those features. The one-off fetch script reuses existing raw files, fetches missing immutable building archives, and records live-source URLs/timestamps. Deliberate refreshes require source inspection and a new version. Raw archives and municipal exports remain ignored by Git.

Source hashes/counts are in `data-manifest.json`, `zurich-addresses-validation.json` and `vehicle-counts-validation.json`. The approximately **8.3 MB** Zurich download expands to **49.0 MB**, including local cartography and the full address index. Broader low-memory phone testing remains necessary.

## Calculation performance

Coordinate transforms are cached by CRS. A departure-specific spatial index filters candidate building shadows before the unchanged exact footprint/ray calculation, retaining holes and uncertain geometry. Missing-coverage rules and physical assumptions are unchanged. The real Zurich reference route was compared before and after the optimization: every route node, sample and metric matched exactly; local calculation fell from about 6.7 seconds to 3.1 seconds. These desktop timings are not phone performance guarantees.

Further parity checks cover the morning reference, an evening Wipkingen route and a winter Seefeld route. Every result is deeply equal to the previous algorithm; see [shadow-index-validation.json](shadow-index-validation.json).
