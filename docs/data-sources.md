# Data sources and preparation

## Tempo 30 street overlay · 9 October 2026

Reuses the recorded municipal implemented-zone snapshot and the exact OSM extract already catalogued for Zurich; no new field observations or fetch dates are implied. `scripts/prepare-traffic-zones.ts` checks both source hashes, clips eligible street lines in LV95 to the zone polygons and emits WGS84 multiline features. 5,110 features / 4,985 ways / 288 city zones are represented. Source polygons and canton orders remain separately retained; ordered boundaries do not become implemented street limits. Full exclusions and source hashes: [traffic-zone-validation.json](traffic-zone-validation.json). Zurich runtime revision is `zurich-2026-10-08-v12`; the walking and environmental coverage boundaries are unchanged.

## Zurich tree library expansion · 8 October 2026

The optional tree scenario now targets the entire supported Zurich walking area. Its 324 adjacent 500 m LiDAR source tiles span 81 km² around the 57.77 km² walking boundary. The [expansion method and preparation](tree-shade-expansion.md), [complete source/hash register](canopy-library-source-audit.json) and [computational checks](canopy-library-validation.json) record exact coverage, transformations and retained unknowns. Source: [Kanton Zürich product 557](https://geolion.zh.ch/geodatensatz/4289), observation epoch 2021–2022, LV95/LN02; free reuse and redistribution, Kanton Zürich attribution. The October 2026 fetch is not a new tree observation. Historical lakeshore references below remain evidence for version 1, not the new coverage boundary. Leaf-off acquisition and opacity/foliage assumptions remain experimental.

Traffic 0.11.0 reuses the inspected zone and north/west OSM snapshots; [v2 classification and provenance](traffic.md) record the changed semantics and corrected OSM hash. Nearby 2025 counters now select the profile at estimated passing time. GVM-ZH19 was investigated but its detailed network redistribution is not established; no model values were imported. Field validation of traffic and shadow remains pending.

Validation-only additions (30 September 2026): original Canton Zurich classified LiDAR, fourteen Commons photo originals with retained EXIF, and official LUBIS acquisition metadata. See the [source/evidence review](shadow-validation-followup.md), [LAZ hashes and coordinate datums](shadow-lidar-review.json), and [photo provenance/licences](validation/photo-register.json). None of these review inputs changes the released model or adds an advertised capability. Large/raw files remain ignored.

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

## Zurich directional vehicle counts · 30 September 2026

The v5 bundle adds 49 directional measuring points from 28 sites, using actual 2025 measured hourly records and current active-site IDs. Source fields, CC0 attribution, EPSG:2056→WGS84 transforms, hashes, missing-data filtering, daylight-saving aggregation and update instructions are in [vehicle-counts.md](vehicle-counts.md); the complete audit is [vehicle-counts-validation.json](vehicle-counts-validation.json). Imputed and missing values are excluded, not counted as zero. This is historical evidence near a walk; insufficient whole-route count coverage prevents count-based routing. The 2024 street-emission layer was inspected but supplies no usable vehicle totals and remains unintegrated.

## Zurich expansion and addresses · 30 September 2026

Version 0.7 uses new bounded OSM/tree extracts and the official CC0 address layer, while re-extracting the cached 2019 building tiles over the verified full model rectangle. [Detailed source/field/coordinate audit and reproduction](zurich-expansion.md); [address hash and exclusion report](zurich-addresses-validation.json). The official address coordinates are label positions, not verified entrances. Earlier source sections describe historical milestones; current bounds and hashes are in the data manifest.

## Zurich north and west · 0.8.0

[Oerlikon/Altstetten source audit and reproducible preparation](zurich-north-west.md) records the six checksum-verified historical tiles, actual polygon-union coverage, new bounded walking/tree extracts, official municipal coverage and source-type uncertainty masks and retained full-city address/traffic sources. The current runtime is `zurich-2026-09-30-v7`; earlier sections document previous extracts.

## Central Zurich 3D shade model · 0.10.0

The runtime now also uses actual roof/facade surfaces from the existing 2019 CityGML archives and 2021–2022 Canton Zurich LiDAR-derived ground elevations. Detailed coverage is 3.36 km² inside a 5 km² model rectangle. Source CRS, LN02 datum checks, licences, exact export requests, raw hashes, missing-data rules and reproduction commands are documented in [detailed-shade.md](detailed-shade.md) and [detailed-shade-data.json](detailed-shade-data.json). No tree shade or distant terrain-shadow capability is enabled by this addition.

## Zurich 3D library expansion · 0.13.0

The same six 2019 CityGML archives now supply 81 verified tiles covering all 57.77 km² of supported Zurich walking coverage, with a 77.616 km² casting/ground rectangle. Canton Zurich product 555 / WCS DTM 2022 supplies receiver heights; 625,000 cell comparisons against native 25 cm files verify the 2 m delivery. [Source URLs, hashes, counts and exclusions](shade-library-data.json), [ground audit](shade-library-ground-audit.json), [original-polygon audit](shade-library-geometry-audit.json), [preparation and limitations](shade-library.md). Source dates, LN02 datum, no-tree/no-hill restrictions and unresolved field evidence remain explicit.

## Tempo 30 / 20 map layer · 6 October 2026

The supplied [cantonal map metadata](https://geo.zh.ch/data/maps/845c3961-b036-49b3-a2b6-e23273917a25) identifies two datasets: GIS-ZH 65 **Tempo30- und Begegnungszonen (verfügt)**, and GIS-ZH 291 **Verkehrszonen (Stadt Zürich)**. These are now combined in the optional 30/20 layer, with separate provenance and implementation status. No third-party iframe or runtime GIS request is needed. The existing city implemented-status data still drives street classification; cantonal orders are display context only.

- **Canton:** Amt für Mobilität, Mobilitätsentwicklung und -steuerung, [dataset metadata](https://geolion.zh.ch/geodatensatz/1967), [WFS metadata](https://geolion.zh.ch/geodatenservice/2492). OGD 65.2, free reuse and redistribution; attribution “Kanton Zürich”. Public WFS 1.1.0 `https://maps.zh.ch/wfs/OGDZHWFS`, feature type `ogd-0065_giszhpub_ogd_tempo_30_20_f`, JSON requested explicitly in **EPSG:2056**. Downloaded 6 October 2026. `resultType=hits` independently confirms all **679** features: 617 Tempo30, 62 Begegnungszone, all `zustand=verfuegt`. Excludes the cities of Zürich and Winterthur. A legal order **does not establish whether or when implementation occurred**.
- **Dates and precision:** catalogue data date 7 October 2025, metadata edit 31 March 2026; the retrieved features all carry the raw marker `datenstand="260921"`. Its date format is undocumented in the inspected metadata, so it is retained literally, not converted into a claimed observation date. `vfg_dat` is an order date, never an implementation date. The catalogue states quarterly updates, 1:10,000 capture scale and approximately 10 m positional accuracy. Fetching now does not establish current street conditions.
- **City:** reuse the exact CC0 `view_geoserver_zonen_ist` snapshot fetched 29 September 2026 already used for routing. Individual missing implementation dates remain null. Goldbrunnen ID 65 has no geometry and is omitted, as in the routing adapter. The city catalogue notes that zone polygons serve visualisation and actual speed regimes can also be defined on individual street segments; these polygons do not establish every street's speed limit.
- **Fields:** canton `geodb_oid`, `zone_kt`, `zustand`, `bfs`, `gemeindename`, `ort_kt`, `vfg_dat`, `datenstand`; city `id`, `zonentyp_technical`, `zonenname`, `umgesetzt_datum`, `rechtskraeftig_datum`. Unsupported types, changed canton status/scope, wrong CRS, invalid rings, duplicate IDs and future city implementation dates fail preparation. Missing geometry is not fabricated.
- **Transformation and scope:** transform cantonal LV95 coordinates to WGS84 using the configured Zurich CRS. Preserve polygon holes and whole source polygons whose bounding boxes intersect the map context `[8.457, 47.338, 8.585, 47.442]`; round display coordinates to six decimals (roughly decimetre precision, not source accuracy). **347 city zones (182 T30, 165 T20)** and **42 cantonal orders (39 T30, 3 T20)** are embedded as `kind=traffic-zone` in the existing map GeoJSON. This is a bounded extract, not canton-wide routing coverage. Pedestrian T0 zones continue to inform routes but are not part of the 30/20 toggle.

[traffic-zone-validation.json](traffic-zone-validation.json) records URLs, fetch time, SHA-256 hashes, raw date marker, missing geometry, counts and context bounds. The derived map is bundled into the PWA/native assets and checksummed offline area pack. Old downloaded maps must be updated to receive the layer. Traffic volumes, route ranking and walking coverage are unchanged.

```sh
npm run data:fetch:traffic:zones       # fetch canton GeoJSON + hash/count/fetch record
npm run data:prepare:traffic:zones     # reuse exact retained city snapshot + existing derived map
npm run data:packs
```

For a complete source rebuild, `npm run data:prepare:traffic` (also invoked by `data:prepare`) now runs the zone overlay preparation after street classification. It requires both raw source snapshots. Refreshing city data still requires reviewing the city fetch/version/cutoff metadata in the traffic adapter; a hash guard prevents displaying city data different from the data used for routing. Raw downloads remain ignored by Git. Fresh checkouts use the checked-in derived data without downloading raw sources.

## Zurich municipal pavement network · expanded 6 October 2026

Source: [Fuss- und Velowegnetz, Stadt Zürich](https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz), CC0, documented WFS `tbl_routennetz`, EPSG:2056. Catalogue/source date 2022-10-19; metadata revision 2026-01-12; fetch 2026-10-06; per-feature observation dates unavailable. WFS hits and the full response both contain 40,467 unique features. Of 31,263 `FUSS=1` lines, 25,740 lie completely inside the current Zurich polygon/rectangle. `MAP_FUSS` is a printed-route category, not a pedestrian access filter; bicycle direction flags do not restrict walking.

The extract contains 1,360.33 km of combined path lines, 5,118 named crossing sections, 268,742 derived edges and 40 components. Original endpoints alone connect; gaps and 2D intersections are never joined. Boundary-crossing features are omitted whole. Integer LV95 deltas round-trip every coordinate exactly; shape-preserving subdivision uses at most 6 m pieces, with explicit WGS84 transformation. The original 115 source features remain unchanged.

Walking height is absent. A documented name/water/OSM-overlap mask withholds shade on 1,128 potentially non-ground features; it is conservative and incomplete. Named stairs (121 features) are flagged, but there is no complete step inventory. Some source names are inconsistent. Present access, closures, crossings, walking heights and signal waits still require separate evidence. [Preparation and masking rules](pavement-pilot.md).

The compact derived source is committed as `public/data/zurich-pavements.json`; raw WFS data remains ignored. [Source hash, counts and masks](pavement-source-audit.json), [historical source audit](pavement-source-audit-v1.json), [field protocol](pavement-field-validation.md). Vampire’s pinned raster remains an offline comparison on the original frozen 251 points; it is neither shipped nor used for scores. Timestamp and radiation-channel uncertainty remains in the [comparison report](pavement-tool-comparison.json).

The 8 October 2026 workflow review rechecked the official catalogue description and CC0 terms. Release 0.18.0 reuses the exact existing source/version; it does not imply a new survey. Official address anchors offer nearby municipal path choices, with explicit source-ID snapping. No building entrance or connector dataset is inferred. [Selection method and checks](pavement-pilot.md#choosing-a-route).

## Lakeshore canopy scenario · 7 October 2026

Optional derived high-vegetation envelopes use 15 public Kanton Zürich [classified LiDAR tiles](https://geolion.zh.ch/geodatensatz/4289), 2021–2022 acquisition, predominantly leaf-off; fetched/reused and hash-verified 7 October 2026. Source CRS EPSG:2056 + LN02 (EPSG:5728), metres. Free use/redistribution; retain Kanton Zürich attribution. Per-file creation dates are not observation dates. [Exact URLs, SHA-256, file sizes and LAS metadata](canopy-source-audit.json). [Processing, coverage, class selection, independent source checks and reproduction](tree-shade-pilot.md). Raw files remain ignored; only the 5.42 MB bounded derivative is shipped. It describes a potential opaque-foliage scenario, not measured summer crowns, seasonal leaf state, sunlight transmission or current tree presence.

## Elevation preference · 8 October 2026

The 0.19.0 route preference reuses the verified 2 m LN02 ground grid from the existing Zurich DTM/roof library; no new raw data or provider request is introduced. [Official DTM metadata](https://geolion.zh.ch/geodatensatz/4269.html) rechecked 8 October: observation state remains 30 April 2022, independent of fetch/metadata dates. Attribution remains Kanton Zürich. Bilinear interpolation, 10 m route sampling and a 1 m reversal filter produce approximate climbing profiles. Non-ground walking edges stay unknown; terrain shadows remain disabled. [Full elevation method, limitations and reproducible checks](elevation.md).
