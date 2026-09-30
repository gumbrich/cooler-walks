# Calmer streets in Zurich

Version 0.5.0 adds an **experimental street-context preference** in the existing 8.06 km² central Zurich pilot. It answers a narrower question than live traffic avoidance: “Can I walk less along mapped main roads, within my extra-time limit?” No traffic counts, noise readings, pollution measurements, accident risk or live closures are inferred.

## Sources checked on 29 September 2026

- [Zurich Verkehrszonen](https://data.stadt-zuerich.ch/dataset/geo_verkehrszonen), CC0, current-status WFS layer `view_geoserver_zonen_ist`. The actual WGS84 GeoJSON response contains 366 records: 3 pedestrian zones (T0), 172 Begegnungszonen (T20), 191 Tempo-30 zones (T30). One record, ID 65 Goldbrunnen, has null geometry and is excluded, never assigned an invented extent. Catalogue modification: 27 September 2026. Latest non-null implementation date in the response: 15 September 2026. Many individual dates are absent. This is a reported current regime, not a recent traffic survey.
- The existing buffered [OpenStreetMap](https://www.openstreetmap.org/copyright) extract supplies actual walking topology and nearby `motorway`, `trunk`, `primary`, `secondary`, `tertiary` and corresponding `_link` ways. OSM data is ODbL; credit OpenStreetMap contributors. Extract fetched 28 September 2026; its raw `osm3s.timestamp_osm_base` is not a valid observation date. Do not infer a field-survey date from it.
- [Signalisierte Geschwindigkeiten](https://data.stadt-zuerich.ch/dataset/geo_signalisierte_geschwindigkeiten) was downloaded and inspected: 5,280 geometries in current-status `view_geoserver_tempo_ist`. **Not used in this release.** The separate published-plan layer can contain future changes. Speed restrictions alone cannot establish low traffic. Robust association of speed axes to parallel paths is a next step.
- [Zurich road-noise register](https://data.stadt-zuerich.ch/dataset/geo_strassenlaermkataster_der_stadt_zuerich) is a potential next input, with modelled facade-receptor values and distinct 2024/2035 scenarios. Facade values cannot be presented as measurements at a walker’s position. [Road-emission data](https://data.stadt-zuerich.ch/dataset/geo_laermbelastungskataster_fuer_haupt__und_uebrige_strassen) merits investigation for documented vehicle volumes and emissions; no runtime integration is claimed.

Exact source hashes, used zone IDs, exclusions and classified graph lengths are in [traffic-validation.json](traffic-validation.json) and the Zurich data manifest. Raw downloads are ignored by Git. The official source geometry is projected from EPSG:4326 into the pilot's LV95 metre coordinates; original municipal geodata uses EPSG:2056.

## Reproduce

From the project root, with the existing Zurich OSM extract prepared as documented in [data-sources.md](data-sources.md):

```sh
npm run data:fetch:traffic
npm run data:prepare:traffic
npm run data:packs
npm run check
```

`npm run data:prepare` now includes traffic preparation after the base Zurich data. Before accepting a new source response, inspect changed fields/counts/implementation dates, update preparation dates and the city data version, and rerun route validation. The adapter rejects unexpected schema and future implementation dates relative to this release. A later fetch must not silently retain the old provenance date. The prepared, checked-in extract is sufficient to run a fresh checkout without network ingestion.

## Model and comparison

`zurich-street-context-v1` samples each walking edge at the shared **8 m maximum spacing**. Each sample receives exactly one class, in priority order:

1. Missing way tags, tunnels or covered passages: unknown.
2. Within **20 m** of an OSM main-road segment at the same recorded level: main-road proximity. This includes parallel footways and overrides zone membership.
3. Inside an official T0/T20/T30 polygon (holes respected), or explicitly mapped pedestrian/living street: the corresponding zone class. Elevated paths do not inherit ground-level polygons.
4. Separate footway/path/steps/cycleway away from main roads, excluding explicitly mapped sidewalks: path.
5. Remaining mapped streets: other. “Other” does not mean quiet.

The 20 m threshold is a transparent geometric heuristic, not a sound-propagation model. Recorded bridge/layer tags distinguish levels; missing or mistaken tags, stale road classifications, minor-road traffic, trams, delivery access and real conditions remain limitations. Neither Tempo 30 nor a pedestrian-zone label promises little traffic, no vehicles, legal access at every time, or wheelchair suitability.

The original fastest valid pedestrian route remains the reference. Candidate generation evaluates path-diversity penalties plus main-road and calmed-path weighting. Among distinct candidates within **0/5/10 extra minutes**, the calmer preference first minimizes **main-road distance + unknown distance**, then maximizes the known share of pedestrian/Begegnungszone/Tempo-30/separate-path samples, then prefers shorter duration. Both compared routes need at least **95% classified context**. A candidate must have at least 10% new path length and either reduce conservative main-road distance by at least 40 m, or increase the calmed/path share by at least 3 percentage points without increasing main-road exposure. Unknown parts cannot improve either comparison. This is the best of evaluated alternatives, not a proof of global optimality.

The card's primary calmer-mode number is distance near main roads. Its bar shows known distance away from those roads over total route length (unknown parts are not counted as away); the separate calmed-street/path share is also over the whole route. Building shade, tree greenery and water stay separate. The street-context model is static across departure times. Water and calmer-street priorities are mutually exclusive; ordered waypoints and the whole-trip detour limit still apply. Outside Zurich the capability is disabled.

## Real reference result

Bahnhofquai → Bürkliplatz, 21 June 2026 at 14:00 Europe/Zurich, five extra minutes allowed:

| Computed route     | Walking time | Near main roads | Unknown context |
| ------------------ | -----------: | --------------: | --------------: |
| Fastest            |    18.89 min |        587.85 m |         35.40 m |
| Calmer alternative |    21.88 min |        302.92 m |         11.43 m |

The additional 2.99 minutes reduce mapped main-road proximity by 284.93 m. The alternative goes via Waisenhausstrasse, Oetenbachgasse, Lindenhof and Münsterhof. It is a genuine graph route with checked topology; zero extra time retains the fastest route. Rounded UI values intentionally avoid false precision. Automated regression tests recompute the result; screenshots verify the route against the underlying mapped network. No on-street traffic or noise validation has been performed.

Next: compare official street-level vehicle-volume/emission attributes against the OSM geometry, inspect their observation dates and uncertainty, then field-check representative route pairs. Keep such evidence separate from this street-type indicator and only enable it in other cities after their sources have been checked.

## Vehicle-count evidence follow-up

Version 0.6.0 includes dated directional hourly observations near selected Zurich walks. They do not change this street-context ranking because point coverage is insufficient for whole-route vehicle comparisons. [Sources, aggregation, limitations and reproduction](vehicle-counts.md).

## Expanded Zurich coverage · 0.7.0

The existing official zone snapshot is reapplied to the new 30 September OSM extract over 21.81 km². All 73,011 pedestrian edges are classified with the same model, level checks, buffers and coverage thresholds. Current class totals and hashes replace the validation report; the earlier 0.5 figures describe that milestone. No other city gains traffic capability through its beta label.
