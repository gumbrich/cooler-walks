# Cooler Walks

A warmer kind of walking atlas: compare real pedestrian routes, greenery, waterside walks, calmer Zurich streets and experimental sun/shade estimates.

[Deutsch](README.de.md) · English / German website and app interface

**Status:** **Zurich is the primary focus**, with an expanded 21.81 km² walking area and official address search. **Basel, Munich and Cambridge (Massachusetts) are beta**. Cambridge follows its municipal boundary; the other cities cover central areas. These remain experimental services, not field-validated citywide routing. Zurich and Munich estimate building sun/shade; Cambridge and Basel offer greenery and water proximity only. Paris remains under review. Tree shade, terrain, weather, live closures and navigation are not included.

**German version:** [coolerwalks.ch/de/](https://coolerwalks.ch/de/) · switch EN/DE without losing your trip.

**Live website:** [coolerwalks.ch](https://coolerwalks.ch/) · [Open the planner](https://coolerwalks.ch/?view=planner)

## Run locally

Requires Node.js 22.12+ and npm. No API keys or accounts are needed. Browser downloads work on the same origin; native remote downloads use the optional setting in `.env.example`.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the entry page or **http://127.0.0.1:5173/?view=planner** for the planner. A returning browser opens the planner directly. Processed regional extracts are included, so a fresh checkout does not need to download the raw data. They total about 131 MB before compression; the browser loads one city at a time.

For the installable production build:

```sh
npm run build
npm run preview -- --port 4173
```

Open **http://127.0.0.1:4173/**. Localhost is a secure context for PWA development. Production hosting must use HTTPS and serve `dist/`, including the real `/privacy/` and `/support/` pages. Missing data/pack URLs must return 404, never the app HTML. Optional Sites hosting configuration is in `.openai/hosting.json`; no external Site has been registered.

## Domain, hosting and store preparation

**Launched on Netlify:** the website and its five map packs are public. `coolerwalks.ch` is registered with Infomaniak; the apex A record and `www` CNAME point to Netlify. The existing Free Legacy hosting plan is unchanged. The support contact is `knoerzerjohannes@protonmail.com`. Durable retention of native map downloads remains a prerequisite for store distribution.

```sh
npm run release:prepare         # checked website archive, matching packs and SHA-256 manifest
npm run release:serve           # preview with production-style headers at port 4181
npm run test:release:browser    # privacy/help accessibility, CSP and offline checks
```

The upload files are in ignored `release-artifacts/`. `release/site.json` now contains the public domain, contact and Netlify privacy details. Netlify automatically builds `main` using `netlify.toml`; the manual GitHub release-preparation workflow creates private artifacts only. See [domain/DNS and hosting instructions](docs/hosting.md), [Android/iOS store instructions](docs/app-stores.md) and [listing copy](release/store-listing.json). No store enrollment or submission has been made.

## What works

- **Zurich vehicle-count evidence:** 75 directional counters at 42 pilot sites. View 2025 weekday/hour averages near the selected route, measured-day completeness and numbered map markers. Counts are historical and sparse; they do not replace street-context ranking or imply zero traffic elsewhere. [Sources and preparation](docs/vehicle-counts.md).

- **Prefer calmer streets / Verkehrsberuhigt bevorzugen** in Zurich: current official pedestrian, Begegnungszone and Tempo-30 zones plus mapped main-road proximity. Reduces distance near main roads first, within the same detour limit. No live traffic counts, noise or safety rating. See [sources, model and real route result](docs/traffic.md).
- Full **English / German** interface, including source explanations, errors, downloads, static privacy/help and PWA metadata. Language changes preserve the current trip. [Localization guide](docs/localization.md).

- A locally rendered MapLibre map of actual OSM streets, buildings, water and parks; a visible coverage boundary, muted unsupported surroundings, “Show whole coverage” control and source attribution. Coverage is now 21.81 km² in Zurich, 8.90 km² in Munich, 18.46 km² in Cambridge and 10.25 km² in Basel; [the coverage report](docs/coverage-validation.json) checks routes beyond the previous pilots.
- Offline search across 56,704 real official Zurich addresses, including 21,318 inside the walking area, plus local streets and places. Enter a street/house number and optional postcode, or tap the map to choose a start, destination or stop. Outside-area addresses are labelled and cannot produce routes. Address points locate buildings, not verified entrances. [Source, coverage and preparation](docs/zurich-expansion.md).
- Fastest graph route and genuinely different alternatives within 0, 5 or 10 extra minutes; 5 minutes is the default.
- Up to three ordered stops, with search/map selection, reordering, removal and trip reversal. The extra-time budget applies to the whole trip through all stops; dwell time is excluded.
- Optional **Prefer waterside** routing and a separate measure of distance within 50 m of mapped surface water. Proximity does not establish views, bank access, drinking water or cooling.
- **Prefer shade / Prefer sun** in Zurich and Munich, including winter dates. Uses actual Swiss or Bavarian building geometry and solar position, sampled every 8 m at the selected departure instant. Unknown coverage cannot count as sunshine. Greenery remains a separate 15 m tree-proximity measure.
- Four city configurations with local sources, metric coordinate systems, coverage and IANA time zones. Cambridge uses America/New_York, independently of the device’s zone. Local date/time rejects ambiguous or skipped DST times. Metric/imperial display, a responsive phone sheet and source/coverage views are shared.
- PWA icons, manifest and installation guidance. The default Zurich bundle is cached first; other cities are cached when visited. A city’s map and routing downloads must finish online before offline use. Source data stays dated; no live updates are implied.

Use Bahnhofquai → Bürkliplatz on **21 June 2026**, compare **10:00, 14:00 and 18:00 Europe/Zurich**. The exact computed validation results are stored in [docs/route-validation.json](docs/route-validation.json). No examples use synthetic production routes.

For vehicle counts, use the same trip on **Monday 22 June 2026 at 14:00**, select **Fastest walk**, then open **Vehicle counts nearby**. Its three directional measuring points show rounded historical means of 310, 1,220 and 360 vehicles/hour for Mondays at 14:00 in 2025. The calmer alternative has no supported nearby counter; its vehicle volume is unknown.

- **Offline maps** manager: versioned, checksum-verified downloads with progress, cancellation, removal and offline reopening. Four larger pilot packs plus a compact 2 km² Munich Old Town pack. Browser IndexedDB and private native filesystem storage share the same format. See [download setup and limitations](docs/downloads.md).

## Native iOS and Android apps

The same planner now has native Capacitor projects, in addition to the browser/PWA. Native builds include all four map/data bundles, open directly in the planner, use native location permission on request, and handle safe areas and Android Back. They are development builds, not App Store or Google Play releases.

```sh
npm run native:sync          # build shared assets and sync both native projects
npm run native:android       # Android SDK 36 + Java 21; creates a debug APK
npm run native:open:android  # open Android Studio
npm run native:ios           # macOS + Xcode 26+ + installed iOS simulator platform
npm run native:open:ios      # open Xcode
```

Detailed setup, signing boundaries and offline behaviour are in [docs/mobile.md](docs/mobile.md). Actual platform test results are in [docs/platform.md](docs/platform.md). Signing credentials and generated native build outputs are ignored.

Android **0.7.0/build 5** compiled and passed offline address-search/routing, vehicle-count, German and beta city-switch checks in an Android 16 emulator. Its debug APK is available locally as `native-artifacts/cooler-walks-0.7.0-debug.apk`. The earlier 0.5.0 build passed twelve broader checks covering native permissions, Back/resume, all four cities offline and cold launch. iOS 0.7.0 compiles in GitHub Actions; the previous 0.5.0 build launched in English and German on the local iPhone 16e simulator. iOS count interactions and physical phones remain untested; neither app has been submitted to a store.

## Develop and verify

```sh
npm run check          # TypeScript and focused model tests
npm run data:verify    # real pairs in every pilot, sun/shade, water and detours
npm run build         # production build and offline cache manifest
npx playwright install chromium
npm run test:e2e       # real browser interactions and responsive screenshots
npm run format:check  # consistent source and documentation formatting
```

To use an existing Chrome executable for tests, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute path. On macOS this can be `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Browser tests run in an isolated profile. The test runner starts a local development server if needed. GitHub Actions runs the checks, build and browser tests on pushes and pull requests.

With the production preview running, `PWA_HEADFUL=1 npm run test:pwa` verifies offline reload, installation and a standalone launch in an isolated visible Chrome window. It uninstalls its test app afterwards. See [platform verification](docs/platform.md) for the tested macOS Chrome path and untested mobile platforms.

## Architecture

| Area                                                               | Location                                |
| ------------------------------------------------------------------ | --------------------------------------- |
| City identity, CRS, time zone, coverage, versions and capabilities | `src/lib/cities.ts`                     |
| Graph routing, candidate generation, coverage and exposure scoring | `src/lib/routing.ts`                    |
| Solar, projection and local-time functions                         | `src/lib/solar.ts`, `geo.ts`, `time.ts` |
| Background calculations, stale-response suppression                | `src/route-worker.ts`, `src/App.tsx`    |
| Cartography and local place search                                 | `src/components/`                       |
| Reproducible ingestion, geometry extraction and verification       | `scripts/`                              |
| Derived runtime data                                               | `public/data/`                          |
| Untracked source downloads                                         | `data/raw/`                             |

The browser makes no third-party search, route, tile or font requests. Your precise journey is not saved. City, selected area, language, units, the returning-user preference and explicit map downloads are stored locally. An optional native data host receives requests for public area files, never journey inputs. Geolocation is requested on demand; the browser's own location provider may contact external services.

## Data and limitations

Read [data sources and preparation](docs/data-sources.md), [the model](docs/model.md), [city coverage](docs/cities.md), [design](docs/design.md), [platform checks](docs/platform.md), and [roadmap](docs/roadmap.md).

The building model uses footprints extruded to maximum roof height above local minimum ground, with preserved courtyards and a flat-ground approximation. Slopes, roof shape and changing height along the walk affect real shadows. Centreline geometry does not establish which pavement is shaded. The model is not field-validated and provides no measured temperature or comfort benefit.

The walking extract follows recorded pedestrian access and shared OSM node topology. It does not know current closures, crossing waits or unrecorded access changes. It is not an accessibility or turn-by-turn navigation service. Below 10° solar elevation and outside adequate source coverage, the interface uses greenery rather than an unsupported shade recommendation.

The [Zurich tree-position audit](docs/tree-accuracy.md) checks import fidelity and compares older register IDs with a fresh municipal sample. Munich trees are automatically detected positions, with documented false-positive risks; Cambridge and Basel use municipal registers. Sun/shade percentages remain **buildings only**. Sun preference is manual in every season. Low winter sun and tile-edge coverage can prevent a comparison; this is shown explicitly.

Real route checks for every pilot are in [city-route-validation.json](docs/city-route-validation.json), with expanded-area journeys in [coverage-validation.json](docs/coverage-validation.json). Use the selected city’s default trip on **21 June 2026 at 14:00 local time** as a repeatable starting point. Cambridge’s missing building heights and Basel’s unintegrated height layer are documented in [the coverage register](docs/cities.md).

## Screenshots

Version 0.7.0: [Address search on desktop](docs/screenshots/desktop-zurich-addresses.png), [German phone search](docs/screenshots/phone-zurich-search.png), [expanded-area walk](docs/screenshots/phone-zurich-expanded.png) and [outside-area state](docs/screenshots/tablet-zurich-outside.png), [installed map selection](docs/screenshots/installed-map-selection.png) and [Android address planning](docs/screenshots/android-zurich-addresses.png).

Vehicle-count views: [Vehicle counts on desktop](docs/screenshots/desktop-vehicle-counts.png), [German phone](docs/screenshots/phone-vehicle-counts.png), [missing observations](docs/screenshots/tablet-counts-unavailable.png), [Android counts](docs/screenshots/android-vehicle-counts.png) and [installed PWA counts](docs/screenshots/installed-vehicle-counts.png).

German interface views: [German desktop comparison](docs/screenshots/desktop-german-calm.png), [German phone](docs/screenshots/phone-german-calm.png), [German entry](docs/screenshots/desktop-german-home.png), [recoverable error state](docs/screenshots/tablet-german-error.png), [installed German PWA](docs/screenshots/installed-german-app.png), [Android calmer route](docs/screenshots/android-german-calm.png) and [German iOS launch](docs/screenshots/ios-v050-german.png).

Actual browser, Android emulator and iOS simulator captures are in [docs/screenshots](docs/screenshots), including [expanded Cambridge on desktop](docs/screenshots/desktop-expanded-cambridge.png) and [offline Munich in the native app](docs/screenshots/android-offline-munich.png). The [download manager](docs/screenshots/desktop-downloads.png) and [compact Munich phone view](docs/screenshots/phone-downloaded-area.png) show the new flow. They document visual review, not physical-device or field validation.

![Desktop planner](docs/screenshots/desktop-planner.png)

<img src="docs/screenshots/phone-planner.png" alt="Phone planner" width="390" />

## Licensing

Code: [MIT](LICENSE). Geographic data retains its source licences; see [public/data/README.md](public/data/README.md). In particular OSM-derived data is subject to ODbL, rather than the code licence. Fonts retain their respective open font licences. Keep attribution visible when reusing or deploying the app.
