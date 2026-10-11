# Next milestones

## Munich follow-up · 0.24.0

The shared planner now supports Munich 3D building shade, elevation, traffic context, addresses and barrier avoidance. Next resolve vegetation classification for tree shade, obtain/audit complete pavement-side geometry and a reusable vehicle-count export, The walking area now covers 40.5 km² with a dated regional OSM extract and 64 km² of surrounding 3D/ground sources. A real laser/CIR sample and the BAYSIS counter query are documented in [the source review](munich-source-review.md). Full municipal coverage and smaller model subsets for compact downloads remain next steps. [Exact source blockers and integration steps](munich.md#open-parity-that-is-not-yet-supported). Field validation remains necessary.

**Current agreement:** improve Zurich traffic modelling now; field-validate shadow and traffic later. Preserve the [shadow evidence and unresolved issues](shadow-validation.md), keep both capabilities experimental, and treat the requested 0.13.0 library expansion as experimental. Automated checks alone do not establish field accuracy.

## Default Zurich planner · 0.21.0

Pavements, tree shade, street-based zones, equally considered optional wishes and mapped-barrier avoidance are implemented. Next, field-check source-to-street assignments and pairs of routes with conflicting priorities; use tester feedback to assess the explicit trade-off bands. Keep the fastest route and detour limit visible. Before returning to public distribution, decide how to retain protected deployments and authenticate native map updates; store privacy/support pages must be publicly accessible at release. [Selection rules](preferences.md) · [Access limits](private-access.md).

## Elevation follow-up

Version 0.19.0 adds Zurich flatter routing and height profiles using the existing cantonal ground grid. Next, field-check the paired hilly routes, steps and path alignment; obtain walking-surface heights for bridges and underpasses; then evaluate a gradient-aware duration model. Enable another city only after checking a suitable ground source and its route coverage. [Method and computed cases](elevation.md).

## Tree shade follow-up

The [8 October assessment](tree-shade-assessment.md) remains an accuracy limitation. The user subsequently requested experimental coverage across the supported Zurich map; [version 0.17.0](tree-shade-expansion.md) provides the tiled library and a separate verified offline supplement. Version 0.21.0 integrates it by default at the user’s request, retaining full-foliage and field-validation limitations. Wider geographic coverage does not validate summer crowns, opacity or route-ranking usefulness.

Next: field-check tree-covered and open points across several districts at two times, recording foliage, clouds and walking side. Assess leaf-on geometry and light transmission, preserve the 95% coverage requirement and keep sensitivity evidence separate from measured error. Measure the working tile set and complete offline download on a physical phone before making device-performance claims.

## Pavement pilot follow-up

Version 0.15.0 expanded municipal paths across the current Zurich map; 0.18.0 completes address/map-to-pavement selection and trip preservation, retaining arrival-time shade, detour limits and the original independent comparison points. Next: [paired field validation](pavement-field-validation.md), clarification of Vampire Routing’s raster timestamp, and documented Shadowmap point/time API access before a numerical comparison. Next check the expanded district paths, crossings, steps and uncertain walking heights in the field; audit the traffic association now supplied by 0.21.0. Do not infer ground truth from cross-tool agreement.

## Zurich first

Version 0.8.0 makes Zurich the main experience: a 57.77 km² walking area, official address search and direct map selection. Other integrated cities are beta, with Swiss cities listed first. Next, verify entrances and route access in the field, measure performance on ordinary phones and assess newer building geometry against the historical regional model. Improve Basel’s beta after the Zurich experience is dependable; international expansion is deferred.

## Product feedback and priorities

Previously delivered: **Prefer waterside**, a separate mapped-water proximity metric, up to three ordered stops (waypoints / Wegpunkte), and a new route-shaped C mark for the site and app. The [tree audit](tree-accuracy.md) checks position fidelity and freshness; it does not silently move source positions.

- **Calmer Zurich streets:** version 0.5.0 integrates official current traffic zones and main-road proximity. Version 0.6.0 adds measured 2025 directional count profiles near routes. Their sparse point coverage cannot rank whole walks. Next, obtain documented street-section traffic volumes or independently validate a count-to-network model, then field-check route pairs; never equate speed limits with measured low traffic. Other cities require their own validated sources.
- **German:** full website/shared app language and static help/privacy are implemented. Next, review wording with German-speaking walkers and test additional browser/OS locales; keep local place names and route time zones independent.
- **Winter / sunny walks:** the explicit “Prefer shade / Prefer sun” choice is now implemented for Zurich and Munich. Four surrounding Munich building tiles are now integrated; validate real dated shadows and resolve uncertain elevated structures. Tree foliage still requires separate evidence; the app does not assume a universal seasonal calendar.
- **Tree refresh:** reconcile moved and unmatched IDs, replacements and duplicates; check dated aerial imagery and a field sample before publishing a versioned data refresh. Tree positions alone do not establish canopy shade.
- **Feedback:** consider “Suggest an idea / Report a problem”, initially with a private review queue. Contact information should be optional; attaching a route/location needs explicit consent. Decide storage, retention, abuse controls and moderation before enabling submission. The live support page now provides email feedback; no public posting system is implemented. Friend testing itself is deferred as requested.
- **Weather and reliability:** no weather feed is currently used. Before integration, verify provider coverage, terms and forecast validation. Show source, issue time, valid local time, model/grid resolution, lead time, refresh policy and stale/offline status. Evaluate cloud/radiation forecasts against observations; avoid invented reliability percentages. Keep geometric shade, weather and perceived comfort separate.
- **Cities and platforms:** polish Zurich first, then deepen Basel’s beta. Munich and Cambridge remain maintained beta areas; further international expansion is deferred. Native iOS/Android development projects now exist at the user’s request. iOS now builds on CI and launches in the simulator. Keep the published map downloads in a permanent archive, then prepare signed private test distribution; physical-phone testing remains deferred at the user’s request. Maintain one shared planner and budget for two native SDK/signing paths.
- **Existing-app research:** Vampire Routing and Shadowmap have now been reviewed; the pavement pilot includes a reproducible, qualified raster comparison. See [comparison findings](pavement-pilot.md#independent-checks-and-other-tools).

Current delivery adds expanded Zurich coverage, official addresses, direct map actions and beta city labels to historical count evidence, calmer-street routing and German to the expanded areas, native apps, downloads, sun, greenery, water and waypoints features. The remaining items above are backlog work; weather and public feedback posting are not implemented.

## Model and release work

1. **Validate the Zurich estimate in the street.** Audit the reference walks and snapping near rivers, gates and entrances; compare timestamped building shadows with independent observations at morning/noon/evening. Compare the expanded 3D/LiDAR-ground library against the previous flat blocks and quantify remaining source-age and pavement-location errors. Keep the experimental label until this is done.
2. **Improve source fidelity and runtime size.** Verify OSM snapshot freshness, audit multipolygon water/park geometry, consolidate building fragments, benchmark a lower-end phone and evaluate a smaller binary model bundle. Extend coverage only after full-route validation.
3. **Improve shadow geometry.** Arrival-time exposure is implemented in 0.9.0, including ordered stops, repeated paths and low-sun/night transitions. Version 0.13.0 extends actual roof/facade intersections and LiDAR ground elevations across the current Zurich walking area with on-demand verified tiles. Version 0.16.0 adds the optional lakeshore LiDAR envelope scenario. Next, validate dated observations and canopy assumptions, obtain local leaf-on/transmission evidence, and investigate a wider terrain horizon. Keep experimental limits until independent dated observations establish accuracy. Candidate generation still uses departure-time weights; additional time-dependent search heuristics need a measured benefit and a phone-performance budget.
4. **Deepen city capabilities.** Prioritize verified Basel building heights after Zurich validation. Cambridge’s vertical units and missing-height masks, and Munich’s uncertain structure masks, remain beta follow-ups. Validate each before enabling or expanding sun/shade. Paris remains a later bounded integration candidate.
5. **Release hardening.** The 0.14.1 optimization passes the original full-Zurich afternoon and offline-restart checks on the same 2 GB emulator. Continue measuring startup on physical devices and slower connections. Physical iPhone/Android install and outdoor usability checks, further languages and RTL layouts, broader browser support, explicit source-update workflow and error telemetry that does not collect precise journeys.

App-store publication, accounts, social features, live turn-by-turn navigation, weather forecasting and unverified accessibility claims remain outside this milestone.

Resolved in 0.14.1: content-versioned requests and compatible-cache migration remove the stale-data retry recorded in 0.11.0/0.14.0. Keep the production legacy-worker upgrade regression in CI as data and model versions change. [Maintenance and reproduction](maintenance.md).
