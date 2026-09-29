# Progress

## Current milestone: domain and store-release preparation

Added Netlify build configuration, a locally checked upload archive, security/cache/CORS headers, real 404s, hosted smoke checks and standalone privacy/help pages. The provided support email is configured. `coolerwalks.ch` is now registered in the owner's Infomaniak account and configured as the intended public origin. The hosting guide explains the current 31 MB Cambridge asset constraint and durable retention of native map packs.

Infomaniak confirms the domain-registration order completed on 29 September; the official registry independently confirms registration. Netlify sign-in is complete and the existing Free Legacy plan is verified. No DNS change or website deployment has occurred yet. The public build now includes the selected domain and Netlify privacy details and passes the three release browser checks.

The pre-launch check uncovered Linux browser-test failures. Full Chromium and request interception installed before page loading resolve them without removing assertions or screenshots. [Complete CI validation passed](https://github.com/gumbrich/cooler-walks/actions/runs/36614132370) on `ac58a9a`, including all twelve browser scenarios; Android and iOS builds passed for that revision too.

Prepared Android upload-key signing and unsigned AAB builds, iOS archive commands, private CI artifacts, listing copy and current store submission instructions. Public deployment remains intentionally blocked until the owned domain and actual host privacy details are filled. Store enrollment, signing and final hosted testing remain separate steps. See [hosting.md](hosting.md) and [app-stores.md](app-stores.md).

Release checks passed locally: 45 unit/model checks, three production-style browser scenarios (CSP, no-JavaScript help/privacy, accessibility, 200% text and offline privacy navigation), five served pack checksums/CORS checks, and three Android public-page navigation checks. Actual phone/desktop/tablet screenshots are included. Android AAB and iOS unsigned archive packaging also passed CI. Emulator testing exposed and fixed Capacitor's folder-URL fallback for the new pages; explicit bundled HTML links now return to the working planner.

## Working application

Implemented an explicit **Prefer shade / Prefer sun** choice for building-enabled cities, preserving the single 0/5/10-minute detour limit. Sun preference uses a higher known sunny share and conservatively accounts for missing data; it does not reward a longer walk merely for accumulating more sun. Winter date changes already affect building geometry. No universal seasonal switch, tree foliage or weather model is implied.

Real public sources now support bounded pilots in **Zurich, Munich, Cambridge (MA) and Basel**. Zurich and Munich offer experimental building sun/shade. Cambridge and Basel are explicitly greenery/water prototypes; their building-height integration blockers are documented. Paris remains under review. Each city uses its own source attribution, CRS, IANA time zone, coverage and version, through shared search, mapping and routing modules.

The Munich adapter now verifies four adjacent LoD2 tiles and 19,529 geometry parts. It conservatively masks 61 unsupported/elevated or conflicting objects; 19,468 accepted height comparisons agree within 0.013 m. Its tree layer uses actual automatic detections with false-positive caveats. Cambridge excludes 12,039 non-Tree site records before clipping; Basel uses its maintained-tree register and a complete cross-border Rhine relation. See city data manifests and the coverage register. Raw source downloads remain ignored; checked-in derived extracts make ordinary setup self-contained.

The map now accounts for projected-grid rotation when using true-north solar bearings, and explicit pedestrian direction restrictions are excluded from the bidirectional graph. Browser review improved phone resizing and endpoint clearance from map controls. Each additional city is cached only when visited; unavailable offline cities fail clearly and recover with both routes and maps after reconnection.

Validation: TypeScript, focused model tests, real route comparisons in all four pilots, responsive browser interactions, accessibility/enlarged text, source formatting and production build. Chrome on macOS also verified offline reload, cached-city switching, unvisited-city failure/recovery, actual PWA installation and standalone launch. Reports and actual desktop/phone/tablet screenshots are included; see platform.md for exact counts and untested platforms.

Private maintained repository: https://github.com/gumbrich/cooler-walks. The delivered runtime remains the local preview; no public production domain has been deployed.

## Expanded areas

Zurich: 8.06 km² (1.81× the old pilot); Munich: 8.90 km² (4.44×); Cambridge: 18.46 km² (4.95×), using its municipal polygon; Basel: 10.25 km² (2.14×). All graph segments stay inside supported coverage, including narrow gaps and holes. Six new journeys and the existing reference trips validate real routes, alternatives and detour limits. Larger Munich surroundings also enable the tested winter sun comparison.

A whole-coverage map action and quieter city-scale cartography make these limits visible. Unsupported surroundings are muted. Native Capacitor projects share the complete planner and bundle all city data for offline use, with native location permission, Android Back, app icons and safe areas. The Android debug APK built and passed eleven emulator integration checks, including native permission denial, every city offline, winter sun and a cold offline restart. Actual emulator screenshots are included. Setup and the iOS CI build are in `mobile.md`; validation is recorded in `platform.md`.

## Downloadable areas

Added five reproducible packs, SHA-256 and size/schema verification, progress/cancellation, storage errors and removal. Browser packs use IndexedDB; native packs use private filesystem storage. Four larger areas remain included in the default native app. An optional Zurich-only build downloads other areas from a configured HTTPS origin. The 2 km² Munich Old Town pack demonstrates a smaller real graph and shared routing/shade model. The iOS build now passes on GitHub and runs in the local iPhone simulator. Validation includes 42 model/download tests, twelve browser scenarios, eleven full-bundle Android checks and six native download checks; the PWA installs and cold-reopens a downloaded area offline. iOS validation is scoped to compile/install/launch, real Zurich results and the included-area inventory. See `downloads.md` for data hosting and update boundaries.

## Next useful milestone

Complete Netlify sign-in, confirm host privacy details, connect the registered domain and deploy the website/pack host, then create a signed internal tester build. Physical-phone testing was deferred at the user’s request. Benchmark memory, download recovery and map rendering on lower-end phones before further city expansion. Validate dated shadows and route access in the street; normalize Cambridge’s height units/unknown-height masks and add Basel building heights. Tree shade, terrain and weather remain separate roadmap items. Help pages now provide email feedback without a public posting system.
