# Next milestones

## Product feedback and priorities

Previously delivered: **Prefer waterside**, a separate mapped-water proximity metric, up to three ordered stops (waypoints / Wegpunkte), and a new route-shaped C mark for the site and app. The [tree audit](tree-accuracy.md) checks position fidelity and freshness; it does not silently move source positions.

- **Winter / sunny walks:** the explicit “Prefer shade / Prefer sun” choice is now implemented for Zurich and Munich. Four surrounding Munich building tiles are now integrated; validate real dated shadows and resolve uncertain elevated structures. Tree foliage still requires separate evidence; the app does not assume a universal seasonal calendar.
- **Tree refresh:** reconcile moved and unmatched IDs, replacements and duplicates; check dated aerial imagery and a field sample before publishing a versioned data refresh. Tree positions alone do not establish canopy shade.
- **Feedback:** consider “Suggest an idea / Report a problem”, initially with a private review queue. Contact information should be optional; attaching a route/location needs explicit consent. Decide storage, retention, abuse controls and moderation before enabling submission. The live support page now provides email feedback; no public posting system is implemented. Friend testing itself is deferred as requested.
- **Weather and reliability:** no weather feed is currently used. Before integration, verify provider coverage, terms and forecast validation. Show source, issue time, valid local time, model/grid resolution, lead time, refresh policy and stale/offline status. Evaluate cloud/radiation forecasts against observations; avoid invented reliability percentages. Keep geometric shade, weather and perceived comfort separate.
- **Cities and platforms:** deepen the new Munich, Cambridge (MA) and Basel pilots before adding more cities. Native iOS/Android development projects now exist at the user’s request. iOS now builds on CI and launches in the simulator. Keep the published map downloads in a permanent archive, then prepare signed private test distribution; physical-phone testing remains deferred at the user’s request. Maintain one shared planner and budget for two native SDK/signing paths.
- **Existing-app research:** deferred, as requested. No competitor investigation was performed in this iteration.

Current delivery expands all four areas, adds native app projects and versioned downloadable areas to the existing sun, greenery, water and waypoints features. The remaining items above are backlog work; weather and public feedback posting are not implemented.

## Model and release work

1. **Validate the Zurich estimate in the street.** Audit the reference walks and snapping near rivers, gates and entrances; compare timestamped building shadows with independent observations at morning/noon/evening. Quantify how flat terrain and maximum roof heights affect results. Keep the experimental label until this is done.
2. **Improve source fidelity and runtime size.** Verify OSM snapshot freshness, audit multipolygon water/park geometry, consolidate building fragments, benchmark a lower-end phone and evaluate a smaller binary model bundle. Extend coverage only after full-route validation.
3. **A time-aware shadow model.** Evaluate exposure at expected segment arrival time, add terrain-aware geometry and appropriate missing-height masks. Add tree shade only with independently supported canopy geometry and local foliage evidence.
4. **Deepen city capabilities.** Add missing-height/municipal-edge masks and verified vertical units for Cambridge; ingest Basel building heights; resolve Munich’s uncertain structure masks and plan further coverage only after performance checks. Validate each before enabling or expanding sun/shade. Paris remains a later bounded integration candidate.
5. **Release hardening.** Physical iPhone/Android install and outdoor usability checks, localization extraction and RTL layouts, broader browser support, explicit source-update workflow and error telemetry that does not collect precise journeys.

App-store publication, accounts, social features, live turn-by-turn navigation, weather forecasting and unverified accessibility claims remain outside this milestone.
