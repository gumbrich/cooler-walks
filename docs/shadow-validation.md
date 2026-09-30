# Shadow validation gate

The initial audit requested on 30 September 2026 is retained below. The user has since authorized traffic-model development and deferred field validation of shadow and traffic. This does not clear the shadow-validation gate or authorize claims of field accuracy; shadow coverage expansion remains on hold.

**Latest review:** [original LiDAR and timestamped photographs](shadow-validation-followup.md). All 26 roof flags have been inspected against raw returns; 14 photographic originals have been screened. Two exploratory photo points include one unresolved disagreement. No field observations yet meet the acceptance requirements, so the gate remains **HOLD**. The audit below is the earlier computational baseline, retained unchanged with its source hashes.

## Protocol, defined before running the audit

1. **Solar reference:** compare the production SunCalc output with pvlib 0.16.1's independent NREL SPA implementation, using geometric elevation (no atmospheric refraction). Cover both hemispheres, equinoxes/solstices, UTC instants, night and high latitudes. The engineering tolerance is 0.25° of angular separation between solar direction vectors; azimuth alone is unstable near zenith. This tolerance is not a statement of field accuracy.
2. **Source geometry:** compare production mesh intersections at real Zurich route samples with direct plane/polygon intersections against the original CityGML faces. The reference must not import the production triangulator, ray/triangle routine or spatial index. Require agreement for every tested point outside a 2 cm face-edge tolerance; list all disagreements and excluded boundary cases. Retain the model's unknown result when a ray cannot be resolved inside source coverage. This checks implementation and ingestion, not whether historical buildings still exist.
3. **Ground processing:** independently average the original 25 cm terrain pixels into aligned 2 m blocks using NumPy, rather than the production resampler. Require the stored ground value to agree within 0.051 m (decimetre rounding plus floating-point tolerance), with missing pixels preserved. Separately report native-point versus 2 m-grid differences along the sampled routes.
4. **Historical source consistency:** compare 2019 roof surfaces with the independent 2021–2022 LiDAR building-height raster where both provide an interior roof sample. Report the difference distribution and flag discrepancies exceeding 2 m for investigation. Do not interpret an unexplained discrepancy as a measured error in either source or silently correct the production model.
5. **Dated observations:** check actual building-shadow classifications and boundaries at independently located points with verified date, time/time zone and visible direct sun. Include multiple places and morning/noon/afternoon, open sun and building shade, roof shapes and slopes. Exclude cloud-ambiguous, tree-obscured and unlocatable observations before looking at predictions. Document all exclusions. Withhold a field-validation claim if sufficient observations are unavailable.

Expansion stays on hold until computational defects/source discrepancies are resolved and the dated-observation results have been reviewed. Model and validation data must retain separate versions. Corrections found by validation require the affected checks to pass before deployment; unrelated features are outside this task.

## Observation-source investigation

