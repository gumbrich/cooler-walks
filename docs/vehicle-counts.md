# Zurich vehicle counts · 0.6.0

## What is integrated

The central Zurich pilot includes **49 directional measuring points at 28 counting sites**, with genuine **2025** observations. Open **Vehicle counts nearby / Fahrzeugzählungen in der Nähe** beneath a selected route. Numbered blue map markers correspond to the list. Changing departure weekday/hour selects the historical profile in **Europe/Zurich**, independently of device time and interface language. English, German, downloaded packs and native bundled data share the implementation.

These are nearby point observations, **not route-wide measured traffic**. A measuring point is listed when its published historical position is within 40 metres of the actual route polyline in LV95 metres. This proximity rule does not associate every walking segment with a measured road, distinguish the sidewalk from a crossing, establish the same vertical level or model noise propagation. Counters are never summed across directions or locations. No counter nearby means unknown traffic, never zero.

**Route ranking remains the existing street-context method.** Twenty-eight sites cannot establish comparable vehicle-count coverage along whole routes. Integrating the counts as evidence is justified; extrapolating them into a citywide vehicle-volume score is not. See [traffic.md](traffic.md) for the independently maintained calmer-street algorithm.

## Sources and dates

- [City hourly motor-vehicle counts](https://data.stadt-zuerich.ch/dataset/sid_dav_verkehrszaehlung_miv_od2031), CC0, actual Parquet download. Fields: MSID (directional measuring point), ZSID (site), Achse, Richtung, EKoord/NKoord (EPSG:2056), MessungDatZeit (local hour with explicit offset), AnzFahrzeuge, AnzFahrzeugeStatus, detector metadata. The count already covers the listed detectors: multiplying it by AnzDetektoren would double-count. The downloaded archive ends on 29 September 2026; the runtime uses only the complete reference year **1 January–31 December 2025**.
- [Active count sites](https://data.stadt-zuerich.ch/dataset/geo_standorte_der_verkehrszaehlungen_miv), CC0. WFS layer `tbl_standort_zaehlung_miv_p`, 114 current sites, catalogue dated 26 September 2026. Active IDs screen obsolete sites. Runtime points come from the measurements' LV95 coordinates, not the generic site centroid. Reject historical points more than 300 m from that current centroid; this is a sanity check, not proof that detectors never moved. The GeoJSON geometry is used for that check; misleading/swapped ekoord/nkoord property labels in the site response are not used.
- Both inputs fetched **30 September 2026**. Hashes, URLs, exclusions and profile requirements are preserved in [vehicle-counts-validation.json](vehicle-counts-validation.json) and the city data manifest. Fetch/catalogue dates are not observation dates. Raw archives stay outside Git.
- Investigated the [street-emission dataset](https://data.stadt-zuerich.ch/dataset/geo_laermbelastungskataster_fuer_haupt__und_uebrige_strassen): 7,295 line features, reference year 2024. It publishes modelled day/night emissions and descriptive traffic situations, **not usable vehicle totals**. Noise cannot be inverted into vehicle counts. It is not integrated or used to fill missing traffic observations.

## Aggregation and reliability

Use only **Gemessen** rows. Exclude **Imputiert** and **Fehlend**; reject unexpected status values, duplicate measurement instants, negative/null measured totals, or changed measurement metadata within the year. Tunnel counters are excluded. Keep one profile per MSID and preserve its published direction rather than assuming a complete two-way total. Other traffic classes, congestion, delivery access and vehicle noise are not measured by this interface.

The profile has 168 slots: Monday–Sunday × 00–23. Each slot is the mean for that weekday and local hour in 2025. A numerical mean requires measurements on **at least 80% of the year's expected occurrences of that weekday** (normally 52 or 53). Otherwise it stays null; the actual number of measured days remains visible. Repeated autumn-clock hours are averaged within their calendar day before days are averaged, avoiding double weighting. The skipped spring hour contributes no observation. Source observation offsets remain distinct during duplicate detection.

The display rounds larger means to tens of vehicles/hour, and very small means to one decimal. A 24-hour bar profile shows the selected weekday; its current hour is highlighted and absent slots have a dashed outline. The numerical value and days denominator remain available without interpreting the chart.

This annual historical reference includes holidays and seasonal variation. It is **not a prediction for the selected date**, an arrival-time simulation or a live feed. The source is normally published daily, including the previous day; this app deliberately ships a versioned snapshot and makes no automatic daily-update claim. A later data release must be reviewed, reprocessed, versioned and deployed. Provider corrections can alter past data.

## Reproduce

The checked-in derived Zurich bundle is sufficient to run the app. Optional preparation uses Python 3 and pinned DuckDB solely to read Parquet; the website requires no Python server.

```sh
python3 -m venv /tmp/cooler-counts-venv
/tmp/cooler-counts-venv/bin/pip install -r scripts/requirements-counts.txt
/tmp/cooler-counts-venv/bin/python scripts/prepare-vehicle-counts.py --fetch --year 2025
npm run data:attach:counts
npm run data:packs
/tmp/cooler-counts-venv/bin/python scripts/test-vehicle-counts.py
npm run check
```

Omit `--fetch` to reproduce from the retained raw snapshot and its fetch record. Refetching can change corrected historical values; inspect the hashes, metadata/exclusion changes and pilot counts before updating `city.dataVersion`. After regenerating base Zurich data, run the count attachment step again. Preparation rejects incomplete/current reference years. The update does not replace the existing zone source or its observation dates.

## Verified reference

For Bahnhofquai–Bürkliplatz, Monday 22 June 2026 at 14:00 Zurich time, the fastest route passes within 40 m of three supported directional measuring points. Their **2025 Monday 14:00 means** are: Z030M002 (Rudolf Brun-Brücke toward Mühlegasse), 305.33 vehicles/hour from 52 days; Z031M002 (Quaibrücke toward Bellevue), 1,218.79 from 52 days; Z049M002 (Bahnhofbrücke toward Bahnhof), 364.61 from 46 days. Rounded UI values are 310, 1,220 and 360. These are computed from the source archive, not counts observed on the chosen departure date.

The existing calmer alternative has no supported nearby counter. Its actual vehicle volume is **unknown**; the app does not label it zero or claim a measured reduction. This route pair is an intentional regression case for the missing-data explanation.

Next: obtain a documented street-section traffic-volume dataset or a defensible, independently validated count-to-road network model. Establish comparable full-route coverage before making vehicle-volume-based recommendations. Do not fill gaps with noise emissions, speed limits or unverified extrapolation.
