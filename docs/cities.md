# Coverage register

All launched areas are **bounded pilots**, not complete cities or countries. The map shows the route boundary. Every route must stay within it; a visible map outside it does not establish supported coverage.

| City                                    | Status / route bounds (W, S, E, N)                            | Greenery                                            | Building sun/shade                                                  | Water                   |
| --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| Zurich, Switzerland                     | Pilot: `[8.529,47.362,8.552,47.385]`, Limmat corridor         | Recorded tree proximity                             | Experimental, buildings only                                        | Surface-water proximity |
| Munich, Bavaria, Germany                | Pilot: `[11.560,48.135,11.582,48.146]`, old town west         | Automatic tree detections; false positives possible | Experimental, buildings only; tile-edge gaps can prevent comparison | Surface-water proximity |
| Cambridge, Massachusetts, United States | Pilot: `[-71.132,42.367,-71.108,42.384]`, Harvard Square area | Municipal records marked Tree                       | **Not enabled**                                                     | Surface-water proximity |
| Basel, Basel-Stadt, Switzerland         | Pilot: `[7.580,47.547,7.606,47.569]`, old town and Rhine      | Maintained-tree register                            | **Not enabled**                                                     | Surface-water proximity |
| Paris, Île-de-France, France            | Data under review; no launched coverage                       | Not enabled                                         | Not enabled                                                         | Not enabled             |
| Vienna, Austria                         | Candidate; no launched coverage                               | Not enabled                                         | Not enabled                                                         | Not enabled             |

**Tree shade, terrain effects and fountains are disabled in every city.** Water is a separate proximity preference, not evidence of cooling, views, shoreline access or drinking water. Greenery is distance within 15 m of source tree points, not canopy shade.

Building-enabled pilots offer explicit **Prefer shade / Prefer sun**. Direct-sun estimates require solar elevation of at least 10° and at least 95% model coverage for both comparison routes. Building geometry extends beyond route endpoints, and sample coverage checks account for surrounding shadow sources. Unknown coverage is never treated as sunshine. Munich uses one 2 km LoD2 tile: low winter sun or edge routes can exceed its available surroundings. The app explains the limitation and withholds a sun recommendation.

## Validated shared implementation

All four pilots use the same search, local map styling, graph routing, stops, detour limits, water/tree scoring, units and time controls. Source adapters supply the differences; the interface uses configured capabilities and source notes. `docs/city-route-validation.json` records actual routes and alternatives, reference places, model coverage and local times. Runtime data manifests record source hashes and counts.

| Pilot         | Calculation CRS        | Route time zone  | Default mapped journey              |
| ------------- | ---------------------- | ---------------- | ----------------------------------- |
| Zurich        | LV95, metres           | Europe/Zurich    | Bahnhofquai → Bürkliplatz           |
| Munich        | ETRS89 UTM 32N, metres | Europe/Berlin    | Karlsplatz (Stachus) → Odeonsplatz  |
| Cambridge, MA | WGS84 UTM 19N, metres  | America/New_York | Brattle Street → Cambridge Street   |
| Basel         | LV95, metres           | Europe/Zurich    | Aeschenplatz → Mittlere Rheinbrücke |

## Data feasibility and next integration steps

**Munich:** official Bavarian LoD2 provides ground surfaces, genuine relative heights and source dates; automatic 2024 tree detections supply a separate, less certain greenery indicator. One tile was fetched and checked against the published checksum. The bounded OSM walking network preserves real node connectivity. Next: extend surrounding tiles to improve winter coverage, field-check access and validate dated real shadows before enlarging the pilot. Automatic detections require a positional/false-positive audit before making stronger tree claims.

**Cambridge, MA:** the municipal GIS supplies actual tree sites and building footprints with height fields under PDDL. Its 43,222 tree-site records contain explicit statuses, allowing vacant/stump/unknown sites to be excluded. A dated Geofabrik Massachusetts extract supplies real walking/map/water geometry. Building shade is deliberately disabled: 250 of 18,235 inspected building features have missing/nonpositive TOP_GL values; verified vertical units, unknown-height masks and municipal coverage edges remain to be implemented. Next: normalize heights and model masks, then test separate sun/shade capability. Campus access and public routes need local field checks; inventory ownership does not imply walking access.

**Basel:** the cantonal tree register and actual OSM network support greenery and waterside comparisons. The Switzerland-only OSM mirror truncated a cross-border Rhine relation; a complete OSM API relation supplies its actual boundary. Next: ingest a suitable local swisstopo building extract, check height/terrain references and surrounding coverage, and validate shade/sun before enabling it. Register trees do not represent every private tree.

**Paris:** its municipal [Arbres API](https://opendata.paris.fr/explore/dataset/les-arbres/) supplied inspected records with names, positions, height and management fields; [IGN BD TOPO](https://www.data.gouv.fr/datasets/bd-topo-r) is a documented building source. The user-requested Munich, Cambridge and Basel integrations took priority. Paris remains a researched candidate, with no graph/building integration or runtime recommendations. Preserve accents and normalize Lambert-93/height semantics before integration.

**Vienna:** compared using the city's [WFS documentation](https://digitales.wien.gv.at/open-data/geowebservices/) and geodata catalogue. No source sample or runtime adapter has been validated. Its presence in this register does not imply availability.

Source dates, exact resources, attribution, transformations and known gaps are in [data-sources.md](data-sources.md). Geographic support is city-specific; these pilots are not blanket Swiss, German, US or worldwide coverage.
