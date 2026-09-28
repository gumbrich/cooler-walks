# Derived geographic data

`zurich.json` contains separate graph, building, tree and place arrays with provenance. `zurich-map.geojson` contains actual map geometry. These compact pilot extracts are intentionally tracked; large source downloads are not.

- **Graph, map and places:** © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); [copyright and attribution](https://www.openstreetmap.org/copyright). Preserve attribution and applicable database share-alike/source-access obligations when distributing derived databases.
- **Tree positions:** City of Zurich Bauminventar, [catalogue](https://data.stadt-zuerich.ch/dataset/geo_bauminventar), catalogue licence CC0. Underlying positions from Zurich's register and swissTLM3D; retain the provider attribution. Randomly distributed woodland points excluded.
- **Building geometry:** © swisstopo, swissBUILDINGS3D 3.0 beta, [product and terms](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta). Preserve © swisstopo source acknowledgement.

Data is not licensed under the source-code MIT licence. See `docs/data-sources.md` and `docs/data-manifest.json` for exact fetch resources, versions, transformations and raw input hashes.

Additional bounded pilots use the same arrays in `munich.json`, `cambridge.json` and `basel.json`, each with its own `*-map.geojson`. Zurich, Munich and Basel remain central-area subsets. Cambridge now uses its municipal boundary, with recorded-tree rather than complete canopy coverage. No building heights are shipped for Cambridge or Basel.

- **Munich buildings and automatic tree detections:** © Bayerische Vermessungsverwaltung, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [official catalogue](https://geodaten.bayern.de/opengeodata/). Preserve attribution, licence and notice of derived/simplified geometry. Trees are automatic 2024 detections; footprints are simplified LoD2 ground surfaces with relative heights, not a full 3D model.
- **Cambridge tree records and municipal boundary:** City of Cambridge GIS / Public Works, [source and PDDL 1.0 terms](https://www.cambridgema.gov/gis/gisdatadictionary/environmental/environmental_streettrees). Only active Tree-status positions in the pilot area are retained. OSM network/map/water derives from the dated Geofabrik Massachusetts extract and remains ODbL.
- **Basel trees:** Geodaten Kanton Basel-Stadt, [dataset 100052](https://data.bs.ch/explore/dataset/100052/), CC BY 4.0 with the portal's OSM conditions. The derived file is a bounded subset of the maintained-tree register. Map, graph and water remain attributed to OpenStreetMap contributors under ODbL.

All transformations, actual download URLs, source/update-date distinctions and raw SHA-256 hashes are in `docs/data-sources.md` and the city-specific `docs/*-data-manifest.json` files. Keep these notices and database obligations when redistributing.
