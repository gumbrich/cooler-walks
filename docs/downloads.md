# Downloadable walking areas

Version 0.4 adds an offline-map manager for the website/PWA and the shared native app. Open **Offline maps** below the route comparison. Download an area, then choose **Use this area**. The selected area is remembered; the map shows its actual routing boundary. Switching the city selector returns to that city's larger pilot. Downloads never expand environmental coverage beyond verified source data.

| Area                              | Supported footprint | Compressed download |
| --------------------------------- | ------------------- | ------------------- |
| Zurich, central pilot             | 8.06 km²            | 3.8 MB              |
| Munich, Old Town, Lehel & gardens | 8.90 km²            | 4.4 MB              |
| Munich, Old Town essentials       | 2.00 km²            | 2.3 MB              |
| Cambridge, MA, municipal boundary | 18.46 km²           | 6.8 MB              |
| Basel, central pilot & Kleinbasel | 10.25 km²           | 2.0 MB              |

Sizes describe compressed packs, not total working memory or all app/browser storage. The smaller Munich rectangle is an optional download area, not an administrative district or a replacement for the larger pilot. Its graph has 5,382 nodes and 6,038 edges. A real Karlsplatz–Odeonsplatz reference walk is 1.236 km; the evaluated alternative at 14:00 local on 21 June takes 2.43 extra minutes. See `area-pack-validation.json`. Zurich/Munich estimate building shade; Cambridge/Basel remain greenery prototypes. Tree shade, terrain, weather and live closures are absent.

## Preparation and deployment

`npm run data:packs` reproducibly creates gzip-compressed `.cwp` files from the checked-in derived data. It runs automatically before development, checks and production builds. Raw source ingestion is unchanged. Packs are ignored by Git; the small version/checksum catalogue in `src/generated/area-catalog.json` is tracked. A pack contains its walking graph, places, source provenance, environmental geometry and local GeoJSON map. Smaller-area graphs preserve OSM connectivity and retain surrounding environmental geometry for incoming shadows. The map is clipped more loosely for visual context. Source observation dates are preserved: a pack preparation date is not a new tree survey.

Publish the exact pack files produced alongside the native app catalogue. Compression can differ between Node/zlib versions and operating systems (including the gzip OS header); do not regenerate server packs in a different environment and assume their content-hashed filenames match an already built app. Use Node 22 consistently for a release pipeline.

The catalogue fixes a schema, source/model version, area, SHA-256 digest, compressed size and expanded size. The client bounds streamed bytes, verifies the digest, decompresses within a limit and checks city/version/geometry metadata before committing. Downloads time out after three minutes, can be cancelled before committing, and expose service/storage errors. Failed verification cannot publish a replacement. Data updates require a reviewed compatible catalogue/app version; an incompatible saved pack is explicitly marked for update. There is no background update service yet.

Browser builds serve packs from `/packs/` by default. Deploy the complete `dist/` directory over HTTPS. Do not set `Content-Encoding: gzip` on `.cwp`: the app decompresses the package itself. Use `application/octet-stream`, correct `Content-Length`, immutable caching for content-hashed filenames, and retain older hashes while older app versions remain supported. The service worker excludes packs to avoid saving them twice.

For native downloads, set `VITE_AREA_BASE_URL` to the HTTPS directory holding these same public files **before building**. A separate host must allow CORS from `https://localhost` (Android) and `capacitor://localhost` (iOS); `Access-Control-Allow-Origin: *` is suitable for these public, credential-free files. Keep data attribution/licences available. No API token is needed or embedded. This repository has no public download host configured; ordinary native builds include all four larger areas and label extra downloads as unavailable.

```sh
# Full native app: all four existing areas included, optional extra downloads
VITE_AREA_BASE_URL=https://your-data-host.example/packs/ npm run native:sync

# Smaller initial app: only Zurich included, other areas downloaded explicitly
VITE_AREA_BASE_URL=https://your-data-host.example/packs/ npm run native:sync:lite
npm run native:android
```

The HTTPS address above is a placeholder to replace with your actual static host. `native-web/` is generated staging: its inventory lists included areas and it excludes web service-worker/pack assets. Full and lite builds share the same interface and native application ID; a lite APK is a development build mode, not a separately published app.

## Storage and removal

Browser packs use one IndexedDB transaction for metadata and bytes; a transaction abort retains the previous version. Native packs use Capacitor Filesystem's private `LibraryNoCloud` directory (Android internal app storage; iOS Library/NoCloud). Each write gets a unique filename and an atomic metadata commit marker. Older committed files are cleaned only after the replacement is published. No storage permission or cloud backup is needed. An iOS file-timestamp privacy reason is included for the plugin's app-owned file operations.

**Remove** frees the saved pack; an already open walk remains in memory until leaving/reloading. Included native maps cannot be removed independently. Browser caches of recently opened maps are separate and may remain after removing a manual download. Browsers can also evict saved packs under storage pressure; the UI discloses this. Deleting app data/uninstalling the native app removes downloads. No precise journey history is stored.

## Local native download test

Use only the dedicated `CoolerWalks_Test` emulator: the automated checks clear that app's test data and temporarily disable the emulator network. They refuse physical phones. Start the pack server in a separate terminal:

```sh
npm run data:packs
npm run data:serve
```

Then build the loopback-only development configuration:

```sh
VITE_AREA_BASE_URL=http://localhost:4180/packs/ COOLER_DEV_DOWNLOADS=1 npm run native:sync:lite
npm run native:android
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
npm run test:native:downloads
```

The test sets up ADB reverse for port 4180, downloads the compact Munich pack, verifies private filesystem storage and real routes, removes the reverse connection, disables Wi-Fi/mobile data, cold-restarts the app and checks offline routes. Finally it verifies removal and restores emulator network settings. HTTP/mixed content is enabled only by this explicit development flag. Run ordinary `npm run native:sync` and rebuild before distributing the normal app. The development URL is not a production service.

Physical-device performance, interruption by OS termination during a write, very low disk space, production-host update rollout and migration across model revisions still require release testing.

## Zurich 0.8 expansion

The current Zurich pack covers the municipality-clipped 57.77 km² area. It is approximately **16.8 MB compressed / 100.1 MB expanded**, including official addresses and conservative shade-coverage data. The running app validates the complete pack against its compiled catalogue and does not mix old and new graph versions. Ordinary-device memory/performance testing remains necessary; a successful desktop/emulator result is not a physical-phone benchmark.

In 0.8.0, opening a saved area transfers its compressed bytes to the routing worker for checksum verification and decoding. This avoids keeping the complete routing model in both the interface and worker. Download installation still verifies the same bounded, checksummed format and retains the existing atomic storage rules.

In 0.9.0, arrival-time shadow calculations are part of the shared application code. The source geometry and all area-pack versions remain unchanged; saved areas work with the new model after the app updates. This does not turn saved traffic profiles into live data.
