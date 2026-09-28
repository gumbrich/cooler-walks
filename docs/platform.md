# Platform decision and verification

Checked 28 September 2026. One React/TypeScript website also provides an optional installable progressive web app. This keeps planning links immediately usable and shares the map, routing model, data and design. No native client or app-store release is included.

## Installation

The manifest provides a stable ID, name, standalone display mode, planner start URL, theme/background colours, 192/512 px icons and a separate maskable icon. The production build generates a versioned service worker. HTTPS is required on a deployed origin; localhost is accepted for development. These requirements were checked against the [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Chrome exposes an installation prompt when eligible. The app's install control uses that event where available and otherwise offers browser-specific guidance. Safari's Share → Add to Home Screen guidance is not represented as a tested installation path.

**Actually verified:** Google Chrome 153.0.8010.53 on macOS, using an isolated temporary profile and a visible browser window. The production build at `http://127.0.0.1:4173/` had zero manifest or installability errors. Chrome's DevTools PWA commands installed it, set its window preference, and launched it; the new window rendered working route results and reported `display-mode: standalone`. The test then uninstalled its isolated test app. This verifies actual installation and launch, but does not claim a manual click-through test of every browser installation menu. The report is [pwa-validation.json](pwa-validation.json), and the window capture is [screenshots/installed-app.png](screenshots/installed-app.png).

To repeat, start the production preview in one terminal, then run:

```sh
PWA_HEADFUL=1 npm run test:pwa
```

Optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome executable. Headless Chrome accepts installation but did not expose a standalone window in this environment; use a graphical session for this check. The test uses a temporary profile and does not access personal browser tabs or saved accounts.

## Offline behaviour

After the complete first cache installation, the bounded pilot's interface, fonts, map geometry and routing/model data work offline. No third-party tile or routing service is used. The first visit still requires a connection; interrupted installation cannot guarantee offline availability. Cached data is historical, visibly dated in the method view, and has no live closure or weather feed. Browser storage may be evicted. The app does not persist precise journeys.

Production testing blocked network requests, reloaded the page and verified route cards and the rendered map, then restored the connection and checked banner recovery. Chrome 153's network emulation resets `navigator.onLine` after a cached navigation while retaining request blocking, so the test reapplies the documented network-state override for the banner check. Static cache matching ignores `Vary` because these public, same-origin build files do not vary by request origin; this was necessary for cached module/CSS requests to survive offline reload under Vite's preview headers.

## Browser and design checks

- Chrome on macOS: real map rendering, worker calculations, local search using keyboard and pointer, date/time changes, zero detour, units, city switching, source dialog, denied location, failed-download recovery and night behaviour.
- Actual responsive captures at 390 × 844 phone, 820 × 1180 tablet and 1440 × 1000 desktop viewports. Entry, results and difficult states were inspected. Map endpoint framing, attribution, label backgrounds, contrast and enlarged-text spacing were refined from those captures.
- Axe WCAG 2 A/AA checks and a 200% text-size layout check passed in the tested entry/planner views. These automated checks are not a complete accessibility audit. Search and dialogs were exercised with keyboard input; reduced-motion styling and visible focus are implemented.
- Production build: map worker loading, offline reload, actual PWA installation and standalone launch verified separately from the development server.

A clean local clone of commit `23e9392` completed `npm ci`, all 19 model tests and the production build without raw data downloads. The main working copy also passed four browser tests, six real-route scenarios (including 0/5/10-minute budgets), formatting and whitespace checks. The clean install's dependency audit reported zero known vulnerabilities. GitHub Actions repeats installation, model/data checks, formatting, build and browser tests on Ubuntu with Node.js 22; its live results are available in the repository's Actions tab.

**Not tested:** physical iPhone/Android devices, Safari, Firefox, touch/keyboard behaviour on real mobile devices, outdoor legibility or field usability. Phone/tablet screenshots are viewport emulation, not device certification. WebGL is needed for the interactive map; a map error keeps textual routes available. Modern browser APIs are used, including workers, Temporal's bundled polyfill and `AbortSignal.any`/`timeout`; broader browser compatibility needs explicit testing.

## Performance and release limits

The pilot deliberately ships its small regional processed extracts (roughly 17 MB before compression). This makes routing independent of demo services and supports bounded offline use, but the bundle should be measured on lower-end phones and slow connections before release. Vite reports a large JavaScript bundle, primarily the map stack; code splitting and a smaller geometry format are the next performance work. The current screenshots use Chrome software WebGL rendering and do not establish mobile GPU performance.

The local preview is the delivered runtime. No public production domain is deployed. Deployment should add HTTPS, compression, long-lived caching for hashed assets and a short cache policy for the service worker, followed by installation/update tests on that actual origin.
