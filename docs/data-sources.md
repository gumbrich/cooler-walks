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

## City of Zurich: tree positions

- [Bauminventar catalogue](https://data.stadt-zuerich.ch/dataset/geo_bauminventar), [CKAN metadata](https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_bauminventar). Catalogue licence: CC0. Credit City of Zurich / Grün Stadt Zürich and underlying swissTLM3D contributions.
- Actual WFS: `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Bauminventar`; layer `bauminventar`, WFS 1.1.0, output GeoJSON, `srsName=EPSG:4326`. Query box `[8.523,47.358,8.558,47.390]`. The geographic response bounds and coordinates were inspected.
- Fields inspected: `baumnummer`, `baumart_deu`, `baumart_lat`, `datenstand`, `genauigkeit`, `hoehe`, `pflanzjahr`, `status`, `uuid_tlm3d`, `x`, `y`.
- Source dates: inventory documentation says register and swissTLM3D tree positions 2021, LiDAR heights 2018; preparation records include `202212151503`. Catalogue metadata was edited in 2026, which is **not** a new observation date.
- Source XY values use LV95; the queried output is WGS84. Runtime retains positions and provenance, not unused personal/contact attributes.
- `TLM3D_GF` woodland points are randomly distributed model positions and are excluded. Register and individual-tree locations support a proximity indicator only. Source crown widths are inferred, not measured, and some source heights use defaults. Therefore no tree-shade capability is enabled.

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
npm run data:prepare
npm run data:verify
```

Building URLs are versioned. OSM and tree endpoints are live snapshots, so a later download may differ; exact historical reprocessing requires the raw inputs matching the stored SHA-256 hashes. The transformation is deterministic for those inputs, not a promise that a changing upstream source will reproduce identical bytes forever.

For any refresh: inspect source schemas/dates/licences, update the fetch date and data version in the adapter/configuration, preserve new raw hashes, rerun route/model/browser tests, and review source changes before committing derived data. Do not change coverage just because a larger download succeeded. City configuration, data manifest and runtime versions must stay aligned.

## International research

Paris's actual two-record API sample was inspected locally and its source fields are summarized in `cities.md`. IGN BD TOPO is a documented height source, but no Paris building sample, local route or shade calculation has been validated yet. Vienna was compared using its official WFS and OGD documentation. Neither is presented as launched.
