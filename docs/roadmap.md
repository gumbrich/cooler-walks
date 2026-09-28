# Next milestones

1. **Validate the Zurich estimate in the street.** Audit the reference walks and snapping near rivers, gates and entrances; compare timestamped building shadows with independent observations at morning/noon/evening. Quantify how flat terrain and maximum roof heights affect results. Keep the experimental label until this is done.
2. **Improve source fidelity and runtime size.** Verify OSM snapshot freshness, audit multipolygon water/park geometry, consolidate building fragments, benchmark a lower-end phone and evaluate a smaller binary model bundle. Extend coverage only after full-route validation.
3. **A time-aware shadow model.** Evaluate exposure at expected segment arrival time, add terrain-aware geometry and appropriate missing-height masks. Add tree shade only with independently supported canopy geometry and local foliage evidence.
4. **Paris greenery pilot.** Integrate a bounded pedestrian graph and municipal tree extract through the shared configuration. Validate local routes and switching before enabling it. Then investigate actual IGN building samples for a separate shade capability.
5. **Release hardening.** Physical iPhone/Android install and outdoor usability checks, localization extraction and RTL layouts, broader browser support, explicit source-update workflow and error telemetry that does not collect precise journeys.

Native apps, accounts, social features, live turn-by-turn navigation, weather forecasting and unverified accessibility claims remain outside this milestone.
