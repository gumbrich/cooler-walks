# Progress

## Implementation plan

1. Verify a bounded Zurich network, vegetation and building data; compare international candidates.
2. Implement typed city adapters, pedestrian graph routing and environmental scoring with focused tests.
3. Build a distinctive responsive entry, map planner and optional installed experience.
4. Review actual browser layouts and interactions, document limitations, run checks and push milestones.

## Current milestone

The first working Zurich pilot is implemented. It includes a real pedestrian graph, tree-proximity comparison, experimental time-dependent building shade, a custom local map, responsive public entry/planner, and an optional installed PWA. Private GitHub repository: https://github.com/gumbrich/cooler-walks.

The checked-in processed extracts make ordinary setup self-contained; raw data remains excluded. Data preparation, source hashes, versions, licensing and limitations are documented. Paris was selected for the next data investigation, with a real municipal tree API sample checked; it remains disabled pending graph and environmental integration.

Model tests and real-route checks cover projection, time zones/DST, solar reference cases, detour limits, unknown coverage and night. Desktop/phone/tablet screenshots were inspected and refined. Chrome on macOS passed responsive browser checks, automated accessibility checks, production offline reload, actual installation and standalone launch. See `platform.md` for precisely tested paths and untested platforms.

No citywide, field-validated or international availability is claimed. Building shade is experimental, based on historical simplified geometry; tree shade, terrain and weather remain disabled.

## Next useful step

Walk and audit the reference Zurich routes, compare the model with independently dated shadow observations, and verify the source network's freshness. Then improve geometry/runtime size and integrate a bounded Paris greenery pilot through the shared city configuration. See `roadmap.md`.
