# Platform decision and verification

Checked 29 September 2026 (Europe/Zurich). One React/TypeScript website also provides an optional installable progressive web app. This keeps planning links immediately usable and shares the map, routing model, data and design. The requested native iOS and Android development projects now reuse this code through Capacitor 8.5.2. No app-store release is included; see [mobile.md](mobile.md) for setup and release boundaries.

## Installation

The manifest provides a stable ID, name, standalone display mode, planner start URL, theme/background colours, 192/512 px icons and a separate maskable icon. The production build generates a versioned service worker. HTTPS is required on a deployed origin; localhost is accepted for development. These requirements were checked against the [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Chrome exposes an installation prompt when eligible. The app's install control uses that event where available and otherwise offers browser-specific guidance. Safari's Share → Add to Home Screen guidance is not represented as a tested installation path.

**Actually verified:** Google Chrome 154.0.8037.58 on macOS (latest download milestone; earlier checks used Chrome 153), using an isolated temporary profile and a visible browser window. The production build at `http://127.0.0.1:4173/` had zero manifest or installability errors. Chrome's DevTools PWA commands installed it, set its window preference, and launched it; the new window rendered working route results and reported `display-mode: standalone`. The test then uninstalled its isolated test app. This verifies actual installation and launch, but does not claim a manual click-through test of every browser installation menu. The report is [pwa-validation.json](pwa-validation.json), and the window capture is [screenshots/installed-app.png](screenshots/installed-app.png).

To repeat, start the production preview in one terminal, then run:

```sh
PWA_HEADFUL=1 npm run test:pwa
```

Optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome executable. Headless Chrome accepts installation but did not expose a standalone window in this environment; use a graphical session for this check. The test uses a temporary profile and does not access personal browser tabs or saved accounts.

## Offline behaviour

After the first cache installation, the interface, fonts and default Zurich bundle work offline. Other cities are cached on visit, including a handoff after first worker activation. Both map and routing downloads must complete before that city can be used offline. Unvisited city data is not prefetched. No third-party tile or routing service is used. The first visit still requires a connection; interrupted installation cannot guarantee offline availability. Cached data is historical, visibly dated in the method view, and has no live closure or weather feed. Browser storage may be evicted. The app does not persist precise journeys.

Production testing blocked network requests, reloaded the page and verified route cards, the rendered map, waterside preference and an intermediate stop, then switched to the previously saved Basel map/routes. An unvisited Cambridge request correctly failed offline; after reconnecting, selecting Cambridge restored both its map and routes. The test also verified that Cambridge had not been unnecessarily precached. Chrome 153's network emulation resets `navigator.onLine` after a cached navigation while retaining request blocking, so the test reapplies the documented network-state override for the banner check. Static cache matching ignores `Vary` because these public, same-origin build files do not vary by request origin; this was necessary for cached module/CSS requests to survive offline reload under Vite's preview headers.

## Browser and design checks

- Chrome on macOS: real map rendering, worker calculations, local search using keyboard and pointer, date/time changes, zero detour, waterside preference, adding/reordering/removing stops, units, city switching, city-specific capabilities and source labels, New York local time, sun preference in winter, source dialog, denied location, failed-download recovery and night behaviour.
- Actual responsive captures at 390 × 844 phone, 820 × 1180 tablet and 1440 × 1000 desktop viewports. Entry, results and difficult states were inspected. Map endpoint framing, attribution, label backgrounds, contrast and enlarged-text spacing were refined from those captures. New checks ensure endpoint markers stay inside the map and clear of the city label, toolbar and legend; resized phone maps reframe immediately.
- Axe WCAG 2 A/AA checks and a 200% text-size layout check passed in the tested entry/planner views. These automated checks are not a complete accessibility audit. Search and dialogs were exercised with keyboard input; reduced-motion styling and visible focus are implemented.
- Production build: map worker loading, offline reload, actual PWA installation and standalone launch verified separately from the development server.

A clean local clone of commit `23e9392` completed `npm ci`, its 19 model tests and the production build without raw data downloads. The coverage/mobile follow-up passes **42 focused model/download tests and twelve browser tests** across the four pilots, plus real-data checks for original Zurich scenarios, water/stops, every city’s configured reference route and six expanded-area trips. Projection checks include independent PROJ values and true-north/grid-north rotation; time checks include Cambridge’s distinct DST transitions. Zero detour, moving shadows, sun preference and honest missing-coverage behaviour were verified. The native follow-up adds Capacitor and its app/location/splash plugins. A scoped override upgrades the CLI’s Xcode parser to compatible UUID 11, resolving its development-only advisory; both full and production-only npm audits report zero known vulnerabilities. GitHub Actions repeats installation, model/data checks, formatting, build and browser tests on Ubuntu with Node.js 22; its live results are available in the repository's Actions tab.

**Not tested:** physical iPhone/Android devices, Safari, Firefox, touch/keyboard behaviour on real mobile devices, outdoor legibility or field usability. Phone/tablet screenshots are viewport emulation, not device certification. WebGL is needed for the interactive map; a map error keeps textual routes available. Modern browser APIs are used, including workers, Temporal's bundled polyfill and `AbortSignal.any`/`timeout`; broader browser compatibility needs explicit testing.

Browser tests allow 180 seconds per complete multi-step flow on CI (90 seconds locally), with the same 45-second individual assertion limit. Two flows initially exhausted the 90-second total during a screenshot and the final city-switch check on the shared Linux runner. This test allowance is not a product responsiveness target; actual phone performance still needs measurement.

Browser checks now use Playwright's full `chromium` channel, matching normal Chrome's headless compositor. Failure traces are kept for seven days in private CI artifacts. A later Linux failure was traced to the download dialog's italic font request remaining pending when network interception was enabled during loading; the error test now installs its interception before navigation. It still checks cancellation, the visible 503 error, its tablet screenshot, successful retry and retention of the existing IndexedDB record after an aborted write. No assertion or screenshot is skipped.

## Performance and release limits

Each city has a separate processed map/model bundle. Expanded data totals approximately 97 MB uncompressed across all four cities; only the selected city loads into the browser. For the website/PWA, additional city files are downloaded on demand, not all at installation. Default native builds package all four bundles for immediate offline use; the lite build includes Zurich and downloads selected areas. This makes routing independent of demo services and supports bounded offline use, but the bundle should be measured on lower-end phones and slow connections before release. Vite reports a large JavaScript bundle, primarily the map stack; code splitting and a smaller geometry format are the next performance work. The current screenshots use Chrome software WebGL rendering and do not establish mobile GPU performance.

The website is deployed at https://coolerwalks.ch/ with valid HTTPS, production security/cache headers and all five verified downloads. See [the hosting record](hosting.md) for exact source, DNS and validation.

## Coverage and native follow-up

The enlarged graphs pass six new real journeys with endpoints outside the old coverage, plus full graph-edge checks against rectangles or Cambridge’s municipal polygon. Results are in `coverage-validation.json`; the separate source/model manifests retain all provenance. Unknown Munich structures have dedicated model tests. Candidate searches use a conservative distance lower bound to keep short trips responsive in larger graphs.

The native project uses an Android debug build job on GitHub Actions in addition to existing web/model checks. It explicitly sets up the Android SDK and does not publish an app or use release-signing credentials.

**Android actually verified:** the debug APK compiled, installed and launched in an isolated Pixel 8 AVD running Android 16 (API 36.1, ARM64), with Android System WebView 134.0.6998.135. Eleven integration checks passed: native launch and local worker routes, no service worker, information/editing Back handling, native location denial with preserved inputs, maps/routes in all four cities with Wi-Fi/mobile data disabled, winter sun preference offline, root Back/minimize/resume, no horizontal overflow, and a cold offline relaunch remembering the city. No page errors were recorded. Source and test details are in [native-validation.json](native-validation.json) and [mobile.md](mobile.md). Actual emulator screenshots include [offline Munich](screenshots/android-offline-munich.png) and [offline Cambridge](screenshots/android-offline-cambridge.png). Screenshot review caught and corrected pale system icons on the light header. The current debug APK is about 29 MB; it is available locally under `native-artifacts/` and as a private CI artifact after a successful native job. No physical-device or App Store/Play Store validation is implied.

**iOS simulator:** the new GitHub Actions macOS 26 workflow successfully compiles an unsigned ARM64 simulator app. Its downloaded artifact installed and launched on the local iPhone 16e / iOS 26.1 simulator, displaying the actual Zurich route and building-shade model with readable safe areas. This is a native WKWebView launch, not a browser viewport screenshot. Physical iPhone testing is still unperformed. Local Xcode's matching 26.2 runtime can be downloaded with an explicit `-architectureVariant arm64`; see `mobile.md`.

## Download follow-up

The explicit map manager packages four larger pilots and one smaller Munich area. Browser tests check verified persistence, blocked-network data reuse, area switching, cancellation, service failure/retry, removal, a real IndexedDB transaction rollback and an automated dialog accessibility scan. Model tests reject truncated, oversized, tampered or incompatible packs and cancelled/quota-failed installation. Generated catalogue metadata and real routing are checked independently of UI fixtures. Native download tests use the actual Filesystem bridge and an isolated emulator, with a local loopback server that is removed before the cold offline restart. Production HTTPS hosting, device-memory pressure and OS interruption during file writes remain release tests. See `downloads.md`.

The latest production PWA run also saved the compact Munich pack, reopened it with all networking blocked, cold-reloaded its map and route, and then installed/launched the app standalone. Both manifest and installability checks were clear, with zero page errors. The six native download checks in [native-download-validation.json](native-download-validation.json) passed in addition to the eleven full-bundle native checks.

The iOS check is deliberately narrower than Android: native compile/install/launch, a real Zurich route, the information view and the four-area inventory were verified. iOS download writes, cold offline restart, permissions, long-dialog touch scrolling and keyboard interaction are still unverified. See [ios-validation.json](ios-validation.json). Physical-phone testing was explicitly deferred by the user for this delivery.

## Public-domain verification — 29 September 2026

Chrome 154.0.8037.58 on macOS verified https://coolerwalks.ch/ after DNS and TLS provisioning. All five hosted pack checksums/lengths/native CORS passed; HTTP and `www` redirect to the HTTPS apex. Three release browser scenarios passed against the final domain, including real production CSP with zero reported violations, no-JavaScript support/privacy pages, automated accessibility and 200% text, offline privacy and a true 404. The identical Netlify deployment also passed the existing desktop planner and phone/tablet interaction flows; screenshots were recaptured and inspected.

The final-origin PWA test installed and launched standalone, saved a genuine Munich pack and cold-reopened its routes/map offline. Offline waterside/stops, cached-city switching, unvisited-city failure and network recovery passed with zero page errors. See [pwa-validation.json](pwa-validation.json). Expected failed requests during deliberate offline tests are not live service failures. This is macOS Chrome verification; the previously listed physical-device and Safari/iOS gaps remain.
