# Tree-shade coverage · Zurich · 0.17.0

The user explicitly requested extending the experimental tree scenario across the supported map after the [accuracy assessment](tree-shade-assessment.md). That changes the coverage decision, not the assessment of field accuracy. The scenario remains optional, off by default, and labelled as potential shade with an opaque/full-foliage assumption. The field-validation HOLD remains in force.

## Extent and source

The target is the current **57.77 km² Zurich walking area**, including Altstetten, Höngg, Wipkingen, Oerlikon, Wiedikon, the centre and Seefeld. It is not the whole municipality, the whole canton, or other cities' maps. Address search and both supported walking networks keep their existing boundaries.

A surrounding **81 km² source rectangle**, LV95 `[2677000,1245000,2686000,1254000]`, supplies 324 contiguous 500 m tree tiles. It matches the building library's source extent and allows trees outside the walking boundary to cast into it. Finite source coverage, missing scan returns, unknown ground and uncertain walking elevations can still leave parts of a route unknown.

Source: [Kanton Zürich classified LiDAR 2021–2022, product 557](https://geolion.zh.ch/geodatensatz/4289), obtained from its official tile downloads. Rechecked on 8 October 2026: catalogue data status 30 April 2022; metadata edit 8 October 2025. Neither is a new observation of today's trees. The source permits free reuse and redistribution with attribution. Coordinates are EPSG:2056; absolute elevations are LN02 / EPSG:5728. Only non-withheld high-vegetation class 5 contributes tree geometry. Original LAZ files remain outside Git.

The completed derivative contains **24,088,762 vegetation columns** from **799,111,776 class-5 returns**. There are **921,601 unobserved 1 m cells** out of 81 million; these remain unknown. Compressed tree tiles total **123.4 MB**. The complete browser download is about **205 MB**, including the base map/route/building pack. The 18.2 GB of raw LAZ sources are ignored by Git.

The [preparation configuration](../scripts/canopy-library.json) and [source audit](canopy-library-source-audit.json) record every source URL, file hash, size, LAS creation date, derived hash and model version. Preparation validates source extents and compound CRS. The predominantly leaf-off acquisition and opaque intervals still cannot establish summer crown shape, transmission, current tree presence or seasonal foliage.

## Calculation and delivery

The original 1 m column method is unchanged: observed minimum/maximum vegetation heights, 0.5 m vertical padding, outward decimetre rounding, no horizontal gap filling. Rays now cross tile seams rather than stopping at the old lakeshore rectangle. Both source gaps and unresolved rays remain unknown. Known building shade is counted once; the tree contribution is reported separately.

Building and tree tiles are requested together until no provisional missing-tile result remains. Only then is the final route published. The app decodes the working tiles for the current calculation and releases unused tiles; it does not expand all 81 million cells into a phone's memory. Versioned manifests, strict size limits and SHA-256 protect the tile inputs. Failed or cancelled requests cannot silently publish a buildings-only result under the tree label.

The original 95% coverage requirement for shade/sun recommendations, arrival-time sampling, detour limits and walking-speed assumption remain unchanged. Extending the ray search can change estimates even where the original columns are identical: trees outside the former rectangle are now considered, and the larger library also contains higher elevations. This is not a calibration or evidence of improved accuracy.

For example, the unchanged Bellevue–Zürichhorn fastest walk at 16:00 CEST still has 826 m of potential shade (766 m from trees). The expanded ray search changes its known coverage from 88% to 54%; 725 m is now unknown. Consequently, the percentage over the known part rises from 59% to 95% **without adding a metre of shade**. This is a denominator change, not a cooler route or improved accuracy. Partial-coverage tree cards therefore show shaded distance instead of that misleading percentage, with the unknown fraction hatched in the whole-route exposure bar and labelled in metres. Its shade recommendation remains withheld. At 10:00 the new coverage is 89%, also below the recommendation threshold. The frozen 0.16.0 service comparison must not be read as a comparison of the expanded model.

The wider tests also find eligible tree-aware alternatives in Oerlikon (afternoon), Altstetten (both checked times) and Höngg (morning). These are computed choices among evaluated routes, not field-validated improvements.

The browser's **Download area** action includes all Zurich tree tiles as a separate verified supplement; the base route/map/building pack keeps its existing 80 MiB compressed / 200 MiB expanded limits. Progress and total size include the supplement. Complete verified tiles survive cancellation for a retry, while an incomplete supplement does not replace an existing saved map. Missing supplemental cache entries make the download show “Update needed”. Browsers can still evict storage. Recently viewed routes alone do not constitute a complete offline download.

Native full and lite builds bundle all Zurich tree tiles. The website, installed PWA and native shell use the same model and bilingual controls. Other cities' capabilities are unchanged. The historical lakeshore JSON remains in Git for reproducible assessments but is omitted from production/native bundles.

## Verification

- `npm run data:verify:canopy-library` verifies every derived tile's hash, dimensions, heights and unknown mask; checks all supported graph/pavement geometry against the source extent; and compares every original lakeshore cell with the expanded derivative.
- The same command exercises eight districts at two summer departure times and 0/5/10 extra minutes, checks separate contributions and distance accounting, verifies the coverage gate, and checks night, prefer-sun and unchanged buildings-only results. Three additional municipal-pavement cases include a bridge whose uncertain deck height correctly remains unknown. [Generated computational report](canopy-library-validation.json).
- Forty columns independently sampled from original LAZ returns in eight districts match the runtime data; the [pinned reference](../tests/fixtures/canopy-library-source-reference.json) supports a regression test. All 3.75 million original lakeshore cells are unchanged. These are ingestion checks, not field observations.
- Unit tests cover rays through exact seams/corners, all sun quadrants, analytic intersections, unknown cells, corrupted data, failed loads, cancellation, cache repair and partial-download recovery.
- Browser, PWA and Android results are recorded in [platform notes](platform.md). These checks are not field validation or a physical-phone test.

The pre-expansion [service comparisons](tree-shade-service-comparison.md), [detour comparison](validation/tree-shade-comparison/detour-comparison.json) and [padding sensitivity](tree-shade-assessment.md) remain historical evidence. Their reproduction scripts explicitly select the original lakeshore configuration.

## Reproduce

```sh
python3 -m venv .venv-geo
.venv-geo/bin/pip install -r scripts/requirements-validation.txt
npm run data:prepare:canopy-library -- --fetch
npm run data:verify:canopy-library
npm run check
npm run build
```

Preparation uses at most four concurrent official requests, a 200 MB source-file bound and resumable checksum-verified caches. Dense forest tiles can exceed 120 MB (two checked official files are 123 and 126 MB). Source failures are reported immediately and prevent publishing a complete manifest; rerunning reuses completed tiles. A normal checkout uses the committed derivatives and does not need to download the raw point clouds.

Next: field-check paired sun/tree-shadow points across several districts at two times, recording walking side, foliage and clouds. Assess leaf-on observations and canopy transmission before making stronger accuracy claims or enabling this scenario by default.
