# Coverage register

**Swiss cities first: Zurich is the primary focus; Basel, Munich and Cambridge are beta.** All launched areas remain **experimental pilots**. Cambridge now follows its whole municipal boundary; the other cities cover expanded central areas. This is not blanket countrywide coverage or a field-validated citywide service. The map shows the route boundary. Every route must stay within it; a visible map outside it does not establish supported coverage.

| City                                    | Status / route bounds (W, S, E, N)                                                                             | Greenery                                            | Building sun/shade                                                  | Water                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| Zurich, Switzerland                     | Pilot: `[8.472,47.353,8.570,47.427]`, centre, Oerlikon and Altstetten, **57.77 km²** (2.65× the 0.7 area)      | Recorded tree proximity                             | Experimental, buildings only                                        | Surface-water proximity |
| Munich, Bavaria, Germany                | Beta pilot: `[11.558,48.133,11.601,48.158]`, old town, Lehel and southern English Garden, **8.90 km²** (4.44×) | Automatic tree detections; false positives possible | Experimental, buildings only; tile-edge gaps can prevent comparison | Surface-water proximity |
| Cambridge, Massachusetts, United States | Beta pilot: Official municipal polygon within `[-71.161,42.352,-71.063,42.405]`, **18.46 km²** (4.95×)         | Municipal records marked Tree                       | **Not enabled**                                                     | Surface-water proximity |
| Basel, Basel-Stadt, Switzerland         | Beta pilot: `[7.576,47.541,7.611,47.576]`, central Basel and Kleinbasel, **10.25 km²** (2.14×)                 | Maintained-tree register                            | **Not enabled**                                                     | Surface-water proximity |
| Paris, Île-de-France, France            | Data under review; no launched coverage                                                                        | Not enabled                                         | Not enabled                                                         | Not enabled             |
| Vienna, Austria                         | Candidate; no launched coverage                                                                                | Not enabled                                         | Not enabled                                                         | Not enabled             |

**Calmer-street routing:** Zurich only, within its existing pilot boundary. Official current pedestrian/Begegnungszone/Tempo-30 polygons plus buffered OSM main-road classes; experimental street context, not measured traffic. Munich, Cambridge, Basel and candidate cities do not yet enable it. [Traffic data and limitations](traffic.md). English and German work across all city interfaces.

**Tree shade, terrain shadows and fountains are disabled in every city.** Water is a separate proximity preference, not evidence of cooling, views, shoreline access or drinking water. Greenery is distance within 15 m of source tree points, not canopy shade.

Building-enabled pilots offer explicit **Prefer shade / Prefer sun**. Direct-sun estimates require solar elevation of at least 10° and at least 95% model coverage for both comparison routes. Building geometry extends beyond route endpoints, and sample coverage checks account for surrounding shadow sources. Unknown coverage is never treated as sunshine. Munich now uses four adjacent 2 km LoD2 tiles. Unsupported elevated structures and conflicting source heights remain unknown; low winter sun or edge routes can still exceed available surroundings. The app explains the limitation and withholds a sun recommendation.

## Validated shared implementation

All four pilots use the same search, local map styling, graph routing, stops, detour limits, water/tree scoring, units and time controls. Source adapters supply the differences; the interface uses configured capabilities and source notes. `docs/city-route-validation.json` records reference routes and local times. `docs/coverage-validation.json` checks every published graph edge against coverage and records six journeys with endpoints outside the old pilots, actual comparisons, areas calculated in local metric coordinates, and detour checks. Each new journey produces a distinct alternative. The map’s “Show whole coverage” action fits the full supported area. Runtime data manifests record source hashes and counts.

| Pilot         | Calculation CRS        | Route time zone  | Default mapped journey              |
| ------------- | ---------------------- | ---------------- | ----------------------------------- |
| Zurich        | LV95, metres           | Europe/Zurich    | Bahnhofquai → Bürkliplatz           |
| Munich        | ETRS89 UTM 32N, metres | Europe/Berlin    | Karlsplatz (Stachus) → Odeonsplatz  |
| Cambridge, MA | WGS84 UTM 19N, metres  | America/New_York | Brattle Street → Cambridge Street   |
| Basel         | LV95, metres           | Europe/Zurich    | Aeschenplatz → Mittlere Rheinbrücke |

## Data feasibility and next integration steps

**Munich:** official Bavarian LoD2 provides ground surfaces, genuine relative heights and source dates; automatic 2024 tree detections supply a separate, less certain greenery indicator. All four tiles were fetched and checked against their published checksums. Of 19,529 geometry parts, 61 unsupported or conflicting objects are retained as potential unknown obstructions; 19,468 accepted height comparisons agree within 0.013 m. The bounded OSM walking network preserves real node connectivity. The default winter sun comparison now works with the wider surroundings. Next: field-check access and dated shadows, resolve uncertain structures, and measure phone performance before further enlargement. Automatic detections require a positional/false-positive audit before making stronger tree claims.

