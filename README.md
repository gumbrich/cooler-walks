# Cooler Walks

A warmer kind of walking atlas: compare real pedestrian routes, recorded greenery and experimental building-shade estimates in central Zurich.

**Status:** a bounded Zurich pilot, not a validated citywide service. Paris is a researched expansion candidate, with no route recommendations yet. Tree shade, terrain, weather, live closures and navigation are not included.

## Run locally

Requires Node.js 22.12+ and npm. No API keys, accounts or runtime environment variables are needed.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the entry page or **http://127.0.0.1:5173/?view=planner** for the planner. A returning browser opens the planner directly. The small, processed pilot extracts are included, so a fresh checkout does not need to download the raw data.

For the installable production build:

```sh
npm run build
npm run preview -- --port 4173
```

Open **http://127.0.0.1:4173/**. Localhost is a secure context for PWA development. Production hosting must use HTTPS and serve `dist/`, with an index fallback for navigation. Optional Sites hosting configuration is in `.openai/hosting.json`; no external Site has been registered. This delivery uses the requested GitHub project and local preview.

## What works

- A locally rendered MapLibre map of actual OSM streets, buildings, water and parks; a visible pilot boundary and source attribution.
- Search among pilot streets and places, explicit map selection, optional geolocation, and endpoint swapping. Place results refer to mapped paths near their source locations; this is not a global address geocoder.
- Fastest graph route and genuinely different alternatives within 0, 5 or 10 extra minutes; 5 minutes is the default.
- Estimated building shade from actual Swiss building geometry and solar position, sampled every 8 m at the selected departure instant. Greenery remains a separate 15 m tree-proximity measure.
- Local date/time with explicit DST ambiguity handling, metric/imperial display, a responsive phone sheet, source/coverage views and a capability-disabled Paris view.
- PWA icons, manifest, supported-browser installation guidance and a generated service worker. After its first successful cache installation, the complete bounded map and routing bundle can be used offline. Source data stays dated; no live updates are implied.

Use Bahnhofquai → Bürkliplatz on **21 June 2026**, compare **10:00, 14:00 and 18:00 Europe/Zurich**. The exact computed validation results are stored in [docs/route-validation.json](docs/route-validation.json). No examples use synthetic production routes.

## Develop and verify

```sh
npm run check          # TypeScript and focused model tests
npm run data:verify    # real Zurich pair, detours, changing shade and night
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
| Small derived runtime data                                         | `public/data/`                          |
| Untracked source downloads                                         | `data/raw/`                             |

The browser makes no third-party search, route, tile or font requests. Your precise journey is not saved. Only city, units and the returning-user preference are stored locally. Geolocation is requested on demand; the browser's own location provider may contact external services.

## Data and limitations

Read [data sources and preparation](docs/data-sources.md), [the model](docs/model.md), [city coverage](docs/cities.md), [design](docs/design.md), [platform checks](docs/platform.md), and [roadmap](docs/roadmap.md).

The building model uses footprints extruded to maximum roof height above local minimum ground, with preserved courtyards and a flat-ground approximation. Slopes, roof shape and changing height along the walk affect real shadows. Centreline geometry does not establish which pavement is shaded. The model is not field-validated and provides no measured temperature or comfort benefit.

The walking extract follows recorded pedestrian access and shared OSM node topology. It does not know current closures, crossing waits or unrecorded access changes. It is not an accessibility or turn-by-turn navigation service. Below 10° solar elevation and outside adequate source coverage, the interface uses greenery rather than an unsupported shade recommendation.

## Screenshots

Actual browser captures are in [docs/screenshots](docs/screenshots). They document visual review, not physical-device or field validation.

![Desktop planner](docs/screenshots/desktop-planner.png)

<img src="docs/screenshots/phone-planner.png" alt="Phone planner" width="390" />

## Licensing

Code: [MIT](LICENSE). Geographic data retains its source licences; see [public/data/README.md](public/data/README.md). In particular OSM-derived data is subject to ODbL, rather than the code licence. Fonts retain their respective open font licences. Keep attribution visible when reusing or deploying the app.
