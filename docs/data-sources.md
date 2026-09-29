# Data sources and preparation

Source review and fetch date: **28 September 2026**. Runtime arrays and raw hashes are recorded in `data-manifest.json`. Raw downloads remain ignored under `data/raw/`. Data is never filled in by a language model or replaced by a synthetic fallback.

## OpenStreetMap: walking graph, places and map

- Provider: OpenStreetMap contributors. Reuse: [ODbL 1.0](https://www.openstreetmap.org/copyright). Visible attribution and derived-database obligations apply independently of the software licence.
- Actual endpoint used: `https://overpass.osm.ch/api/interpreter`, a [documented Swiss Overpass instance](https://wiki.openstreetmap.org/wiki/Overpass_API). Other public instances were unavailable or rejected the request. The main OSM map API rejected the area as exceeding its 50,000-node limit; it is not a runtime fallback.
- Spatial extract: road/building box `[8.522,47.355,8.558,47.391]`; somewhat larger water/park context. The advertised route coverage is smaller. All graph edges are clipped by endpoint containment, and route samples are checked again.
- Source format/CRS: OSM JSON, WGS84 (EPSG:4326); node IDs establish topology. Fields retained for ingestion include `highway`, `foot`, `access`, conditional restrictions, `service`, `indoor`, `barrier`, names and geometry. No lines are connected just because they intersect in 2D.
- Version/freshness: the Swiss mirror returned `osm3s.timestamp_osm_base: "117344"`. This is **not an ISO observation date** and is retained verbatim as a source marker. We do not infer a recent observation/update date from it or from our fetch date. Individual surveying dates are unknown. Refresh and freshness verification are required before a broader release.
- Derived map data is factual geography, not shade geometry. A separate bounded relation extract supplies water and park multipolygons. Rings are joined using shared OSM endpoint identities, holes are preserved and incomplete rings fail preparation. The Limmat and lake boundaries were inspected in rendered screenshots.
- Hosting/service limits: a one-time bounded download, locally processed. No public Overpass, tile or route service is queried by the running app. Respect service capacity when refreshing; do not use this script as a high-volume production data pipeline.

Version 2 also derives **31 surface-water polygons** from the same OSM files described above. Real boundaries and island holes are retained. Fountains, basins, reflecting pools, and tagged underground, covered, intermittent or seasonal water are excluded. Waterway centreline widths are not invented. Proximity does not verify access, visibility, current water conditions or cooling.

## City of Zurich: tree positions

- [Bauminventar catalogue](https://data.stadt-zuerich.ch/dataset/geo_bauminventar), [CKAN metadata](https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_bauminventar). Catalogue licence: CC0. Credit City of Zurich / Grün Stadt Zürich and underlying swissTLM3D contributions.
- Actual WFS: `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Bauminventar`; layer `bauminventar`, WFS 1.1.0, output GeoJSON, `srsName=EPSG:4326`. Query box `[8.523,47.358,8.558,47.390]`. The geographic response bounds and coordinates were inspected.
- Fields inspected: `baumnummer`, `baumart_deu`, `baumart_lat`, `datenstand`, `genauigkeit`, `hoehe`, `pflanzjahr`, `status`, `uuid_tlm3d`, `x`, `y`.
- Source dates: inventory documentation says register and swissTLM3D tree positions 2021, LiDAR heights 2018; preparation records include `202212151503`. Catalogue metadata was edited in 2026, which is **not** a new observation date.
- Source XY values use LV95; the queried output is WGS84. Runtime retains positions and provenance, not unused personal/contact attributes.
- `TLM3D_GF` woodland points are randomly distributed model positions and are excluded. Register and individual-tree locations support a proximity indicator only. Source crown widths are inferred, not measured, and some source heights use defaults. Therefore no tree-shade capability is enabled.

A separate bounded query of the maintained [Baumkataster](https://data.stadt-zuerich.ch/dataset/geo_baumkataster), layer `baumkataster_baumstandorte`, was fetched on 28 September 2026 for comparison only. `scripts/fetch-tree-audit.sh` records the exact WGS84 request over the pilot bounds. The catalogue reports CC0, a 30 August 2026 update and weekly updates, not individual survey dates. Raw files remain ignored; hashes, accuracy categories, derived statistics and limitations are in [tree-accuracy.md](tree-accuracy.md) and `tree-audit.json`. Runtime tree locations did not change through the audit.

## swisstopo: actual building geometry

- [swissBUILDINGS3D 3.0 beta](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta), source acknowledgment **© swisstopo**. The open-geodata terms allow reuse with source attribution; dataset reuse does not imply unrestricted consumption of hosted services.
- [STAC discovery](https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissbuildings3d_3_0/items): inspected actual asset listings for the pilot. Selected historical **2019** items `1091-23` and `1091-41`; do not label them 2026 geometry.
- Exact assets are pinned in `scripts/fetch-data.sh`. Compressed tiles total about 442 MB, uncompressed CityGML several GB. Only processed regional footprints are tracked.
- CRS/height datum: **LV95 / LN02**, source horizontal metres and absolute elevation metres. Parse building ground surfaces; height is maximum model Z minus minimum ground-surface Z. The source product's roof forms are simplified to footprint extrusions for this pilot.
- Coverage envelopes: northern tile `[8.5145202,47.3772713,8.5730194,47.4048054]`; southern tile `[8.5139758,47.3502913,8.5724451,47.3778253]`. Actual model data extends beyond the routing boundary. Source tile geometry, rather than merely its envelope, should be re-audited when extending the area.
- Processing: XML streaming → original ground triangles and heights → Shapely union with courtyard holes → 0.1 m simplification → WGS84 storage, rounded to seven decimal places → explicit LV95 projection at calculation time. No arbitrary building heights are invented.
- Limitations: source age, simplified roofs, local minimum ground reference and unmodelled terrain. The model is experimental and not validated against timestamped Zurich field observations.

## Fonts and software

React, Vite, MapLibre, proj4, Temporal polyfill and SunCalc are locked in `package-lock.json`. MapLibre was updated to the patched 6.11.2 series after the initial dependency audit; Sharp was updated to 0.35.5. The later audit reported zero known advisories.

DM Sans and DM Serif Display are self-hosted through Fontsource; their SIL Open Font License notices are copied into `public/fonts/` so production builds retain them. Open Sans Semibold map glyphs are vendored from the [MapLibre demo assets](https://github.com/maplibre/demotiles), whose documented source is [OpenMapTiles fonts](https://github.com/openmaptiles/fonts/tree/master/open-sans). Its Open Sans notice and Apache licence, along with MapLibre's BSD notice, are retained under `public/fonts/`. The running map does not consume the demo tile service.

## Reproduce the transformation

The checked-in extracts make ordinary development self-contained. To rebuild them from sources, allow several GB of free disk space and Python 3.13+ for the recorded geospatial environment:

```sh
bash scripts/fetch-data.sh
python3 -m venv .venv-geo
.venv-geo/bin/pip install -r scripts/requirements-geo.txt
.venv-geo/bin/python scripts/extract-buildings.py
.venv-geo/bin/python scripts/compact-buildings.py
npm run data:fetch:traffic
npm run data:prepare
npm run data:verify
```

Building URLs are versioned. OSM and tree endpoints are live snapshots, so a later download may differ; exact historical reprocessing requires the raw inputs matching the stored SHA-256 hashes. The transformation is deterministic for those inputs, not a promise that a changing upstream source will reproduce identical bytes forever.

For any refresh: inspect source schemas/dates/licences, update the fetch date and data version in the adapter/configuration, preserve new raw hashes, rerun route/model/browser tests, and review source changes before committing derived data. Do not change coverage just because a larger download succeeded. City configuration, data manifest and runtime versions must stay aligned.

## International research

Paris's actual two-record API sample was inspected locally and its source fields are summarized in `cities.md`. IGN BD TOPO is a documented height source, but no Paris building sample, local route or shade calculation has been validated yet. Vienna was compared using its official WFS and OGD documentation. Neither is presented as launched.

## Munich: Bavarian LoD2 and automatic tree detections

- Official [Bavaria open geodata catalogue](https://geodaten.bayern.de/opengeodata/), [LoD2 product notes](https://geodaten.bayern.de/odd/m/3/pdf/hinweise_daten_lod2_download.pdf), [individual-tree limitations](https://www.geodaten.bayern.de/odd/m/3/html/datenhinweise/datenhinweise_einzelbaeume.html) and [tree schema](https://geodaten.bayern.de/odd/m/3/pdf/einzelbaeume_datenformat.pdf) were checked against actual downloads. Licence: **CC BY 4.0**, attribution **Bayerische Vermessungsverwaltung**. The app uses no hosted map-viewer scraping or remote runtime service.
- Buildings: municipal metalink `https://geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09162000.meta4`, published 22 September 2026. Four adjacent 2 km tiles: `690_5334`, `692_5334`, `690_5336`, `692_5336`, each from `https://download1.bayernwolke.de/a/lod2/citygml/<tile>.gml` (approximately 506 MB combined). `scripts/fetch-munich-buildings.py` validates every published byte count and SHA-256 before extraction. This is not the entire municipal dataset.
- Actual source: CityGML 1.0, **ETRS89 UTM 32N / DHHN2016**, metre XYZ coordinates. Read each building/part's real GroundSurface polygons, retain courtyard holes, calculate maximum geometry Z minus minimum ground Z, union/simplify by 0.1 m. All 19,529 derived heights were compared with source `measuredHeight` in metres. 30 objects disagree by more than 0.05 m (maximum 10.273 m); 28 of these carry non-building function codes and have elevated slab geometry. All `53001_*` structures and all disagreements are conservatively masked: 61 objects total. The remaining 19,468 accepted comparisons agree within 0.013 m. No conflicting height is silently chosen as a valid ground extrusion. Exact IDs, source values and reasons are retained in the manifest. This checks extraction, not real-world survey accuracy or the simplified shadow model.
- Nominal tile: `[690000,5334000,692000,5336000]`. The runtime model boundary is a conservative WGS84 rectangle inside the rotated metric tile. Surrounding geometry and maximum possible shadow reach determine sample coverage. Long winter shadows can leave insufficient coverage even for endpoints inside the walking boundary. Missing coverage stays unknown.
- Building creation and `Grundrissaktualitaet` dates vary by object and are counted in `munich-data-manifest.json`. Index publication is not a new field observation. Standardized roof geometry is simplified further to flat-ground extrusions; no tree or terrain shadows.
- Trees: Munich block **124028, product year 2024**, `https://geodaten.bayern.de/odd/m/8/baeume3d/data/124028_baeume.gpkg`, roughly 482 MB. A read-only GeoPackage spatial-index query extracts actual EPSG:25832 point coordinates around the pilot. The source derives trees automatically from surface/elevation models and imagery. Roof edges, power lines and shadows can cause false detections; these are not surveyed trunk centres. `baumhoehe`/`dgmhoehe` are not used to invent canopy shade.
- Network/map: twelve small, bounded [OSM API v0.6](https://wiki.openstreetmap.org/wiki/API_v0.6) map extracts, original node identities preserved. Complete water/park relations are downloaded separately. Exact bounds, requests and cached source XML are specified in `fetch-munich-network.py`. Requests remain under the API's 50,000-node per-map limit. Fetch dates do not establish feature survey freshness.

## Cambridge, Massachusetts: greenery and water pilot

- [City GIS tree dictionary](https://www.cambridgema.gov/gis/gisdatadictionary/environmental/environmental_streettrees), municipal [source repository](https://github.com/cambridgegis/cambridgegis_data/tree/main/Environmental/Trees). Licence: **Open Data Commons PDDL 1.0**, credit City of Cambridge GIS / Public Works. Actual GeoJSON contains 43,222 site records; catalogue modified **6 July 2026**, not the observation date of every tree.
- Read WGS84 Point coordinates and TreeID. **Retain only `SiteType === 'Tree'`**. Exclude retired trees, stumps, spars, vacant planting sites and unknown statuses regardless of other attributes. The register covers several owners, including university sites; private trees and changes can be absent. Only the bounded subset with a small tree-proximity buffer is shipped. Source coordinates are not randomly shifted or expanded into imagined crowns.
- OSM network/map/water: [Geofabrik Massachusetts](https://download.geofabrik.de/north-america/us/massachusetts.html), dated `https://download.geofabrik.de/north-america/us/massachusetts-260927.osm.pbf` (~311 MB). ODbL, © OpenStreetMap contributors. The actual PBF replication timestamp and SHA-256 are recorded separately from its filename. A local pyosmium extraction retains original OSM IDs, way nodes and tags; libosmium assembles water/park multipolygons and islands. The app does not call Geofabrik or a routing demo server.
- Calculation CRS: **WGS84 UTM 19N**, metres; display WGS84. Time zone: **America/New_York**, including its own DST transitions. The municipal source geodatabase uses NAD83 Massachusetts State Plane feet (EPSG:2249); the supplied GeoJSON is already geographic, so its coordinates are not treated as feet.
- **Sun/shade blocked at integration:** inspected [actual building data](https://www.cambridgema.gov/gis/gisdatadictionary/basemap/basemap_buildings) and source XML. The 18,235 features include 250 missing/nonpositive `TOP_GL` heights. Footprints derive from April 2018 imagery; the 2026 catalogue edit is not new imagery. Source elevation reference is NAVD88; unit/attribute semantics and missing-height masks need further verification before modelling. None of these heights enters the released runtime. Next: normalize verified relative heights and units, mask unknown buildings and municipal-edge gaps, then validate daylight routes. No sun/shade claims here.

## Basel: maintained-tree register and Rhine geometry

- [Basel-Stadt Baumkataster, dataset 100052](https://data.bs.ch/explore/dataset/100052/), actual Explore API GeoJSON export and metadata. Licence **CC BY 4.0** with the portal's OSM conditions, attribution **Geodaten Kanton Basel-Stadt** and © OpenStreetMap contributors. There were **32,381 source records**; catalogue modified 26 September 2026 and processed daily. Planting dates/catalogue changes are not survey dates.
- The register covers Stadtgärtnerei Basel and Riehen maintained trees, not all private/urban trees. Retain actual point coordinates and `ba_baumnr`. Source geodata is LV95; the API GeoJSON export supplies WGS84 points, explicitly projected back to LV95 for distances. Tree positions support proximity, not canopy or leaf cover.
- Bounded Swiss Overpass road/tree-context extracts are recorded in `fetch-city-data.sh`; OSM reuse/attribution is as above. The mirror's `117349` marker is not an ISO observation timestamp. Its Switzerland clipping left the cross-border Rhine relation incomplete. `complete-basel-water.py` merges the **complete original relation 7518910** from the documented OSM API. No artificial polygon closure is used.
- Sun/shade is disabled: a local building-height extract and its coverage checks have not been integrated. Basemap footprints are never treated as physical shadow data.

## Rebuild the additional cities

After `npm ci`, prepare the same pinned Python environment as above, then run one or more:

```sh
bash scripts/fetch-city-data.sh basel
bash scripts/fetch-city-data.sh cambridge
bash scripts/fetch-city-data.sh munich
npm run data:verify
```

The scripts are resumable for the large immutable files. For a deliberate source refresh, remove the relevant cached raw files first, inspect upstream dates/licences/schema and increment the configured version/fetch date. Live municipal exports and OSM APIs can change; exact historical output requires raw files matching each `*-data-manifest.json` hash. Munich's published metalink can also change; keep its matching index and tile together. Ordinary app setup uses the compact checked-in derived files and needs none of these large downloads or Python dependencies.

## Coverage expansion — 29 September 2026 preparation

Zurich and Basel reuse their previously fetched, broader OSM and environmental sources with enlarged routing bounds; this is a new preparation, not a claim of new observations. Zurich uses an inventory buffer of at least about 75 m around its new routing rectangle. Basel’s full cantonal tree export supports its expanded central rectangle. Their actual limits are in `cities.md` and versioned manifests.

Cambridge now uses the official [City Boundary](https://www.cambridgema.gov/gis/gisdatadictionary/boundary/boundary_cityboundary), supplied as `https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Boundary/City_Boundary/BOUNDARY_CityBoundary.geojson`. Licence: PDDL 1.0; dictionary modified 10 June 2020, not a current survey date. The published GeoJSON is WGS84, whereas the original municipal geodatabase uses StatePlane Massachusetts Mainland feet. `prepare-city-boundaries.py` retains the 1,670-vertex polygon, rounded only to seven decimal places, in `src/lib/coverage/cambridge.json`. Its raw SHA-256 is in the Cambridge manifest.

`extract-cambridge-osm.py` reuses the dated Massachusetts PBF over `[-71.166,42.348,-71.060,42.409]`. Graph edges are admitted only if their entire segment stays inside the municipal polygon. Exact polygon intersection intervals catch narrow boundary gaps and holes; endpoints alone are insufficient. Paths crossing the Charles into Boston, or into Somerville, are not advertised as supported. Municipal tree records remain incomplete for private vegetation.

Munich adds a fourth northward row to the bounded OSM request grid and three adjacent building tiles. The combined UTM building block is `[690000,5334000,694000,5338000]`. All source tiles must be present and checksum-valid; a missing tile must never be hidden by taking the rectangular union of available tiles. Runtime building coverage is the conservative inscribed WGS84 rectangle recorded in its manifest. All raw files remain ignored.

Preparation commands are unchanged; the Cambridge fetch command additionally obtains/prepares its boundary, and the Munich fetch command obtains/checks all four tiles. Existing immutable sources can be reused. Fetch timestamps and preparation dates are separate from observations; source dates remain historical.

## Zurich traffic zones and street context · 29 September 2026

The derived Zurich v4 bundle adds actual current-status municipal traffic zones (`view_geoserver_zonen_ist`, WGS84 response, CC0), transformed into LV95 metre coordinates and combined with the existing buffered OSM road classes (ODbL). Source: [Verkehrszonen](https://data.stadt-zuerich.ch/dataset/geo_verkehrszonen). Fields checked: `id`, `zonenname`, `zonentyp_technical`, `umgesetzt_datum`, `rechtskraeftig_datum`, `publiziert_vsi_datum` and MultiPolygon geometry. Of 366 records, one null geometry (ID 65) is excluded. Dates missing in individual records remain unknown; catalogue modification and fetch dates are not observation dates. No planned-status speed layer is used.

[traffic.md](traffic.md) records the verified WFS layer, download/preparation commands, street classification, comparison rules, source candidates not yet integrated and a real route example. [traffic-validation.json](traffic-validation.json) records hashes, zone IDs and class totals. Raw GeoJSON remains ignored; compact per-edge classes are distributed with the reproducible derived graph. `npm run data:prepare` requires the fetched traffic zones and now runs the traffic adapter after base Zurich preparation.
