# Munich · 0.23.0

Munich now uses the shared Zurich planner features wherever Munich's source data supports them. It remains **beta**, covering **8.90 km²** around the old town, Lehel and the southern English Garden. This release does not expand the walking boundary or establish citywide availability. Select **München · Beta** in the website, PWA or native app.

| Function                            | Munich implementation                                                                                    | Remaining limit                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Shade / Sun                         | Two prominent buttons; arrival-time building exposure drives real route choice                           | Buildings only; no tree shade yet                                                                           |
| Detailed building shade             | Actual Bavarian LoD2 roof and facade surfaces; same tiled ray-intersection engine as Zurich              | LoD2 is simplified geometry, not a field-validated digital twin                                             |
| Departure time / seasons            | Europe/Berlin date/time, DST, moving solar position, explicit Sun choice in winter                       | No prediction of foliage or cloud cover; below 10° solar elevation remains unknown                          |
| Extra walking                       | 0/5/10/15-minute buttons and 1-minute slider                                                             | Best among evaluated alternatives, not a globally optimal route                                             |
| Addresses                           | 5,516 mapped addresses, including 4,529 actual OSM point addresses                                       | Partial snapshot; building label positions are not verified entrances                                       |
| Map points / location / stops       | Existing shared map selection, explicit geolocation and up to three waypoints                            | Normal public-access, coverage and snapping checks apply                                                    |
| Calmer streets                      | OSM street type/access, explicit speed tags, same-level main-road proximity                              | Street context, not traffic volume, noise or safety                                                         |
| Tempo 30 map                        | 711 street fragments corroborated by implemented municipal zones and explicit OSM 30 km/h tags           | Source is cartographically generalized; no whole-neighbourhood colouring or authoritative speed-limit claim |
| Flatter routes                      | DGM1 ground elevations averaged to 2 m; ascent/descent/profile and preference                            | Bridges/tunnels need separate walking heights; insufficient coverage prevents comparison                    |
| Accessibility                       | Avoids mapped stairs, wheelchair=no, raised kerbs and other recorded barriers; considers gentler terrain | No guarantee of wheelchair access: widths, surfaces, kerbs and temporary obstacles remain incomplete        |
| Water / greenery                    | Existing Isar/Eisbach and other mapped surface water; 29,503 real automatic tree detections              | Proximity is separate from shade and does not establish access or cooling                                   |
| Multiple wishes                     | Same physical comparison bands and detour constraint as Zurich                                           | Conflicting wishes cannot all be guaranteed; missing evidence cannot improve scores                         |
| German / English, metric / imperial | Shared interface, translations, units and city-local time                                                | Local place names are preserved                                                                             |
| Downloads / native app              | Full Munich pack **18.2 MB**; Old Town pack **16.0 MB**, including surrounding 3D tiles                  | Native remote updates still share the existing protected-host limitation; full builds include Munich        |

## Source and processing record