**Cambridge, MA:** the municipal GIS supplies actual tree sites and building footprints with height fields under PDDL. Its 43,222 tree-site records contain explicit statuses, allowing vacant/stump/unknown sites to be excluded. A dated Geofabrik Massachusetts extract supplies real walking/map/water geometry. Building shade is deliberately disabled: 250 of 18,235 inspected building features have missing/nonpositive TOP_GL values; verified vertical units, unknown-height masks and municipal coverage edges remain to be implemented. The official municipal boundary is now integrated for routing, including every edge and complete route; neighbouring Boston/Somerville paths cannot fill inventory gaps. Next: normalize heights and unknown-height masks, then test separate sun/shade capability. Campus access and public routes need local field checks; inventory ownership does not imply walking access.

**Basel:** the cantonal tree register and actual OSM network support greenery and waterside comparisons. The Switzerland-only OSM mirror truncated a cross-border Rhine relation; a complete OSM API relation supplies its actual boundary. Next: ingest a suitable local swisstopo building extract, check height/terrain references and surrounding coverage, and validate shade/sun before enabling it. Register trees do not represent every private tree.

**Paris:** its municipal [Arbres API](https://opendata.paris.fr/explore/dataset/les-arbres/) supplied inspected records with names, positions, height and management fields; [IGN BD TOPO](https://www.data.gouv.fr/datasets/bd-topo-r) is a documented building source. The user-requested Munich, Cambridge and Basel integrations took priority. Paris remains a researched candidate, with no graph/building integration or runtime recommendations. Preserve accents and normalize Lambert-93/height semantics before integration.

**Vienna:** compared using the city's [WFS documentation](https://digitales.wien.gv.at/open-data/geowebservices/) and geodata catalogue. No source sample or runtime adapter has been validated. Its presence in this register does not imply availability.

Source dates, exact resources, attribution, transformations and known gaps are in [data-sources.md](data-sources.md). Geographic support is city-specific; these pilots are not blanket Swiss, German, US or worldwide coverage.

## Download areas

All four larger pilots can be packaged for offline use. Munich also has an optional **Old Town essentials** rectangle (11.560–11.582° E, 48.135–48.146° N; 2.00 km²), with a separately clipped walking graph and preserved surrounding building/tree geometry. It is a download area, not an administrative district, and advertises the same experimental building-only shade capability. The larger Munich pilot remains the city-selector default. See [downloads.md](downloads.md) for pack sizes, storage, versioning and hosting requirements.

## Vehicle-count evidence · 0.6.0

Zurich alone has dated hourly observations: 49 directional counters at 28 sites in the same 8.06 km² pilot. This is sparse point coverage, **not full-city or full-route measured traffic**. Profiles use 2025 measured weekdays/hours, with the existing route-local time selector; street-context ranking remains separate. Other cities do not inherit these counts. [Coverage and preparation](vehicle-counts.md).

## Zurich focus update · 0.7.0

The larger Zurich pilot includes official offline address search (56,704 existing city addresses, 21,318 within walking coverage) and 75 historical directional counters at 42 sites. All other integrated cities are visibly beta. Their geographic capabilities are unchanged. See [expanded coverage, exact source semantics and preparation](zurich-expansion.md).

## Zurich north and west · 0.8.0

The current 57.77 km² area includes Oerlikon and Altstetten and is clipped to the official municipal boundary. It contains 45,795 of the 56,704 searchable real addresses and 144 historical directional counters at 80 sites. Municipal-edge gaps, open structures and source objects without ground geometry remain unknown in the building-shade model. [Source verification and preparation](zurich-north-west.md).

## Zurich building detail · 0.10.0

The walking boundary remains 57.77 km². The detailed **3D roof/facade and LiDAR-ground library now covers that entire walking area**; the former central-only boundary has been removed. This is not the entire municipality. [Tiled library and checks](shade-library.md). Terrain supplies receiver elevation only: terrain shadows, tree shade and fountains remain unsupported. Route cards disclose the detailed-model share; missing elevations and non-ground paths remain unknown. [Extent, data and limitations](detailed-shade.md). Other cities remain beta with their existing capabilities.

## Zurich traffic-zone display · 6 October 2026

The optional 30/20 layer combines 347 implemented city zones with 42 cantonal legal orders around the supported map area. Canton data explicitly excludes Zurich and Winterthur; implementation of cantonal orders is unknown. The surrounding polygons are context, not additional walking or traffic-model coverage. Basel and the international pilots do not inherit this layer. [Source and scope audit](traffic-zone-validation.json).

## Zurich pavement sub-pilot · 0.14.0

Within the existing Zurich walking area, an optional **Talacker–Bahnhofstrasse** pilot uses 115 municipal path/crossing features (4.009 km of lines). It is a selected connected street network, not complete pavement coverage inside its rectangular envelope. Actual paths are highlighted; off-network points are rejected with a 6 m graph-node snap limit. Building shade and greenery remain separate; tree shade and terrain-horizon shadows remain unavailable. Calmer/waterside preferences use the normal Zurich network and are not enabled in this sub-pilot. Other cities retain their existing beta capabilities. [Source, routing and limitations](pavement-pilot.md).
