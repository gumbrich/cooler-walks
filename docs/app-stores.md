# Preparing Google Play and the App Store

Status on 29 September 2026: native Android and iOS projects exist, with the same planner, local routing and downloaded-area storage as the website. This is **release preparation**, not an approved store release. The public support contact is `knoerzerjohannes@protonmail.com`. Website/domain and publisher details are controlled in `release/site.json`; metadata text is in `release/store-listing.json`.

## What is prepared

- Shared native source, app/launch icons, optional foreground location, private file storage and an iOS privacy manifest.
- Environment-based Android upload-key signing, explicit unsigned AAB preparation, signed/unsigned iOS archive commands, and CI artifacts. Release Android builds reject development URLs/cleartext settings and never silently use the debug key.
- Live HTTPS [privacy](https://coolerwalks.ch/privacy/) and [support](https://coolerwalks.ch/support/) pages, with email feedback, offline caching and confirmed Netlify hosting disclosure.
- English listing copy, category suggestions, reviewer instructions, bounded-city claims, screenshot inventory and release checks. No store account, signing key, listing or submission was created.

The unsigned Android AAB, iOS simulator build and unsigned iOS device archive passed the [native CI build](https://github.com/gumbrich/cooler-walks/actions/runs/36590625022) for the packaging milestone. Local Xcode device archiving remains blocked by its platform installation; CI provides the working archive path. The new help/privacy navigation was then checked on the Android emulator: explicit `index.html` links are required by Capacitor's bundled asset server, and the pages honor native safe-area insets. Run `npm run test:native:pages` against the dedicated installed debug emulator build to repeat it; see `native-public-pages-validation.json`.

Keep `io.github.gumbrich.coolerwalks` as the provisional application/bundle ID. Confirm it before creating the store records: changing it after publication creates a different app. Current marketing version is 0.4.0, Android versionCode/iOS build number 2. Increment build numbers for later uploaded builds; keep Android, iOS and package.json version values consistent.

## Accounts and current requirements

| Platform    | Account and fee                                                                                                                                            | Technical/review requirements checked                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Play | [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435), US$25 one-time registration; identity/contact verification         | New apps/updates target [API 36 from 31 August 2026](https://support.google.com/googleplay/android-developer/answer/11926878); this project targets 36. New personal accounts created after 13 November 2023 need [12 continuously opted-in closed testers for 14 days](https://support.google.com/googleplay/android-developer/answer/14151465) before applying for production access. Device verification may also be required by the account flow. |
| Apple       | [Apple Developer Program](https://developer.apple.com/programs/enroll/), US$99/year or local equivalent; individual/organization identity and signing team | Since 28 April 2026, use [Xcode 26+ and iOS 26+ SDK](https://developer.apple.com/news/upcoming-requirements/). This project uses Xcode 26 and targets iOS 15+, above the current minimum deployment requirement. TestFlight and App Review are separate steps.                                                                                                                                                                                        |

Fees exclude possible taxes/local-currency differences and can change. Select individual versus organization ownership deliberately; the store may show the account holder's legal identity. Confirm applicable trader status and contact disclosures in each console, rather than deriving legal identity from the support email. Complete current age-rating, content-rights and privacy questionnaires. Signing/build success does not guarantee review approval.

## Android: build and upload

For an unsigned packaging check, after syncing:

```sh
npm ci
npm run native:sync
npm run native:bundle:unsigned
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. This is deliberately **unsigned and cannot be submitted as a release**. The GitHub Android workflow also retains it as a private artifact.

For a real upload, first publish and verify the permanent HTTPS pack host described in [hosting.md](hosting.md). Generate an upload keystore in Android Studio's **Generate Signed App Bundle/APK** flow, store it outside the repository, and back it up securely. Use Google Play App Signing and retain the upload key. Follow [Android's signing instructions](https://developer.android.com/studio/publish/app-signing).

The release build reads these environment variables; never commit or print their values:

```text
COOLER_KEYSTORE_PATH       absolute path outside the repository
COOLER_KEYSTORE_PASSWORD   secret
COOLER_KEY_ALIAS           chosen upload-key alias
COOLER_KEY_PASSWORD        secret
VITE_AREA_BASE_URL         permanent public HTTPS /packs/ directory
```

With those set securely in your shell/CI and `release/site.json` complete:

```sh
npm run native:bundle
```

This rebuilds/syncs the current website, checks publication settings and packages the upload-signed AAB. Upload through Play Console → create app → testing → internal testing → create release. Enroll Play App Signing, upload the AAB, inspect its warnings and run the pre-launch report. Then use closed testing where required, collect actual feedback, and apply for production access. Choose managed publishing if you want explicit control over the eventual public launch.

Complete store listing, support/privacy URLs, Data safety, target audience, content rating, ads declaration and app-access instructions. There is no login, payment or advertising in this version. Its generated AAB currently contains no `.so` libraries; rendering uses the system WebView. Recheck [16 KB page-size compatibility](https://developer.android.com/guide/practices/page-sizes) whenever adding native libraries, and validate the final AAB in Play Console.

## iOS: archive, TestFlight, review

Local archive preparation:

```sh
npm run native:sync
npm run native:archive:unsigned
```

An unsigned device archive, when the Xcode platform is available, is placed in `native-artifacts/CoolerWalks-unsigned.xcarchive`. It is neither an installable signed IPA nor an App Store upload. The iOS CI workflow prepares both a simulator build and a separate unsigned device archive.

For signed distribution, sign into Xcode with the enrolled Apple account, confirm the bundle ID and choose the owning team in **Signing & Capabilities**. Set `APPLE_TEAM_ID` and `VITE_AREA_BASE_URL` in the build environment, complete the public-site configuration, then run:

```sh
npm run native:archive
```

Open the resulting `native-artifacts/CoolerWalks.xcarchive` in Xcode Organizer. Validate, then **Distribute App → App Store Connect → Upload**, or follow Apple's [supported upload paths](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/). Account authorization, certificate installation and provisioning remain user/account actions; the script does not create credentials or upload anything.

Create the matching app record in App Store Connect, upload the build, answer export-compliance questions based on the actual binaries, then start internal TestFlight testing. External TestFlight users can require beta review. After testing, complete metadata/privacy/age rating/screenshots, choose the build, provide a reviewer contact and submit for review. Prefer manual release for the first launch. Do not enable background location or claim live navigation merely to justify the native app; offline city storage and native location access are its actual native capabilities.

## Privacy declarations to finish before upload

The implementation calculates search/routes on-device, does not transmit selected journey coordinates, and has no analytics/advertising SDK. Location permission is not by itself off-device collection. **Do not automatically select “no data collected”**: the chosen map/website hosts may retain IP addresses, request paths and logs, and emailed support reports contain voluntarily supplied information. Inspect the actual provider settings and SDK inventory, then complete [Apple's privacy labels](https://developer.apple.com/app-store/app-privacy-details/) and [Google's Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469) using their definitions. Update the public notice consistently. The website notice now discloses Netlify processing and its purpose-based retention policy without inventing a deletion period. Update it again if a separate native map host is added.

`ios/App/App/PrivacyInfo.xcprivacy` describes the current app-owned required-reason file API use and no tracking. Review the final archive's aggregated SDK privacy reports too. Keep secrets, certificates, provisioning profiles and `.p8` keys outside Git; ignore rules are already in place. Downloaded packs contain data only, not executable updates.

## Store assets

Use `release/store-listing.json` as editable listing copy, not as a claim that a listing exists. Its short description, subtitle and keyword lengths fit their intended fields. Keep the limited coverage and building-only shade explanation visible. Reviewer notes specify a real Zurich example and a daytime date.

| Asset               | Prepared source / next step                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Store icon      | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, 1024 × 1024, opaque                                                                                                            |
| Play icon           | Export an opaque 512 × 512 version of the same mark; use the existing `public/icons/icon-512.png` only after confirming its alpha/shape meets the listing rules                                     |
| Android screenshots | `docs/screenshots/android-final-munich.png`, `android-final-downloads.png`, `android-downloaded-offline.png` are actual emulator captures; recapture against the final signed build/host            |
| iOS screenshots     | `docs/screenshots/ios-final-zurich.png`, `ios-downloads.png` are actual simulator captures; capture the required current iPhone size and iPad set because this target supports both device families |
| Feature graphic     | Google Play's 1024 × 500 graphic still needs preparation; do not mislabel browser mockups as native app screenshots                                                                                 |

Follow the live [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) and [Google Play preview-asset rules](https://support.google.com/googleplay/android-developer/answer/9866151) when selecting dimensions. Existing engineering screenshots are review evidence, not a complete store-ready marketing set.

## Remaining release gates

1. Domain registration, public HTTPS website and privacy/support pages are complete. Establish durable retention of every supported native pack hash and verify the permanent download origin.
2. Enroll the owning accounts, create protected signing credentials, confirm identifier/versioning, and build signed artifacts.
3. Complete final-host Android/iOS download and offline tests. Physical-phone testing remains deferred at the user's request; do not call emulator results physical-device validation. iOS permissions, keyboard, long-dialog scrolling and download writes still need full native validation.
4. Obtain tester feedback, resolve failures and store pre-launch warnings, finish screenshots/feature graphic and submit for review. The web/PWA can launch independently of store approval.

## Version 0.5.0 localization update

Android versionName / iOS marketing version is 0.5.0; native build number is 3. German listing copy is prepared in `release/store-listing.de.json`, with German privacy/help paths. The shared app supports EN/DE; iOS permission descriptions include both localizations. Zurich's calmer-street preference must be described as an experimental street-context indicator, never live traffic/noise avoidance or guaranteed quiet/safe routing. Use new screenshots from the tested build, and retain the existing signing, developer-account and durable-download prerequisites before submission. No store submission is implied by this update.
