# Next milestones

## Zurich first

Version 0.7.0 makes Zurich the main experience: a 21.81 km² walking area, official address search and direct map selection. Other integrated cities are beta, with Swiss cities listed first. Next, verify entrances and route access in the field, measure performance on ordinary phones and evaluate Oerlikon/Altstetten source tiles. Improve Basel’s beta after the Zurich experience is dependable; international expansion is deferred.

## Product feedback and priorities

Previously delivered: **Prefer waterside**, a separate mapped-water proximity metric, up to three ordered stops (waypoints / Wegpunkte), and a new route-shaped C mark for the site and app. The [tree audit](tree-accuracy.md) checks position fidelity and freshness; it does not silently move source positions.

- **Calmer Zurich streets:** version 0.5.0 integrates official current traffic zones and main-road proximity. Version 0.6.0 adds measured 2025 directional count profiles near routes. Their sparse point coverage cannot rank whole walks. Next, obtain documented street-section traffic volumes or independently validate a count-to-network model, then field-check route pairs; never equate speed limits with measured low traffic. Other cities require their own validated sources.
- **German:** full website/shared app language and static help/privacy are implemented. Next, review wording with German-speaking walkers and test additional browser/OS locales; keep local place names and route time zones independent.
- **Winter / sunny walks:** the explicit “Prefer shade / Prefer sun” choice is now implemented for Zurich and Munich. Four surrounding Munich building tiles are now integrated; validate real dated shadows and resolve uncertain elevated structures. Tree foliage still requires separate evidence; the app does not assume a universal seasonal calendar.
- **Tree refresh:** reconcile moved and unmatched IDs, replacements and duplicates; check dated aerial imagery and a field sample before publishing a versioned data refresh. Tree positions alone do not establish canopy shade.
- **Feedback:** consider “Suggest an idea / Report a problem”, initially with a private review queue. Contact information should be optional; attaching a route/location needs explicit consent. Decide storage, retention, abuse controls and moderation before enabling submission. The live support page now provides email feedback; no public posting system is implemented. Friend testing itself is deferred as requested.
- **Weather and reliability:** no weather feed is currently used. Before integration, verify provider coverage, terms and forecast validation. Show source, issue time, valid local time, model/grid resolution, lead time, refresh policy and stale/offline status. Evaluate cloud/radiation forecasts against observations; avoid invented reliability percentages. Keep geometric shade, weather and perceived comfort separate.
- **Cities and platforms:** polish Zurich first, then deepen Basel’s beta. Munich and Cambridge remain maintained beta areas; further international expansion is deferred. Native iOS/Android development projects now exist at the user’s request. iOS now builds on CI and launches in the simulator. Keep the published map downloads in a permanent archive, then prepare signed private test distribution; physical-phone testing remains deferred at the user’s request. Maintain one shared planner and budget for two native SDK/signing paths.
- **Existing-app research:** deferred, as requested. No competitor investigation was performed in this iteration.

Current delivery adds expanded Zurich coverage, official addresses, direct map actions and beta city labels to historical count evidence, calmer-street routing and German to the expanded areas, native apps, downloads, sun, greenery, water and waypoints features. The remaining items above are backlog work; weather and public feedback posting are not implemented.

## Model and release work

1. **Validate the Zurich estimate in the street.** Audit the reference walks and snapping near rivers, gates and entrances; compare timestamped building shadows with independent observations at morning/noon/evening. Quantify how flat terrain and maximum roof heights affect results. Keep the experimental label until this is done.
2. **Improve source fidelity and runtime size.** Verify OSM snapshot freshness, audit multipolygon water/park geometry, consolidate building fragments, benchmark a lower-end phone and evaluate a smaller binary model bundle. Extend coverage only after full-route validation.
3. **A time-aware shadow model.** Evaluate exposure at expected segment arrival time, add terrain-aware geometry and appropriate missing-height masks. Add tree shade only with independently supported canopy geometry and local foliage evidence.
4. **Deepen city capabilities.** Prioritize verified Basel building heights after Zurich validation. Cambridge’s vertical units and missing-height masks, and Munich’s uncertain structure masks, remain beta follow-ups. Validate each before enabling or expanding sun/shade. Paris remains a later bounded integration candidate.
5. **Release hardening.** Physical iPhone/Android install and outdoor usability checks, further languages and RTL layouts, broader browser support, explicit source-update workflow and error telemetry that does not collect precise journeys.

App-store publication, accounts, social features, live turn-by-turn navigation, weather forecasting and unverified accessibility claims remain outside this milestone.