- **Buildings:** four existing official 2 km LoD2 CityGML tiles, `690_5334`, `692_5334`, `690_5336`, `692_5336`. Each source must match its official metalink SHA-256. The importer preserves building parts, polygon holes and actual roof/facade heights. **19,467 accepted parts / 1,036,448 source triangles**. **62 footprint records** remain unknown masks (61 already unsupported/conflicting records, one additional triangulation rejection). See [building and ground report](munich-shade-data.json).
- **Ground:** [Bavaria DGM1](https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dgm1), sixteen 1 km GeoTIFF tiles from the official [Munich metalink](https://geodaten.bayern.de/odd/a/dgm/dgm1/meta/metalink/09162000.meta4). Original 1 m cells are averaged in aligned 2×2 blocks; any invalid input keeps the output unknown. Four million valid 2 m cells, no filled gaps; decimetre storage. Raster `TIFFTAG_DATETIME` values are retained as file metadata, **not asserted as flight dates**. Fetch: 11 October 2026. © Bayerische Vermessungsverwaltung, CC BY 4.0; derived/resampled data.
- **Coordinates:** EPSG:25832 / ETRS89 UTM32, metres; roof and ground heights in **DHHN2016**. WGS84 for map display. The 16 km² source rectangle supplies surrounding shadow casters; leaving that domain can still make a sample unknown. Grid convergence is explicitly applied to solar azimuths. Ground heights do not create terrain-cast shadows.
- **Paths, addresses, barriers and street classes:** original OSM snapshot fetched 28 September 2026, ODbL / © OpenStreetMap contributors. Original node IDs and connectivity remain intact. The graph includes **90.6 km separately mapped sidewalks**, **4.2 km crossings**, **143.4 km other pedestrian paths/streets**, and **88.8 km street centrelines** (graph lengths, not unique street lengths). These figures do not establish a complete pavement network. No parallel sidewalks or crossings are generated by offsetting roads.
- **Traffic zones:** [Mobilitätsreferat München, Tempo-30-Zonen](https://opendata.muenchen.de/dataset/rad_rsp_tempo30zone_poly), DL-DE-BY-2.0; WFS `mor_wfs:rad_rsp_tempo30zone_poly`, EPSG:25832, fetched 11 October 2026. `status=2` means existing/in operation; 83 source polygons intersect the supported area. The catalogue warns that Radlstadtplan geometry is not positionally exact. Consequently a street needs an independent explicit `maxspeed=30` tag before colouring; contradictory/conditional tags, elevated roads and private drives are excluded. Polygon membership alone never changes routing. Null implementation dates stay null. [Source hashes and feature counts](munich-features-data.json).
- **Addresses:** OSM `addr:street`, `addr:housenumber`, optional postcode. Real point records precede duplicate building labels. A closed building footprint may supply a derived interior label point, explicitly **not** an entrance; the router still checks access and its 45 m snapping limit. The [official municipal address CSV](https://opendata.muenchen.de/dataset/adressen_opendata) was inspected: `STRASSE,STRANAM,HSZ,STADTBEZIRK`, **no coordinates**. It is retained as research evidence, not silently geocoded.

Runtime data loading, worker cancellation, tile checksums, offline packs, unknown exposure, faster-route reference and phone interface all use the existing shared implementation. Zurich's data and model rules are unchanged.

## Reproduce

A normal checkout needs only `npm ci` and `npm run dev`; small derived assets are committed. Raw CityGML, GeoTIFF, GeoPackage and OSM files remain ignored. No runtime API key or hosted routing demo is needed.

With the existing geospatial Python environment and original Munich inputs described in [data sources](data-sources.md):

```sh
npm run data:fetch:munich:extensions
npm run data:prepare:munich
npm run data:packs
npm run data:verify:munich
node --import tsx scripts/verify-munich.ts --export-rays
.venv-geo/bin/python scripts/audit-munich-shade.py
npm run check
```

`data:prepare:cities` also reattaches the Munich features, so a routine rebuild does not erase addresses or traffic context. Cached sources and official hashes pin preparation. For a deliberate update, review source schema/licence/dates, retain the old evidence and increment versions before replacing derived assets.

## Verification

[33 real calculations](munich-route-validation.json) cover five point pairs in June and October, 0/1/5/10/15-minute budgets, both light choices, independent and combined preferences, mapped-barrier avoidance, a waypoint, actual addresses, changed time, night and outside coverage. **All ten paired Sun/Shade comparisons selected different paths.** Every alternative respects its detour allowance and known-data comparison rules. A different path is evidence that the control works, not proof of field accuracy.

The [independent source audit](munich-shade-audit.json) compares rays with original untriangulated CityGML polygons using separate plane fitting, checks native DGM1 blocks and NREL SPA solar elevation. Its frozen fixture runs in the ordinary automated tests without raw downloads. Boundary-sensitive rays remain reported separately. Browser, native and deployment results are recorded in [progress](progress.md) and [platform](platform.md) after release checks.

Actual UI captures: [desktop planner in German](screenshots/munich-features-desktop-de.png), [phone Sun route](screenshots/munich-features-phone-sun-en.png), [tablet method view](screenshots/munich-features-tablet-method.png), [unavailable-data state](screenshots/munich-features-phone-error.png), [live installed PWA](screenshots/munich-features-pwa-de.png) and [Android emulator](screenshots/munich-features-android-de.png). Screenshots were inspected; they do not establish physical-phone performance.

The live site is [coolerwalks.ch](https://coolerwalks.ch/de/?view=planner), with the existing password gate. Select **München · Beta**. For local development: `npm ci`, then `npm run dev`; for the production preview: `npm run build`, then `npm run preview`. The emulator-tested Android APK is `native-artifacts/cooler-walks-0.23.0-debug.apk` (ignored by Git); its checksum is in [release evidence](releases/0.23.0-local-validation.json).

## Open: parity that is not yet supported

1. **Tree shade.** The 2024 tree product supplies positions and heights, not crown outlines/vertical foliage geometry. Bavaria's [published laser classification](https://www.ldbv.bayern.de/mam/ldbv/dateien/laserdaten_punktklassenbeschreibung.pdf) puts vegetation together with other objects in class 20; treating every object return as a tree would be wrong. Open [laser](https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=laserdaten) and [DOM20](https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dom20) sources exist. Next: validate a vegetation-only mask, for example with suitable contemporaneous imagery, distinguish non-vegetation objects, then build and audit canopy columns. Do not invent circular crowns from tree height.
2. **Complete pavement / side-of-street selection.** Existing OSM sidewalks are used, but their coverage and crossings do not replace Zurich's municipal network. The official [shared foot/cycle map](https://opendata.muenchen.de/dataset/rad_rsp_gemradfusswege_line) is cartographic and explicitly not positionally exact. A complete, connected, suitably licensed pedestrian-surface/crossing dataset or an audited expansion of explicit OSM paths is still needed. Never promise which pavement is shaded on centreline sections.
3. **Street-level vehicle counts.** Munich publishes a [2022 traffic-volume map](https://stadt.muenchen.de/infos/verkehrsdaten.html), largely extrapolated typical-workday totals, and uses [DAVe](https://opensource.muenchen.de/de/software/dave.html) for counts. No documented, reusable public hourly point-data export comparable to Zurich's was verified in this work. DAVe's software licence is not a licence to its database. Obtain an export/API with coordinates, directions, observation dates, intervals and reuse terms before importing counts. **Live traffic remains unavailable in Zurich as well.**
4. **Complete official address coordinates.** The public municipal CSV alone cannot locate a house. Current OSM search is useful but incomplete; an authoritative geocoded address service/export with deployment terms remains desirable.
5. **Wider Munich coverage and walking-surface heights.** This release adds features inside the existing 8.90 km² boundary. More building/terrain/OSM tiles are feasible, but need connected-network checks, coverage audits and phone tests. Bridges, tunnels and other missing walking heights remain unknown.
6. **Field accuracy and comprehensive accessibility.** Shade, traffic context, actual access, barriers and map-side alignment still need local field validation. Seasonal foliage, cloud/weather effects, terrain shadows and complete wheelchair suitability are not solved by these new data imports.
