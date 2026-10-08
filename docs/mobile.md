# Native mobile development

Cooler Walks now has **iOS and Android development projects**, alongside its existing website and installable PWA. They use [Capacitor 8](https://capacitorjs.com/docs): the same React planner, local MapLibre maps, route worker and geographic data run inside a native WebView. There is no second routing implementation or hosted website URL hidden inside the app.

The user requested a mobile app in addition to the browser. A shared native container is the smallest maintainable step: it supports ordinary app installation and native location permissions while preserving the existing tested model. It still requires maintaining two SDK projects, native dependency updates, platform testing and separate release signing. It is not a fully native map renderer or a store release.

## Implemented

- Native projects in `ios/` and `android/`, with application ID `io.github.gumbrich.coolerwalks`, version 0.19.0 / build 18.
- Direct launch into the planner; selected city and units remembered locally.
- All four city map/model bundles packaged by default; an optional lite build includes Zurich and downloads other areas. See [downloads.md](downloads.md). Planning does not need a first online visit. Native builds do not register the website service worker.
- Native one-shot location permission only after “Use my location”; no background tracking. Denial preserves the trip and offers map/search input. A late location response cannot replace inputs after a city change.
- Android Back closes information/editing/map selection first, then minimizes the root planner. It does not silently erase a trip.
- Safe-area handling for iOS and Android edge-to-edge WebViews, including Capacitor’s fallback insets for older Android WebViews. Standard browser keyboard zoom remains enabled.
- Shared brand mark, app icons, launch artwork and an in-app information view. Artwork is reproducibly rendered from `public/icon.svg`.
- Source attribution, coverage and model limitations remain available offline. No API keys or journey analytics are included. Precise trips are not persisted; Android backup is disabled.

## Build and run

Install Node.js 22.12+, then use the checked-in npm lockfile:

```sh
npm ci
npm run native:sync
```

This builds the website assets, renders native artwork and synchronizes both projects. Repeat after changes to shared code, data or plugins. Copied web bundles and native build outputs are ignored by Git; native source projects and the Swift package resolution are tracked.

**Android:** Android Studio Otter 2025.2.1+ / Android SDK 36 and Java 21 are required by the selected SDK generation. `native:android` uses Android Studio’s bundled Java automatically on macOS; otherwise set `JAVA_HOME`. Set `ANDROID_HOME` when the SDK is not in `~/Library/Android/sdk`.

```sh
npm run native:android
npm run native:open:android
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Select an emulator or connected development phone in Android Studio and Run. For an already running emulator, `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` installs the debug build. No store account is needed for local Android development.

**iOS:** macOS, Xcode 26+ and an enabled iOS platform/simulator are required. Swift Package Manager resolves native dependencies; CocoaPods is not required.

```sh
npm run native:ios
npm run native:open:ios
```

The command builds an unsigned simulator app in `ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`. For a physical iPhone, open Xcode, choose your development team under Signing & Capabilities, select the device, and Run. Certificates, provisioning profiles and signing keys must stay outside Git.

See [Capacitor’s environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup) and [Apple’s platform installation guide](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components).

## Verification and current release boundary

Shared TypeScript, routing, real-data and browser checks cover the planner. Native verification results and platform limitations are recorded in [platform.md](platform.md). Browser viewport screenshots do not count as native-device tests.

Current **0.19.0/build 18** adds Zurich flatter routes and elevation profiles to the shared planner. The tested APK is `native-artifacts/cooler-walks-0.19.0-debug.apk`, SHA-256 `7565592232d10a1721f58ca4eecb25c2f5e55a806c11ee5de92ed668616b9089`. `npm run test:native:elevation` passes on the dedicated 2 GB Android 36.1 emulator, including real hilly routes, German/English, profiles and offline preference/budget changes. Both native projects are synchronized. Physical-phone and current iOS interaction tests remain outstanding. [Current evidence](platform.md#elevation-preference--0190).

The earlier 0.8.0/build 6 packaged the 57.77 km² Zurich map and official address index. Worker-owned geometry loading, viewport tree rendering and explicit navigation cleanup address the larger model’s Android memory pressure. `npm run test:native:counts` now also verifies address search and routing offline, alongside a fixed Monday 14:00 count reference, German text and beta city-switch cleanup on the dedicated emulator. These checks pass with zero page errors; the archived report is `docs/releases/0.8.0-native-counts-validation.json` and the tested APK is `native-artifacts/cooler-walks-0.8.0-debug.apk` locally. Physical phones and current iOS interactions remain untested.

The Android workflow builds a debug APK and unsigned AAB. Artifact uploads are opt-in, require available storage and use three-day retention. It builds `:app:assembleDebug`, not every dependency's distributable library. Local builds use the same target. This is a development-signed APK, not a signed production release.

For native interaction checks, create an isolated Android Studio virtual device named **CoolerWalks_Test**, start it, and install the debug APK. Disconnect other devices before running the test:

```sh
npx playwright install android
npm run test:native:android
```

Set `COOLER_ANDROID_SERIAL` if its ADB serial differs from `emulator-5554`. The test deliberately refuses physical devices or a differently named emulator. It resets Cooler Walks' test app data, exercises native Back and location denial, temporarily disables the emulator's network, verifies every city's bundled map/routes and a cold offline relaunch, then restores the emulator's previous Wi-Fi/mobile-data settings. It writes `docs/native-validation.json` and actual device captures in `docs/screenshots/`. Playwright's [Android/WebView integration](https://playwright.dev/docs/api/class-android) attaches to this debug app only.

The iOS workflow compiles an unsigned ARM64 simulator app and device archive on GitHub's macOS 26 runner, with optional artifact upload. An earlier simulator artifact installed and launched in this Mac's iPhone 16e / iOS 26.1 simulator, displaying a real Zurich walking route and building-shade estimate. Physical iPhone testing and signed-device builds remain outstanding.

Local Xcode 26.3 initially rejected its missing iOS 26.2 runtime. The working download command specifies the architecture explicitly:

```sh
xcodebuild -downloadPlatform iOS -buildVersion 26.2 -architectureVariant arm64
```

The 8.39 GB runtime download has now completed and appears in `simctl list runtimes`. However, local Xcode still rejects a generic iOS **device archive** destination as missing the iOS 26.2 platform. Resolve that in Xcode Settings → Components before local device archiving. CI remains the alternative. An unsigned simulator artifact cannot be installed on a physical iPhone.

## Next release steps

Test the native app on physical iPhone and Android devices, including location denial/approximate location, keyboard and safe areas, app resume, low-memory behaviour, large-city map performance and airplane-mode city switching. Complete physical iOS testing and benchmark downloads on real Android hardware. Validate real-world route access and shadows before making stronger model claims.

App Store/TestFlight and Google Play distribution are separate future steps: confirm the final application identifier, prepare signing, privacy declarations and listings, and obtain store review. No store listing, certificate upload, account creation or publication has been performed. Versioned downloadable areas are implemented; compatible catalogues ship with app updates. Public HTTPS hosting is live; durable retention of exact native-build pack files and signed tester distribution remain release steps.

Release commands and draft listing materials are now prepared in [app-stores.md](app-stores.md). Android's unsigned App Bundle build has been verified locally; upload-key signing uses environment variables and refuses missing credentials. The website/pack-host setup is documented in [hosting.md](hosting.md).

## Version 0.9.0 · arrival-time shadows

Android build 7 passes the focused offline regression on the existing 2 GB Android 16 emulator, including arrival-time shade explanation, English/German city-local arrival labels, Oerlikon addresses/routes, the whole Zurich map, historical counts and beta switching. No page errors occurred. The checked debug APK is `native-artifacts/cooler-walks-0.9.0-debug.apk` (44,665,413 bytes; SHA-256 `ec50480c68e242d7029d1653459a9128e4c1ca044e5172deb0a1cfe43b9533c6`). [Current report](native-counts-validation.json). Physical-phone and current iOS interactions remain untested.
