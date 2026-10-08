# Tree shade: usefulness and expansion decision

**Subsequent coverage decision:** the user explicitly requested extending the experimental pilot across the supported Zurich map. The [0.17.0 expansion](tree-shade-expansion.md) implements that request without upgrading this accuracy assessment or lifting the field-validation HOLD. The decision below records the earlier conditional-expansion assessment.

Assessed **8 October 2026**, application 0.16.0 / canopy `zurich-lakeshore-canopy-2026-10-07-v1`, from source revision `151fafb`.

**Decision: useful as an experimental scenario and validation tool; not sufficiently validated for dependable tree-shade recommendations. Do not expand the current implementation across Zurich yet.** The user's authorization to expand was conditional on a positive usefulness/accuracy assessment. That condition is not met. This is an evidence-based product decision, not a lack of permission or a claim that tree shade cannot be modelled.

## What is useful already

The pilot introduces a real mechanism missing from a buildings-only model: a sun ray can intersect measured vegetation above a walking point. It changes with the sun, separates tree contributions from building shade, preserves unknowns and supports reproducible field checks. Geometry/ray tests and original-return checks provide meaningful confidence in ingestion and calculation. They do **not** validate actual seasonal crown shape or optical transmission.

Treat the current output as conditional: **what this particular opaque vegetation envelope would shade**, rather than what today's trees will actually shade. The derived model is a reasonable research prototype, but not yet a calibrated representation of a summer crown.

## Why it is not ready for expansion

1. **The canopy assumptions are unvalidated.** The [cantonal technical report, p. 12](https://geolion.zh.ch/geodatensatz/4289/pdf) explains that acquisition was postponed because there were still too many leaves, with flights primarily in winter/spring 2021–2022. Our use of minimum/maximum high-vegetation returns in each 1 m cell cannot recover unobserved summer foliage. Filling the observed vertical interval as opaque can also hide real gaps. These opposing effects make the result neither a justified upper nor lower bound on actual shade. The source's centimetre-scale survey accuracy is not a shade-accuracy guarantee.
2. **A modelling choice materially changes the output.** The new sensitivity check below changes only vertical envelope padding; the predicted shade varies by 8.6 percentage points on an identical known portion of the path. Opacity, horizontal crown omissions, source age, ground-level receiver choice and pavement placement are additional unquantified uncertainties. This is sensitivity, not proof of an 8.6-point field error.
3. **Useful route choice is not demonstrated on the checked journey.** Bellevue–Zürichhorn at 16:00 has only 87.7% native model coverage, below the 95% comparison rule. All 0/5/10-minute settings therefore show the same fastest fallback. Morning coverage reaches 95.5%, but no qualifying better alternative is returned. The checked municipal-pavement case has only 70% coverage. These limited cases do not prove that useful tree alternatives never exist; they do show that our headline comparison has not demonstrated that benefit.
4. **Other services have not validated it.** On the same 86.7% known path, adding trees changes agreement with the published Vampire raster from 56.0% to 58.6%. The total shade estimates are closer, but substantial location disagreements remain. Vampire's clock and deployed raster identity are unresolved; neither service is ground truth. Similarly, 97.7% of our fallback route lying within 20 m of Vampire's route establishes corridor similarity, not shade accuracy.
5. **There is no accepted tree-shadow field validation.** No matched observations establish the false-shade rate, shadow-boundary error, route sun-exposure error, or reliable ordering of alternative routes. Engineering tests cannot supply those measurements. The existing [field-validation HOLD](shadow-validation.md) remains.

The city independently notes numerous small gaps in the same 2022 LiDAR and interpolates gaps below 2 m² for its [canopy-height product](https://data.stadt-zuerich.ch/dataset/geo_baumhoehen_2022__chm_aus_lidar_). That product is derived from the same source and is not an independent shade reference. Replacing our canopy with that height surface would not itself resolve foliage, under-crown geometry or transmission.

## New sensitivity check

Reused the original **457 fixed samples** along Bellevue–Zürichhorn, at the 1 August 2024, 16:00 CEST departure snapshot. Only the symmetric vertical padding around the observed LiDAR envelope changes in private in-memory copies. The production setting is 0.5 m above and below the observed returns. Horizontal cells, unknown mask, solar method, buildings, source data, opacity and outward decimetre rounding are unchanged.

| Vertical padding above/below observed returns | Shade on each variant's known path | Known route coverage | Shade on the same portion known in all variants |
| --------------------------------------------- | ---------------------------------: | -------------------: | ----------------------------------------------: |
| 0 m                                           |                              53.3% |                85.6% |                                       **53.7%** |
| 0.5 m (production)                            |                              58.9% |                86.7% |                                       **58.5%** |
| 1 m                                           |                              63.1% |                86.8% |                                       **62.3%** |

The final column has one common denominator: **1,354.5 m, or 85.0% of the walk**. Its 8.6-percentage-point spread avoids confusing changed coverage with changed shade. Compared with production, 90 m of classifications change with zero padding and 66 m with 1 m padding. None of these variants is selected as more accurate; no parameter was tuned to Vampire.

The retained alternate solar-time interpretation has a 5.5-point spread on its own common 77.6% known portion. Neither timing interpretation is asserted correct. These are snapshot sensitivities, separate from the app's arrival-time result. [Exact figures, input hashes and protocol](canopy-sensitivity-assessment.json).

TypeScript compilation and all six focused canopy tests pass, including the original-return regression and independent analytic ray intersection checks. The sensitivity script asserts that the unmodified 0.5 m result exactly preserves every frozen classification at both times, that trees do not overwrite building shade/unknowns and that all metres remain accounted for. No production asset, app parameter, route or coverage boundary changed.

```sh
node --import tsx scripts/assess-canopy-sensitivity.ts
npx tsc -b
npx vitest run tests/canopy.test.ts
```

## What would justify expansion

- Validate the present pilot on accurately located paths under several tree conditions and times, recording direct sun, dappled/partial shade, leaf state and clouds. Include open controls and measured shadow boundaries. A photograph without a defensible location/time cannot establish agreement. Autumn observations need matched autumn predictions; they do not by themselves validate August foliage.
- Evaluate a canopy/foliage representation against those observations. A verified leaf-on source would help; alternatively, demonstrate that a calibrated model using available data performs acceptably. Do not assign arbitrary seasonal opacity percentages. Separate calibration observations from the locations/dates used for final evaluation.
- Define the release tolerances before evaluating the held-out observations: false claims of shade, boundary/route exposure error, coverage and route-ordering stability. A proposed alternative should reduce observed direct-sun exposure beyond the evaluation uncertainty while respecting the walking-time budget. Agreement with another unvalidated service is not an acceptance threshold.
- Demonstrate useful route alternatives with sufficient complete-route coverage and check their robustness to credible geometry/foliage assumptions. Retain the present coverage rule; lowering it to manufacture more recommendations is not validation.
- Then expand with a tiled canopy format, a source buffer for incoming shadows, and measured phone memory/download budgets. Wider geometry could reduce boundary-related unknowns, but it would not resolve foliage or opacity. [Cantonal source availability](https://geolion.zh.ch/geodatensatz/4289) makes broader ingestion plausible; accuracy evidence is the current blocker.

Keep the existing lakeshore toggle off by default and explicitly experimental. Expanding the same assumptions would multiply coverage before we know whether it reliably improves a walk. Field validation remains the next model-accuracy milestone agreed with the user.
