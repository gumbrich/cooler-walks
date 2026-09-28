# Progress

## Current milestone: sun preference and four city pilots

Implemented an explicit **Prefer shade / Prefer sun** choice for building-enabled cities, preserving the single 0/5/10-minute detour limit. Sun preference uses a higher known sunny share and conservatively accounts for missing data; it does not reward a longer walk merely for accumulating more sun. Winter date changes already affect building geometry. No universal seasonal switch, tree foliage or weather model is implied.

Real public sources now support bounded pilots in **Zurich, Munich, Cambridge (MA) and Basel**. Zurich and Munich offer experimental building sun/shade. Cambridge and Basel are explicitly greenery/water prototypes; their building-height integration blockers are documented. Paris remains under review. Each city uses its own source attribution, CRS, IANA time zone, coverage and version, through shared search, mapping and routing modules.

The Munich adapter checks a published LoD2 checksum and compares all 5,499 derived relative heights against source measuredHeight (maximum difference 0.005 m). Its tree layer uses actual automatic detections with false-positive caveats. Cambridge excludes 12,039 non-Tree site records before clipping; Basel uses its maintained-tree register and a complete cross-border Rhine relation. See city data manifests and the coverage register. Raw source downloads remain ignored; checked-in derived extracts make ordinary setup self-contained.

The map now accounts for projected-grid rotation when using true-north solar bearings, and explicit pedestrian direction restrictions are excluded from the bidirectional graph. Browser review improved phone resizing and endpoint clearance from map controls. Each additional city is cached only when visited; unavailable offline cities fail clearly and recover with both routes and maps after reconnection.

Validation: TypeScript, focused model tests, real route comparisons in all four pilots, responsive browser interactions, accessibility/enlarged text, source formatting and production build. Chrome on macOS also verified offline reload, cached-city switching, unvisited-city failure/recovery, actual PWA installation and standalone launch. Reports and actual desktop/phone/tablet screenshots are included; see platform.md for exact counts and untested platforms.

Private maintained repository: https://github.com/gumbrich/cooler-walks. The delivered runtime remains the local preview; no public production domain has been deployed.

## Next useful milestone

Validate dated sun/shadow observations and public access on the reference routes. Extend Munich’s surrounding building tiles for winter coverage, then implement verified height units and unknown-building/municipal-edge masks in Cambridge and a building-height adapter for Basel. Benchmark smaller map bundles on physical phones before expanding areas. Tree shade, terrain, weather, feedback collection and native clients remain separate roadmap items.
