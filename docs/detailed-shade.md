# Zurich: 3D roofs and LiDAR ground elevations

Version 0.10 adds a bounded **3.36 km²** central Zurich model inside the existing 57.77 km² walking area. The dotted plum boundary identifies its extent. It uses actual roof and facade geometry with a terrain-derived receiver elevation; it does **not** claim tree shade or shadows from distant hills. Outside this pilot the existing flat-ground building model remains available. Other cities keep their existing capabilities and beta status.

## What changes

A maximum-height building block can overstate the shadow of a pitched roof. The new model intersects a sunward 3D ray with the actual roof and facade polygons. The ray starts at the walking sample's ground elevation, so a building uphill or downhill no longer implicitly shares the walker's ground level. Both candidate generation and final arrival-time scoring use this geometry in the pilot. The selected date/time, route-local zone, ≤8 m samples, 80 m/min walking speed and 0/5/10-minute detour limits remain shared.

This remains a ground-surface direct-sun estimate, not exposure over a person's entire body or a thermal-comfort measurement. Historical buildings, street centrelines and a 2 m ground grid limit accuracy. The percentage of the route inside the 3D pilot is displayed separately from the percentage with a known sun/shade result. These are different denominators. Shade recommendations require at least 95% classified daylight coverage on both routes and a difference of no more than five percentage points in their 3D-model shares, so an alternative cannot win mainly by leaving the more detailed model.

## Sources and coordinate checks

- **Roof and facade surfaces:** the existing six checked [swissBUILDINGS3D 3.0 beta](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta) CityGML tiles, with **2019** source geometry. © swisstopo. Horizontal LV95 (EPSG:2056), vertical LN02 (EPSG:5728). Each archive checksum is verified against the retained official STAC metadata.
- **Receiver heights:** Canton Zurich [DTM 2021–2022, product 555](https://geolion.zh.ch/geodatensatz/4269.html), current source date **30 April 2022**, fetched **30 September 2026**. The product sheet permits free use and redistribution (OGD) and specifies CH1903+ / LV95. The source [LiDAR technical report](https://geolion.zh.ch/geodatensatz/4289/pdf) documents LN02 output. The delivered TIFFs lack an EPSG tag; the adapter explicitly assigns the documented LV95 CRS only after checking their 500 m tile names, worldfile bounds and 0.25 m resolution. Attribution: Kanton Zürich, Amt für Raumentwicklung / Geoinformation.
- **Vegetation and building rasters investigated:** products 559 and 558, normalized 2021–2022 vegetation/building heights. They are retained only in ignored raw exports. Neither becomes an opaque shadow column in the app. The survey was predominantly leaf-off; vegetation heights do not establish crown base, crown transmissivity, leaf-on coverage or the continued presence of every tree.

Two public export requests cover LV95 `[2682000,1246000,2684000,1248000]` and `[2682000,1248000,2684000,1248500]`. The exporter supplies whole surrounding 500 m tiles. Derived ground data is clipped to the combined **5 km²** rectangle. Receiver coverage is inset to `[2682200,1246200,2683800,1248300]`; additional ray-bound checks still apply. Exact source checksums, counts, missing cells and rejected geometry are in [the ingestion audit](detailed-shade-data.json).

The public [documented Canton export API](https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/planen-bauen/geoinformation/geodaten/geodatenshop/rest_schnittstelle_ogd_interface.pdf) accepts unauthenticated bounded requests. The script uses an empty notification email. No account, message, paid service or production API dependency is introduced. Raw exports are hundreds of megabytes and are never committed.

## Geometry and missing data

The adapter accepts the same supported opaque building types as the previous model. It projects each planar roof/facade into its dominant plane and uses constrained triangulation, retaining concave boundaries and courtyard holes. Faces more than 5 cm out of plane or invalid polygons reject that building into the existing unknown-obstruction path. Buildings missing roofs or facades also remain uncertain. Glass, open structures and construction are not silently treated as solid walls.

Triangles keep centimetre-scale source coordinates in local Float32 XYZ. Ground cells are area-averaged from 25 cm to 2 m, then rounded to decimetres. Missing source cells are retained, including partially missing output cells; they are not filled with zeros. Heights use the same LN02 datum, rather than mixing ellipsoidal heights with metres above sea level.

At each sample's arrival time, two-sided ray/triangle intersection uses the projected solar direction. A spatial index limits triangle tests. A supported hit establishes building shade. Without a hit, a ray must rise above the model's highest roof before leaving the source rectangle to establish modelled direct sun. Existing uncertain-object masks and municipal coverage checks still apply. This is a bounded building model, not proof of an unobstructed distant horizon.

OSM `bridge`, `tunnel`, `covered`, nonzero `layer` or `level` tags prevent bare-earth ground from being used as a deck/floor height inside the detailed area. Those samples remain unknown. Outside the detailed pilot, the previous flat model's limitations still apply. Unknowns never improve a recommendation. Night and low solar altitude remain separate states.

The geometry stays in the routing worker. The same versioned payload is included in checksum-verified offline packs and shared by browser/PWA, Android and iOS. No live geodata call is needed while planning.

## Reproduce

A fresh checkout includes the small derived model and can run with the normal `npm ci` / `npm run dev` instructions. Raw-source reproduction additionally needs the existing building archives and STAC records described in [Zurich preparation](zurich-north-west.md):

```sh
python3 -m venv .venv-geo
.venv-geo/bin/pip install -r scripts/requirements-shade.txt
.venv-geo/bin/python scripts/fetch-zurich-shade.py
npm run data:prepare:shade
npm run data:packs
.venv-geo/bin/python scripts/test-detailed-shade.py
npm run data:verify
```

The fetch script reuses existing completed orders and downloads. It does not submit a fresh request simply because an export is still processing. Source archives, order responses and temporary processing files live in ignored `data/raw/zurich-shadow/`.

## Validation and next step

Independent analytical cases check pitched roofs versus maximum-height blocks, different receiver elevations, solar direction and elevation, reverse face winding, courtyard openings, missing ground and model-edge reach. Python checks conserve the area and plane of a concave sloping roof with a hole, support vertical facades, and reject malformed/nonplanar input. [The real-route comparison](detailed-shade-validation.json) compares identical walking geometry against the previous model at several times. A computed change is not a measured accuracy gain.

Next: collect a small set of timestamped Zurich shadow observations and assess roof/ground age mismatches before extending this model citywide. For vegetation, use classified returns and local species/leaf-season evidence to support crown base and light transmission; report potential canopy shade separately until validated. For hill shadows, obtain a wider terrain horizon rather than interpreting the edge of this small extract as open sky. Bridge deck heights and pavement-side geometry also need their own verified data.