- [SWISSIMAGE mosaic documentation](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm): a tile can combine different acquisitions; its year alone does not establish the timestamp of a shadow. The provider does not supply a detailed source-image seamline overview. It is unsuitable as exact-time ground truth without additional metadata.
- [SWISSIMAGE RS](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-rs): individual orthorectified strips encode capture date/time in UTC. This is a promising independent observation source. The provider requires a data request and quotes preparation costs; no self-service download is offered. No request, email or purchase has been made.
- [NREL SPA](https://midcdmz.nlr.gov/spa/) and [pvlib reference API](https://pvlib-python.readthedocs.io/en/v0.16.1/reference/generated/pvlib.solarposition.spa_python.html) provide the independent computational reference. The validation uses the BSD-licensed pvlib implementation, not redistributed NREL C code.

## Result: HOLD — validation is incomplete

The initial computational audit of application revision `be43222` / model `roof-mesh-ground-arrival-v7` has completed. **Do not expand coverage or add shadow capabilities yet.** Computational checks pass. Source/observation follow-up is recorded separately above; the table below describes the initial audit.

| Check                                          | Result                                                                                    | What this establishes                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent NREL SPA solar reference           | 576 cases passed; maximum vector difference 0.219°, median 0.128°                         | Sun direction meets the predefined 0.25° engineering tolerance for these 2026 cases.                                                                                                   |
| Original CityGML polygons versus runtime mesh  | All 1,926 stable samples agree; two face-edge samples excluded                            | Ingestion and intersection agree at the sampled points. The 1,928 queries span three origin/destination pairs, five departure instants and both computed routes (30 route/time cases). |
| Ground-grid reconstruction                     | All 1,250,000 valid cells passed; maximum difference 0.05004 m; missing masks agree       | The 2 m ground grid reproduces the independent source-pixel averages within quantization tolerance.                                                                                    |
| 2 m grid versus native terrain at route points | 95th percentile absolute difference 0.111 m; maximum 0.748 m                              | Resolution has a measurable effect; this is not survey error or an independent field measurement. Repeated route positions are included.                                               |
| CityGML versus LiDAR roof heights              | 588 usable grid points; **26 differences above 2 m across 21 buildings**, maximum 17.85 m | Source consistency is **not cleared**. Different dates, roof details, overhangs and classification may contribute; neither source has been declared correct at flagged points.         |
| Dated real-world shadows                       | **0 observations**                                                                        | Field accuracy remains unvalidated.                                                                                                                                                    |

The roof-height comparison excludes points within 1 m of the **uppermost** source roof face's boundary. It never substitutes an underlying roof when the upper surface fails that filter. Sixteen otherwise eligible roof points lacked a usable positive LiDAR building height and were excluded explicitly. Across the 588 retained points the signed median difference is +0.020 m and the 95th percentile absolute difference is 1.715 m; the good median does not clear the 26 flagged cases.

The largest discrepancies cluster on source building `ID_2B72335B-84F1-4A56-B970-BE46D7EE410D` near the main station; the largest sampled difference is at LV95 `[2683210,1247990]`. Source geometry at that point is about 416.46 m LN02 versus 434.31 m from DTM + LiDAR building height. These are source values, not a surveyed error. Raw metadata retains 2019 observation fields separately from 2022 record-edit timestamps; an edit timestamp does not establish newer observations. All flagged coordinates and source IDs are retained in the [machine-readable audit](shadow-validation-audit.json).

Additional source review confirms that [Canton product 558](https://geolion.zh.ch/geodatensatz/4290) is a 25 cm DOM-minus-DTM height raster, rather than a per-building height attribute. The downloaded DTM and building rasters use aligned 2,000 × 2,000 pixel tiles with the same 500 m LV95 bounds. A small official [SWISSIMAGE WMS](https://docs.geo.admin.ch/visualize-data/wms.html) crop around the main station was inspected for roof context only. It does not supply a verified capture time and has not been counted as shadow ground truth. Resolving these differences still requires the original LiDAR returns and/or suitable dated observations; an aerial image alone does not select the correct source height.

The production application and geographic coverage have not changed during this audit. The existing experimental labels remain appropriate. The new regression references check the same published model in the regular test suite; they do not certify field accuracy. The full TypeScript/model suite passes 81 tests, and four analytical checks validate the independent comparator, including a courtyard hole and overlapping roofs.

## Reproduce

A fresh checkout can run the committed independent-reference regressions with `npm ci && npm run check`. Full source reproduction also requires the ignored original building and raster archives described in [data preparation](detailed-shade.md):

```sh
.venv-geo/bin/pip install -r scripts/requirements-validation.txt
node --import tsx scripts/export-shadow-audit.ts
.venv-geo/bin/python scripts/test-shadow-audit.py
.venv-geo/bin/python scripts/audit-shadow-sources.py
npx prettier --write tests/fixtures/ docs/shadow-validation-audit.json
npm run check
```

The audit verifies source and runtime hashes, writes predictions to ignored `data/raw/shadow-validation/`, and regenerates reference fixtures from the independent computations. A zero exit code means the **computational** checks passed; `expansionGate: "hold"` remains explicit while source/observation validation is unresolved. The SPA comparison uses geometric elevation, sea-level reference altitude, zero refraction and ΔT = 69.184 seconds. It does not evaluate weather or thermal comfort.

## Required next validation work

1. Continue the [raw-LiDAR investigation](shadow-validation-followup.md): verify post-renovation station geometry and remaining roof differences. Do not silently replace source geometry or relax the threshold.
2. Register the three promising timestamped photographs and resolve the retained Münsterhof disagreement, following the [acceptance protocol](shadow-observations.md). SWISSIMAGE RS remains an alternative; its public sample is outside Zurich and no imagery order or email has been sent.
3. Review point classifications, shadow-boundary errors and failures by location/time. Only then decide whether the limited pilot passes and whether expansion can resume.
