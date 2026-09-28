# Progress

## Current milestone: expanded coverage and native mobile development

Implemented an explicit **Prefer shade / Prefer sun** choice for building-enabled cities, preserving the single 0/5/10-minute detour limit. Sun preference uses a higher known sunny share and conservatively accounts for missing data; it does not reward a longer walk merely for accumulating more sun. Winter date changes already affect building geometry. No universal seasonal switch, tree foliage or weather model is implied.

Real public sources now support bounded pilots in **Zurich, Munich, Cambridge (MA) and Basel**. Zurich and Munich offer experimental building sun/shade. Cambridge and Basel are explicitly greenery/water prototypes; their building-height integration blockers are documented. Paris remains under review. Each city uses its own source attribution, CRS, IANA time zone, coverage and version, through shared search, mapping and routing modules.

The Munich adapter now verifies four adjacent LoD2 tiles and 19,529 geometry parts. It conservatively masks 61 unsupported/elevated or conflicting objects; 19,468 accepted height comparisons agree within 0.013 m. Its tree layer uses actual automatic detections with false-positive caveats. Cambridge excludes 12,039 non-Tree site records before clipping; Basel uses its maintained-tree register and a complete cross-border Rhine relation. See city data manifests and the coverage register. Raw source downloads remain ignored; checked-in derived extracts make ordinary setup self-contained.

The map now accounts for projected-grid rotation when using true-north solar bearings, and explicit pedestrian direction restrictions are excluded from the bidirectional graph. Browser review improved phone resizing and endpoint clearance from map controls. Each additional city is cached only when visited; unavailable offline cities fail clearly and recover with both routes and maps after reconnection.

Validation: TypeScript, focused model tests, real route comparisons in all four pilots, responsive browser interactions, accessibility/enlarged text, source formatting and production build. Chrome on macOS also verified offline reload, cached-city switching, unvisited-city failure/recovery, actual PWA installation and standalone launch. Reports and actual desktop/phone/tablet screenshots are included; see platform.md for exact counts and untested platforms.

Private maintained repository: https://github.com/gumbrich/cooler-walks. The delivered runtime remains the local preview; no public production domain has been deployed.

## Expanded areas

Zurich: 8.06 km² (1.81× the old pilot); Munich: 8.90 km² (4.44×); Cambridge: 18.46 km² (4.95×), using its municipal polygon; Basel: 10.25 km² (2.14×). All graph segments stay inside supported coverage, including narrow gaps and holes. Six new journeys and the existing reference trips validate real routes, alternatives and detour limits. Larger Munich surroundings also enable the tested winter sun comparison.

A whole-coverage map action and quieter city-scale cartography make these limits visible. Unsupported surroundings are muted. Native Capacitor projects share the complete planner and bundle all city data for offline use, with native location permission, Android Back, app icons and safe areas. The Android debug APK built and passed eleven emulator integration checks, including native permission denial, every city offline, winter sun and a cold offline restart. Actual emulator screenshots are included. Setup and the exact remaining iOS platform blocker are in `mobile.md`; validation is recorded in `platform.md`.

## Next useful milestone

Complete physical-phone and iOS-platform validation, then prepare a small private tester build. Benchmark city bundles on lower-end phones and introduce versioned downloadable areas before full-city expansion elsewhere. Validate dated shadows and route access in the street; normalize Cambridge’s height units/unknown-height masks and add Basel building heights. Tree shade, terrain, weather and feedback collection remain separate roadmap items.
