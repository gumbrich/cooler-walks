# Tree-position audit

Audit date: 28 September 2026. Machine-readable results and exact input hashes: [tree-audit.json](tree-audit.json). This is a source-consistency and freshness check, not a ground-truth survey.

## What was checked

- All **18,886** runtime tree markers match their source GeoJSON coordinates exactly. No marker was added, moved or randomly scattered by the app.
- Transforming their WGS84 positions back into LV95 and comparing with source XY attributes gave a median difference of **0.037 m**, a 95th percentile of **0.059 m**, and a maximum of **0.074 m**. This checks coordinate conversion/rounding; it does not establish centimetre-level real-world accuracy.
- **549** `TLM3D_GF` woodland positions were excluded because they are distributed model points rather than individual surveyed trees.
- The marker's drawn circle has a fixed visual size. It is not a measured tree crown.

The retained inventory has mixed positional quality:

| Source category                                  | Trees |
| ------------------------------------------------ | ----: |
| Surveyed (`Eingemessen`, including replacements) | 6,907 |
| Entered on screen (`Bildschirmeingabe`)          | 3,526 |
| Digitized / ELTA2                                |   146 |
| Aerial-derived TLM individual trees              | 8,218 |
| Unknown quality                                  |    89 |

The [city's tree-register documentation](https://data.stadt-zuerich.ch/dataset/geo_baumkataster) describes trunk-centre accuracy from under 1 cm to 30 cm for tachymetrically surveyed trees, and typically 0.5–2 m for private trees and park trees. Those figures are category descriptions, not verified error bounds for every marker in our mixed inventory. The [combined inventory](https://data.stadt-zuerich.ch/dataset/geo_bauminventar) also contains aerial-derived locations and explicitly cautions about accuracy.

## Comparison with the maintained register

A fresh bounded WFS query returned **4,662** records from `baumkataster_baumstandorte`. Within the pilot, **4,613** older inventory points have `BK_` IDs. Matching their tree numbers against the register found:

- **4,308** matched IDs. Median and 95th-percentile coordinate differences are zero at the source's stored precision.
- **15** matched positions differ by more than 1 m; the largest difference is **3.56 m**. The ten largest are listed in the audit report for follow-up.
- **305** older IDs have no match in this bounded current sample. This does not prove removal: identity changes, category changes, bounds and replacement records need investigation.
- **354** current register IDs have no counterpart among those matched older inventory points. Do not simply append them without checking duplicates and replacements.

The register catalogue reports an update of 30 August 2026 and a weekly update interval; these are not each tree's survey date. The pilot inventory uses positions from 2021, prepared in 2022. Runtime positions were left unchanged by this audit so a partial comparison does not silently create an inconsistent new dataset. Next: reconcile unmatched IDs, replacements and the 15 moved positions, inspect a stratified sample against dated orthophotos, then field-check a small route sample and publish a separately versioned refresh.

## Trees versus building shade

Current shade percentages come from **buildings only**: footprint, actual height and the sun's position. Tree positions contribute to a separate proximity metric. Modelling tree shade would additionally require credible crown shape/size, height and foliage/transmission assumptions. Seasonal leaf cover matters for deciduous trees; a building does not lose its roof in winter, though its shadow changes with solar position. The city's crown widths are incomplete/estimated, and its register uses an 8 m default where a width is missing. They are not adequate evidence for precise tree-shadow percentages without further validation.

## Reproduce

After the ordinary data preparation inputs are present:

```sh
bash scripts/fetch-tree-audit.sh
npm run data:audit-trees
```

The register endpoint is live, so future results may change. Preserve raw hashes and fetch dates; keep raw files outside Git. Source CRS is WGS84 in the queried GeoJSON, transformed into LV95 for distance comparisons. The register catalogue uses CC0; retain City of Zurich / Grün Stadt Zürich attribution.
