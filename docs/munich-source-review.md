# Munich source follow-up · 11 October 2026

The 0.24.0 expansion uses a dated regional OpenStreetMap extract and a coherent October LoD2 publication. It expands working coverage, not the field-validation claim. The following independent source checks explain which remaining features can and cannot be enabled.

## Tree shade: real sample inspected, still not enabled

A **1 km²** sample at UTM32 `[692000,5337000,693000,5338000]` contains **24,485,737 laser returns**. The official SHA-256 matches. LAS adjusted GPS times place the observations on **27 February 2022**, while the file was created on 16 June 2022. The colour-infrared WMS metadata identifies imagery from **24 August 2024**, flight `124028/0`.

Bavaria's [classification table](https://www.ldbv.bayern.de/mam/ldbv/dateien/laserdaten_punktklassenbeschreibung.pdf) groups vegetation and other objects in class 20. In the sample, 9,930,032 class-20 returns are more than 2 m above DGM1; 1,486,384 of them do not pass a simple vegetation-colour screen in the rendered infrared image. This **does not measure classification error**: shadows, display colour processing, growth/removal, differing epochs and low vegetation can all affect agreement. It demonstrates why class 20 must not simply become opaque tree shade.

The infrared image was visually inspected: crowns, lawns, roofs and shadowed surfaces are distinguishable, but a rendered WMS colour threshold is not a validated crown classifier or calibrated NDVI. Nor does a canopy top alone establish foliage depth or gaps beneath branches. The winter laser and summer image need explicit change and season checks.

Next: obtain corresponding raw CIR/DOM tiles, compare source epochs, reject buildings/wires/vehicles, label a stratified sample of street trees, courtyards and park edges, and audit the resulting vertical columns and route effects. Keep changed or unsupported columns unknown. Only after that should the shared canopy engine be enabled for Munich. [Machine-readable source evidence](munich-canopy-feasibility.json).

Sources: [Bavaria imagery information](https://www.geodaten.bayern.de/odd/m/3/html/datenhinweise/datenhinweise_dop.html), [official WMS capabilities](https://geoservices.bayern.de/od/wms/dop/v1/dop20?service=WMS&request=GetCapabilities), [laser downloads](https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=laserdaten). © Bayerische Vermessungsverwaltung, CC BY 4.0. Research files remain outside Git and are not runtime dependencies.

## Vehicle counts: licensed service found, no local counters

The official [BAYSIS WFS](https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/index.html) provides the **2021** road census under **CC BY 4.0**. A bounded request over the full 64 km² model rectangle returned four counters: two motorway counters (A8/A9) and two on St 2088. **None lies inside the 40.5 km² walking boundary.** The exposed value is annual mean daily vehicle volume, not an hourly profile or live observation. [Returned coordinates, values, query and hash](munich-traffic-feasibility.json).

These counters cannot be projected onto nearby city streets. Munich's municipal DAVe data still needs an explicitly reusable export/API with relevant locations, directions, intervals and observation dates. Its open-source application licence does not license the measurement database. The app therefore retains honest OSM street context and municipal zone corroboration.

Attribution for the reviewed service: Datenquelle: Bayerische Straßenbauverwaltung - BAYSIS (https://www.baysis.bayern.de).

## Addresses and pavement geometry

The municipal public address CSV has no coordinates. [Bavaria's house-coordinate product](https://www.ldbv.bayern.de/produkte/liegenschaftsinformationen/hauskoordinaten.html) is paid (published price checked: €0.15 per object, €100 minimum); no purchase was made. Product licence, redistribution and deployment terms require review before use. OSM point addresses and building label positions remain a partial, offline alternative, not verified entrances.

The expanded dated OSM network preserves separately mapped sidewalks and crossings. Each graph edge is checked against consecutive original OSM node IDs, pedestrian tags and the supported boundary. Intersections do not create joins unless the source connects them. Street centrelines remain where no usable separate sidewalk exists. This expands pavement coverage but does not finish a complete side-of-street service.

## Reproduce research

After the ordinary Munich DGM1 preparation, install `scripts/requirements-validation-review.txt` in the geospatial environment, then run:

```sh
.venv-geo/bin/python scripts/fetch-munich-research.py
.venv-geo/bin/python scripts/audit-munich-canopy-feasibility.py
.venv-geo/bin/python scripts/audit-munich-traffic-feasibility.py
npm run data:audit:munich:network
```

The canopy audit pins the reviewed image and laser hashes; a changed source stops the audit and needs a new review. Neither its colour screen nor the network audit establishes field accuracy.
