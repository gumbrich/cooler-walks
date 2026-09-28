# Next milestones

## Product feedback and priorities

Delivered in this iteration: **Prefer waterside**, a separate mapped-water proximity metric, up to three ordered stops (waypoints / Wegpunkte), and a new route-shaped C mark for the site and app. The [tree audit](tree-accuracy.md) checks position fidelity and freshness; it does not silently move source positions.

- **Winter / sunny walks:** next add an explicit “Prefer shade / Prefer sun” choice. Seasonal suggestions should use the city's local context and hemisphere while leaving the user in control. Unknown coverage must never count as favourable sun. Long winter shadows need adequate surrounding geometry. Building shadows already change with date; tree foliage requires separate evidence.
- **Tree refresh:** reconcile moved and unmatched IDs, replacements and duplicates; check dated aerial imagery and a field sample before publishing a versioned data refresh. Tree positions alone do not establish canopy shade.
- **Feedback:** consider “Suggest an idea / Report a problem”, initially with a private review queue. Contact information should be optional; attaching a route/location needs explicit consent. Decide storage, retention, abuse controls and moderation before enabling submission. No feedback is collected yet. Friend testing itself is deferred as requested.
- **Weather and reliability:** no weather feed is currently used. Before integration, verify provider coverage, terms and forecast validation. Show source, issue time, valid local time, model/grid resolution, lead time, refresh policy and stale/offline status. Evaluate cloud/radiation forecasts against observations; avoid invented reliability percentages. Keep geometric shade, weather and perceived comfort separate.
- **Cities and platforms:** continue the bounded Paris integration below, followed by other validated cities. Test the shared website/PWA on physical iOS/Android devices; add native apps only for a concrete requirement with a recorded maintenance cost.
- **Existing-app research:** deferred, as requested. No competitor investigation was performed in this iteration.

These are backlog items, not implemented features. Water and waypoints were the selected priority for this round.

## Model and release work

1. **Validate the Zurich estimate in the street.** Audit the reference walks and snapping near rivers, gates and entrances; compare timestamped building shadows with independent observations at morning/noon/evening. Quantify how flat terrain and maximum roof heights affect results. Keep the experimental label until this is done.
2. **Improve source fidelity and runtime size.** Verify OSM snapshot freshness, audit multipolygon water/park geometry, consolidate building fragments, benchmark a lower-end phone and evaluate a smaller binary model bundle. Extend coverage only after full-route validation.
3. **A time-aware shadow model.** Evaluate exposure at expected segment arrival time, add terrain-aware geometry and appropriate missing-height masks. Add tree shade only with independently supported canopy geometry and local foliage evidence.
4. **Paris greenery pilot.** Integrate a bounded pedestrian graph and municipal tree extract through the shared configuration. Validate local routes and switching before enabling it. Then investigate actual IGN building samples for a separate shade capability.
5. **Release hardening.** Physical iPhone/Android install and outdoor usability checks, localization extraction and RTL layouts, broader browser support, explicit source-update workflow and error telemetry that does not collect precise journeys.

Native apps, accounts, social features, live turn-by-turn navigation, weather forecasting and unverified accessibility claims remain outside this milestone.
