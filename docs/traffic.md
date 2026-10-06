# Calmer streets in Zurich · 0.11.0

**Experimental, map-based street context. Field validation is pending.** The Zurich walking area is 57.77 km². This mode reduces walking beside mapped main roads, then on other streets allowing motor access, within the whole-trip detour budget. It does not estimate vehicle volume, noise, pollution, accident risk or live closures.

## What changed

`zurich-street-context-v2` separates pedestrian areas, separate paths and explicitly motor-restricted streets from Begegnungszone and Tempo-30 streets. Tempo 30 limits speed, not vehicle volume. The previous model grouped all these as calmed; v2 retains the regimes in the displayed breakdown and uses **absolute distances**, avoiding detours that merely dilute a percentage.

OSM crossing segments, explicit motor access (including delivery access), and unresolved conditional access are not rewarded as separate paths. An actual separate path inside a Tempo-30 zone stays a path. Ambiguous layer tags remain unknown. Numeric layers are normalized, so `01` and `1` mean the same recorded level. Main-road proximity always takes priority, including beside a street with a motor restriction.

The selected route has an EN/DE street breakdown. Nearby **2025 measured counter profiles** now use the estimated time the walker passes each counter, including midnight and daylight-saving transitions. They remain separate from route ranking; missing counters never mean zero traffic. See [vehicle-counts.md](vehicle-counts.md).

## Sources and provenance

