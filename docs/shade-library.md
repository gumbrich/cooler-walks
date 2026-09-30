# Zurich 3D model library · 0.13.0

The detailed building/ground model now covers **all 57.77 km² of the supported Zurich walking area**, about **17.2 times** the original 3.36 km² pilot. Oerlikon, Altstetten, Höngg, the university area, Wiedikon and Seefeld use the same roof/facade ray intersections as the centre. This is **not the entire municipality or canton**: routing retains its existing, visible boundary. No new walking network or tree-shade capability is implied.

The user requested this experimental expansion after the earlier validation hold. The hold on **field-accuracy claims** remains. The 26 historical roof-height discrepancies, exploratory photo mismatch and lack of accepted field observations are preserved in [shadow-validation.md](shadow-validation.md). Neither a larger library nor passing computational checks resolves them.

## Sources and extent

The same six checksum-verified swisstopo **2019** CityGML archives supply actual roofs and facades in LV95 / LN02. The source rectangle `[2677000,1245000,2685624,1254000]` is 77.616 km², including surroundings that can cast shadows into the walking area. Its coverage is checked against the union of the official STAC tile polygons, allowing only their centimetre-scale WGS84 rounding. Five malformed/nonplanar buildings remain excluded and feed the existing unknown-obstruction masks.

The library contains **41,042 supported buildings**, **4,347,681 source triangles**, and **81 tiles** of up to 1 km × 1 km. Triangles crossing a seam are copied to both tiles without simplifying or clipping their shape. There are 4,375,006 stored triangles including these copies. Seams do not act as shadow boundaries. The [ingestion report](shade-library-data.json) retains source URLs, hashes, counts and exclusions.

Ground elevations still represent the **2021–2022** Canton Zurich LiDAR survey, with a **2 m receiver grid** and **0.1 m storage quantization**. The official [product 555 metadata](https://geolion.zh.ch/geodatensatz/4269.html) links both the native 25 cm tile directory and the [WCS service](https://geolion.zh.ch/geodatenservice/1379). WCS `dtm` explicitly identifies **DTM 2022**; the fetch script refuses an unexpected epoch. Native tiles already downloaded are area-averaged. The remaining bounded WCS requests use EPSG:2056, 2 m output and the documented bilinear option. The service advertises a 0.5 m source grid, so equivalence to native 25 cm block means is **tested, not assumed**. Both inputs use the product's documented LN02 datum.

Ten fixed, geographically spread native-tile comparisons cover **625,000 cells**. WCS and independently averaged native values have identical valid/missing masks and a maximum difference below **0.00007 m**, within the predeclared 0.001 m processing tolerance. This verifies this delivery's resampling fidelity, not survey accuracy or future service versions. [Terrain audit](shade-library-ground-audit.json). All 19,404,000 derived grid cells currently have source data; the runtime still preserves missing values and never fills holes with zero.

Attribution remains **© swisstopo** and **Kanton Zürich, Amt für Raumentwicklung / Geoinformation**. Product 555 permits free use and redistribution. Provider acquisition dates remain separate from download dates. No building or terrain source service is contacted during route planning.

## Loading, offline use and privacy

Online planning loads a small manifest and only the compressed tiles needed by candidate routes and their possible shadow casters. Each tile has a content-hashed filename, byte limits and SHA-256 verification. Provisional calculations with unloaded tiles are discarded. Calculation repeats after loading until every requested tile is available; failed downloads show an error and a retry action that preserves addresses. Changing trips or cities suppresses stale responses. Decoded tiles unused by the latest trip are released. Serial tile decoding reduces temporary memory use on phones. When every graph node lies inside the 3D domain, the worker omits the redundant flat-building index while retaining uncertainty masks and the height ceiling. Twelve trip/time comparisons against the complete index verify identical results. Native startup calculates the first route before indexing the basemap to avoid overlapping the two large memory allocations; later edits retain the map.

The 81 derived files total **63.55 MB**. An initial central reference trip uses nine tiles, **18.65 MB**, rather than the entire library. The six-district route check records each working set and local calculation times in [shade-library-routes.json](shade-library-routes.json); these are not phone benchmarks.

The complete Zurich offline pack is **80.2 MB compressed / 184.9 MB expanded**, within the existing 80 MiB / 200 MiB package limits. It embeds compressed, verified tiles and decodes them only when used. An ordinary website visit caches only visited/requested tiles; **download the Zurich area for complete offline planning**. The native bundled build includes the full library. Old saved packs require an update. Browser storage can be evicted.

Tile requests go to the website host and can reveal roughly which 1 km areas are being planned. Exact endpoints and route geometry are not sent. English/German privacy notices disclose this. Bundled or downloaded offline data avoids these planning-time requests.

## Checks and limitations

- **472 independent source-polygon comparisons** across the centre, Oerlikon, Altstetten, Höngg, university area and Seefeld agree with the tiled runtime. No cases needed the predefined 2 cm face-edge exclusion. The reference uses original CityGML planes and polygons, not the production triangulator or tile traversal. [Geometry audit](shade-library-geometry-audit.json), [frozen regression cases](../tests/fixtures/shade-library-reference.json).
- Twelve real trip/time cases have 100% geographic 3D-model coverage. Shade/sun/unknown/night distances conserve total distance, detour limits hold, zero-extra-time never adds an alternative, and night remains distinct from shade. Geographic model coverage does **not** mean 100% classified sunlight: bridges, uncertain objects and unresolved edge shadows can still prevent a shade recommendation.
- Analytical checks cover incoming shadows across seams, parallel/diagonal boundary rays, missing ground, outside-domain rays, absent/corrupt downloads and metadata gaps/overlaps. The original 576 solar and 1,926 stable central-pilot source references remain in the suite.

Buildings are historical; street geometry may follow centrelines. Bridge/tunnel/covered/elevated ways cannot use bare-earth heights as deck levels. Terrain is a receiver elevation only: **tree shade, distant hill shadows and clouds remain excluded**. Low sun below 10° stays unknown. The library's boundary and conservative roof ceiling prevent missing surroundings from becoming inferred sunshine. Recommendations retain the same coverage and detour rules.

Next: field-check paired journeys in several districts, resolve dated roof disagreements, then evaluate newer geometry and verified bridge deck heights. Further routing expansion requires its own walking-network and source coverage work.

## Reproduce

A normal checkout contains the derived library; `npm ci` and `npm run dev` need no source downloads. Raw reproduction needs the six historical building archives/STAC records described in [zurich-north-west.md](zurich-north-west.md):

```sh
python3 -m venv .venv-geo
.venv-geo/bin/pip install -r scripts/requirements-validation.txt
npm run data:fetch:shade
npm run data:prepare:shade
npm run data:packs
npm run data:verify:shade-library
.venv-geo/bin/python scripts/audit-shade-library-ground.py
.venv-geo/bin/python scripts/audit-shade-library-geometry.py
npm run check
```

The preparer supports `--geometry-only` and `--reuse-geometry` for local iteration; reuse verifies the triangulator and source archive hashes. Source files and scratch geometry stay in ignored `data/raw/zurich-shade-library/`. The old `prepare-detailed-shade.py` and original central JSON remain solely to reproduce the frozen historical audit; the production build excludes that redundant JSON. WCS and native-source fetch metadata are retained locally; the public report records every terrain input's hash and URL. New source or model versions require fresh audit fixtures and offline packs.