- [City traffic zones](https://data.stadt-zuerich.ch/dataset/geo_verkehrszonen), CC0: current-status WFS `view_geoserver_zonen_ist`, fetched 29 September 2026. 366 records: 3 pedestrian (T0), 172 Begegnungszone (T20), 191 Tempo-30 (T30). ID 65 Goldbrunnen has no geometry and is excluded. Catalogue update: 27 September; latest non-null implementation date: 15 September 2026. Missing individual dates stay missing. Fetch/catalogue dates are not observations of traffic.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL: buffered north/west Zurich extract fetched 30 September 2026, used for walking topology, street classes, motor-access tags, bridge/layer, covered and tunnel tags. The raw provider base timestamp is not a verified field-survey date. [OSM crossing definition](https://wiki.openstreetmap.org/wiki/Tag:footway%3Dcrossing) and [motor-vehicle access](https://wiki.openstreetmap.org/wiki/Key:motor_vehicle) were checked.
- Coordinates are transformed from WGS84 to **LV95 metres** before distance/polygon calculations. Official municipal source coordinates are EPSG:2056.
- The downloaded municipal speed-axis and road-emission layers remain **unintegrated**. Speed is not volume; 2024 day/night noise emissions cannot be inverted into vehicle counts.

[traffic-validation.json](traffic-validation.json) records source hashes, zone IDs, excluded geometry and graph lengths. The OSM hash now correctly identifies `data/raw/zurich-north-west/osm.json`, the extract actually consumed by preparation; the older report mistakenly referenced the earlier expansion file. This fixes provenance, not routing geometry. Raw inputs remain ignored.

## Official zone overlay · 6 October 2026

The planner’s **30/20** map button displays implemented city zones with solid outlines and cantonal legal orders with dashed outlines. Click a zone to see its name, source and status alongside the start/destination actions. The layer is available in English and German and in updated offline maps. It adds 347 city polygons and 42 nearby cantonal polygons to the current map context; it does not expand walking coverage. The cantonal dataset excludes Zurich and Winterthur, and does not confirm implementation. Cantonal polygons are **display-only**; they never feed route scoring. Speed restrictions are separate from measured traffic. [Sources and reproducible preparation](data-sources.md#tempo-30--20-map-layer--6-october-2026), [import audit](traffic-zone-validation.json).

## Classification

Sample each walking edge at no more than **8 m** spacing. Assign exactly one class in this order:

1. Missing tags, ambiguous layer, tunnels or covered passages: **unknown**.
2. Within **20 m** of a same-recorded-level OSM motorway/trunk/primary/secondary/tertiary segment or its link: **main-road proximity**. Tunnel road segments are excluded from that association.
3. Explicitly mapped foot/cycle crossing or unresolved motor/vehicle/access conditional rule: **other**. For explicit motor access, retain a known T20/T30 regime, otherwise use other. Access restrictions are not evaluated as a time-dependent legal-access engine.
4. Unconditional `motor_vehicle=no` (or `vehicle=no` when no more specific motor tag exists): **restricted**.
5. Official T0 or mapped pedestrian street: **pedestrian**; T20 or mapped living street: **encounter**.
6. Separate footway/path/steps/cycleway, excluding a tagged sidewalk: **path**.
7. Official T30: **tempo30**; remaining mapped streets: **other**.

Ground-level zone polygons are not inherited by elevated paths. Polygon holes are respected. For display, path + pedestrian + restricted form **Paths & restricted streets**; all eight internal classes remain available in the route result. Every segment contributes once, and displayed categories sum to the whole route before rounding.

These are map tags and spatial heuristics, not proof of little/no traffic. Deliveries, permitted exceptions, emergency vehicles, trams, vehicle subclasses, missing tags, barriers between parallel roads/paths and recent changes remain limitations. A pedestrian street may admit deliveries even without an explicit tag. Unknown bridge levels can lead to incorrect associations; the 20 m buffer is not a noise model. Crossing distance is included, but no complete crossing count, waiting delay or crossing-safety assessment is claimed.

## Recommendation rules

Compute the fastest legal pedestrian route first. Generate genuinely different routes using path diversity, main-road avoidance and pedestrian-path preference, with 0, 5 or 10 extra minutes and ordered waypoints. Additional edge-cost weightings only generate candidates; final comparison uses interpretable distances.

Both routes require **at least 95% classified context**. Rank eligible alternatives by:

1. Main-road metres + unknown metres.
2. All metres outside path/pedestrian/restricted classes, including unknown.
3. Shorter walking duration.

A recommendation requires at least 10% new path length and either **40 m less conservative main-road exposure**, or no increase in main-road exposure plus **40 m less motor-access/unknown distance**. In those acceptance comparisons, the reference route's unknown sections receive the favourable assumption and the candidate's unknown sections the unfavourable assumption. Missing context therefore cannot create a claimed improvement. A higher preferred-path percentage alone cannot justify a detour. The ranking may accept more local-street walking to reduce main-road walking; the breakdown makes that trade-off visible.

This is the best of evaluated candidates, not global optimality. The 40 m/95%/20 m choices are engineering heuristics for later field checking, not calibrated traffic-effect thresholds. Static street ranking stays fixed across departure times; historical count evidence changes independently. Other cities still have this mode disabled.

## Computed references

[traffic-route-validation.json](traffic-route-validation.json) retains exact results, data hash, street names and passing-time counter evidence for three real trips at each 0/5/10-minute budget. Departure: Monday 22 June 2026, 14:55 Europe/Zurich. Five-minute examples:

| Trip                             | Fastest → alternative | Main-road proximity | Extra walking |
| -------------------------------- | --------------------- | ------------------- | ------------- |
| Bahnhofquai → Bürkliplatz        | 18.89 → 21.88 min     | 588 → 303 m         | 2.99 min      |
| Bahnhof Oerlikon → Campus Irchel | 24.59 → 26.74 min     | 604 → 218 m         | 2.15 min      |
| Stauffacherstrasse → Lindenhof   | 28.50 → 33.01 min     | 1,313 → 433 m       | 4.51 min      |

These are graph computations, **not measured traffic reductions**. No on-street validation is claimed. Tests include a counterexample where a longer route has a better preferred-path percentage but no reduction in motor-access distance, conditional delivery access, crossings, missing coverage, zero budget, waypoints, numeric/ambiguous levels and passing-time DST/midnight.

## Broader vehicle-volume model investigated

The Canton [GVM-ZH19](https://geolion.zh.ch/geodatensatz/2050) contains modelled 2019 road-section volumes and 2040 scenarios. Its detailed 17.21 network is currently listed in the **non-open geodata shop**, with purpose-specific [reuse conditions](https://geolion.zh.ch/Allgemeine_Bestimmungen_nicht_offene_Geodaten_17032022.pdf); redistribution in a public website/offline pack has not been established. No order, provider message or agreement was submitted.

The [provider's usage note](https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/mobilitaet/mobilitaetsplanung/verkehrsgrundlagen/ktzh_afm_verwendungshinweis_daten-fvm-zh19.pdf) also cautions against local-detail interpretation, recommends suppressing values below 500 vehicles/weekday on the subordinate network, and sensible rounding. The metadata notes limited reliability below approximately 1,000. Even with access, low counts cannot certify a quiet local street. Required next steps are reuse clearance, source/geometry inspection, explicit 2019 labelling, defensible network matching and validation before enabling volume-based ranking. No GVM values are shipped in 0.11.0.

## Reproduction and field work

```sh
npm run data:fetch:traffic:zones # cantonal orders, with completeness check
npm run data:prepare:traffic # retained city zones + buffered OSM + canton snapshot required
npm run data:packs
npm run check
node --import tsx scripts/verify-traffic.ts
```

A fresh checkout uses the checked-in derived Zurich extract. Fetching new zones uses `npm run data:fetch:traffic`; review schema/dates and update provenance/version before preparation. The current fetch/implementation cutoff is deliberately retained, not silently advanced.

[Traffic field protocol](traffic-observations.md): compare representative route pairs, verify the tagged street regime and same-level association, count vehicles separately from noise impressions, record date/time and preserve failures. Shadow field validation and its unresolved roof/photo evidence remain separate. Traffic development is authorized to continue; neither model is field-validated.
