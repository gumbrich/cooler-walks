# Hosting and domain launch

Updated 30 September 2026. **The website is live at https://coolerwalks.ch/ with valid HTTPS. The domain is registered in the owner's Infomaniak account; the Netlify project deploys the private GitHub repository.** The public support email is `knoerzerjohannes@protonmail.com`, as requested. “Cooler Walks” is the public brand; store enrollment and legal publisher details remain separate steps.

## Recommended launch setup

Use **Netlify for the website**, **coolerwalks.ch for its domain**, and **Cloudflare R2 with a separate HTTPS hostname for native map downloads**. Register the domain through a registrar supporting .ch, such as Infomaniak, and retain control of DNS. The web app is static: it needs no database, routing server or paid map API. Keep the private source repository private; only `dist/` is published.

The current complete web output is about **217 MB uncompressed** for 0.8.0, including the five current compressed packs. Local retained packs from older builds can increase the folder size. Cambridge's map is **31,093,355 bytes**. That exceeds Cloudflare Pages' [25 MiB per-file limit](https://developers.cloudflare.com/pages/platform/limits/). Pages/Sites would need the large map moved to object storage or a revised data-loading format; do not upload the current output there unchanged. The existing `.openai/hosting.json` is only an unregistered static-output descriptor, not a live site.

Netlify has a private-GitHub import workflow, atomic deployments, custom domains and HTTPS. Import through Git or use its CLI; its [manual drop-zone guidance](https://docs.netlify.com/manage/projects/add-new-project/) warns that large files can stall drag-and-drop uploads. The owner's existing team was verified on **Free Legacy: $0, 100 GB bandwidth and 300 build minutes per month, one concurrent build** on 29 September. It has no saved payment method; no plan change is needed. New accounts use different [credit-based pricing](https://www.netlify.com/pricing/). This data-heavy app can consume bandwidth quickly; monitor the actual team's usage. A private source repository does **not** make the resulting website private.

R2 is recommended for a permanent, additive map archive so an older installed app can still retrieve its exact hashed files after a new website deploy. It charges for storage and operations, with [no direct egress charge](https://developers.cloudflare.com/r2/pricing/); account billing and limits still need review. The smaller launch alternative is to keep every released pack in each Netlify deployment, but that increases every deployment's size and requires explicit retention discipline.

## Domain check

At **2026-09-29 15:23 UTC**, SWITCH's official Domain Check service returned:

```text
whois -h whois.nic.ch -p 4343 coolerwalks.ch
1: This domain name can be registered.
```

The registry [documents code 1 as available for registration](https://www.nic.ch/whois/domaincheck/). This is an availability check, not a reservation or a purchase. Recheck at checkout, including renewal price and taxes. `coolerwalks.com` and `coolerwalks.app` also returned RDAP 404/no registration record earlier that day, but their registrar availability and price were not confirmed. `.ch` is the user's preferred candidate. It does not change the app's international scope.

The owner completed Infomaniak account setup and checkout on 29 September. The registrar shows the `coolerwalks.ch` domain-registration order completed at **21:05**, and SWITCH's Domain Check now returns code 0, already registered. The prepared basket excluded Domain Plus; its pre-account quote of EUR 6 excluding tax is not a record of the final charge or renewal cost. Confirm the invoice and renewal settings in the owner's account. Netlify project `cooler-walks` now builds the private repository's `main` branch. Both website DNS records have been added and Netlify's DNS verification succeeded. Credentials and verification codes belong directly in the provider's browser, never in this repository.

## Prepare locally

```sh
npm ci
npm run release:prepare
npm run release:serve
```

Open `http://127.0.0.1:4181/`, `/privacy/` and `/support/`. This local server applies the project's security/cache headers and real 404 responses. It is a test approximation of Netlify, not a production server. The ordinary Vite preview on port 4173 does not apply `_headers`.

Internal help/privacy links include `index.html` so the same pages work in Capacitor's bundled asset server. Their public canonical URLs remain `/privacy/` and `/support/`; both forms are real files, not planner fallbacks.

The ignored `release-artifacts/` directory contains the website folder, a `.tar.gz` archive, the matching map packs/catalogue, R2 CORS configuration and a SHA-256 manifest with source commit, dirty-state flag and Node version. The manual **Prepare release files (no publishing)** GitHub workflow produces the same artifacts with Node 22 and runs release browser checks. This manual workflow does not publish; Netlify independently deploys pushes to `main`.

Before a public deployment, fill `release/site.json` with the purchased HTTPS origin, publisher/contact information, actual host names, their privacy notice, and confirmed logging/retention/analytics settings. Draft pages have a visible notice and `noindex`; production builds refuse incomplete settings. Do not invent a host retention period. If website and map hosting use different providers, disclose both in `hostingDetails`. Disable optional analytics unless deliberately added and disclosed. No credentials belong in this file.

## Upload the website

1. Register the selected domain in the user's own account. Recheck availability and price immediately before purchase. Enable account security and renewal reminders.
2. In Netlify, choose **Add new project → Import an existing project → GitHub**, grant access only to `gumbrich/cooler-walks`, and choose `main`. The checked-in `netlify.toml` supplies Node 22, build/check commands and `dist` as the publish directory. This starts a public deploy: do it only when ready to publish.
3. Keep `VITE_AREA_BASE_URL` unset for the website initially; it serves the matching packs from its own `/packs/`. If using R2 for browser downloads too, set the same verified HTTPS directory at build time. Never put tokens in `VITE_*` variables: they are public.
4. Add the owned domain in **Domain management → Production domains**. Follow the exact DNS values shown there. With external DNS, `www` uses a CNAME to the assigned Netlify hostname; apex uses the provider-supported ALIAS/ANAME/flattened CNAME or the currently documented fallback. Do not guess the project hostname or delete unrelated mail records. See [Netlify's DNS instructions](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/).
5. Choose one canonical domain (apex recommended for the proposed `https://coolerwalks.ch`), redirect the other hostname, and wait for its TLS certificate. The app assumes installation at the domain root, not a subfolder. Set the same origin in `release/site.json` and rebuild.
6. Run the hosted checks below, inspect the live planner on desktop/phone, and install/reopen the PWA from the final origin. Local HTTP tests cannot validate DNS, TLS, CDN compression, redirects or production installability.

For updates, validate first, then push a focused commit. Netlify deploys the new commit atomically. To roll back, select the last known-good deployment in its dashboard. A service-worker cache can outlive a rollback until the client checks for updates; verify a returning installed PWA too. Saved offline areas survive app-shell updates and remain tied to their own data version.

## Publish durable native map packs

1. Create an R2 bucket for **public, credential-free derived map data only**. Attach a custom HTTPS hostname such as `maps.coolerwalks.ch` through the R2 dashboard. Cloudflare requires the custom-domain zone in the same Cloudflare account. If using this approach, configure Cloudflare DNS for the registered domain, preserving Netlify website and existing mail records. The `r2.dev` URL is a development endpoint, not the recommended production origin. See [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).
2. Apply `release/r2-cors.json` in the bucket's CORS settings. It allows public GET/HEAD requests from browser and Capacitor origins. It grants no write access and sends no credentials.
3. Upload the **exact** `.cwp` files from the same `release-artifacts/map-packs/` build used to compile the native app, under `packs/`. Use `Content-Type: application/octet-stream` and `Cache-Control: public, max-age=31536000, immutable`. **Do not set `Content-Encoding: gzip`**: the app verifies the compressed bytes before decompressing. A CDN must not transform them.
4. Keep old hashed files for every supported app version. Never overwrite a hash-named file or use a destructive `sync --delete`. Do not rely on temporary GitHub artifact links or Netlify preview URLs as the app's permanent origin. App updates ship a new compatible catalogue; there is no remote arbitrary-code update channel.
5. Build the native app with `VITE_AREA_BASE_URL=https://maps.coolerwalks.ch/packs/`, once that owned host is live. Re-upload the packs emitted by that exact build if compression changed. Node/zlib versions can change compressed bytes even for identical source data; filename/hash mismatches must not be ignored.

Cloudflare credentials stay in the provider login, a local credential store or scoped CI secrets. No upload token is required by the app. The domain is registered; Cloudflare DNS delegation and billable bucket creation have not been performed.

## Live acceptance checks

```sh
npm run release:smoke -- https://coolerwalks.ch https://maps.coolerwalks.ch/packs/
```

Use the actual owned URLs and the matching app checkout/catalogue. For the initial same-origin website deployment, use:

```sh
npm run release:smoke -- https://coolerwalks.ch --catalog docs/releases/2026-09-30-v060-netlify-catalog.json
PWA_ORIGIN=https://coolerwalks.ch PWA_HEADFUL=1 npm run test:pwa
RELEASE_ORIGIN=https://coolerwalks.ch npm run test:release:browser
```

`--catalog` accepts a local catalogue from the exact deployed build. Do not regenerate it on a different machine and assume hashes match: Node/zlib versions affect compression, and even identical Node 22 compression differs at the gzip OS header on Linux versus macOS. The launch catalogue was recovered from the deployed build and **all five decompressed payloads independently compared byte-for-byte with local source packs** before accepting it; see [verification record](releases/2026-09-29-hosted-packs.json). Checks still enforce every compressed checksum, length and native CORS header. Future releases should retain their original build artifacts. The script checks HTML pages, security headers, true missing-file 404s, service-worker revalidation, the PWA manifest, all pack hashes and Capacitor CORS. Repeat real Android/iOS downloads, cancel/retry, cold offline launch and removal against the final host before submitting to stores. Local development still works without any hosting account.

## Launch record — 29 September 2026

- Project: [cooler-walks](https://app.netlify.com/projects/cooler-walks/overview), repository `gumbrich/cooler-walks`, production branch `main`.
- Initial production source: `05220a37796a1d5fa3b23efec8ee81a4583c1b05`; [published deployment](https://app.netlify.com/projects/cooler-walks/deploys/6abc10e944762174f4e87c9b).
- Build: Node 22, `npm run check && npm run build && npm run release:check`, output `dist/`. `VITE_AREA_BASE_URL` is unset; website packs come from the same origin.
- DNS stays at Infomaniak. Added apex `A 75.2.60.5` and `www CNAME cooler-walks.netlify.app`, each TTL 3600. Preserved both nameservers, DNSSEC and existing SPF/DMARC TXT records. No mail hosting was created.
- `coolerwalks.ch` is Netlify's primary domain; `www.coolerwalks.ch` is its automatic redirect alias. Netlify verified DNS, provisioned the certificate and served HTTPS successfully at 19:53 UTC. Both HTTP and `https://www.coolerwalks.ch/` redirect to `https://coolerwalks.ch/`.
- The three HTML pages, security headers, real 404s, service-worker revalidation, standalone manifest and all five hosted pack hashes/CORS passed against both the Netlify HTTPS origin and the final custom domain.
- CI on the deployed source passed all 45 model/unit tests, real-data verification, formatting, production build and twelve browser scenarios. Android and iOS build workflows also passed.

No host plan upgrade, R2 account/bucket, store enrollment or app submission was performed. The permanent native pack archive, store account identities and signing keys remain the next distribution work.

The initial live PWA check detected Netlify's automatically injected badge script conflicting with the strict CSP. Disabled **Project configuration → General → Powered by Netlify badge** using the [supported setting](https://docs.netlify.com/manage/projects/powered-by-netlify-badge/). Public HTML was rechecked: only the application's own module script remains. No CSP exception or third-party script allowance was added.

Final custom-domain checks passed on Chrome 154/macOS: actual PWA installation and standalone launch, real pack download, cold offline reopening of Munich Old Town, offline routes/water preference/waypoints, cached-city switching, an honest unvisited-city error and recovery after reconnecting. Three release browser scenarios passed on `https://coolerwalks.ch`: no-JavaScript help/privacy, WCAG A/AA scan and 200% text, production CSP, offline privacy and real 404. Two existing desktop/phone planner scenarios also passed on the identical Netlify deployment. Screenshots were inspected; [PWA report](releases/2026-09-29-v050-pwa.json) records the final origin. Physical phone and native-app downloads from the final host remain untested.

## Version 0.5.0 release — 29 September 2026

Published source `e0a0795ffa8990a24f87786b572e51c0e5ba1f8b` adds Zurich calmer streets and German website/app support. English and German entry, privacy and support pages are live. [Web/model checks](https://github.com/gumbrich/cooler-walks/actions/runs/36627073452), [Android builds](https://github.com/gumbrich/cooler-walks/actions/runs/36627073439) and [iOS builds](https://github.com/gumbrich/cooler-walks/actions/runs/36627073386) all passed on that source.

The live smoke test passed six HTML pages, English/German 404s, security/cache headers, service-worker and manifest checks, and all five compressed pack lengths, SHA-256 hashes and native CORS. The [deployed catalogue](releases/2026-09-29-v050-netlify-catalog.json) is retained. The changed Zurich payload was independently decompressed and compared with source; the four unchanged hashes retain their earlier verified source comparisons. See [payload verification](releases/2026-09-29-v050-hosted-packs.json).

Four release browser scenarios passed on the domain, including no-JavaScript German pages, accessibility and 200% text, production CSP, German offline navigation and a true German 404. Chrome 154.0.8037.92 installed and launched the PWA, cold-reopened a downloaded area offline, switched to German and calculated the Zurich calmer route offline. No page errors occurred. No hosting plan, DNS, billing or store account changes were needed for this update.

## Version 0.6.0 release — 30 September 2026

Published source `5fbde0d55d50e3e4a2584caa9fc247aa3d10b069` adds Zurich historical vehicle-count evidence. [Its verified deployment](https://app.netlify.com/projects/cooler-walks/deploys/6abcb20187b26e0008443eda) completed in 1m 28s. Test-only follow-up `b198a3c62d2af9933dbdc28f4014094a998565e5` was also [published successfully](https://app.netlify.com/projects/cooler-walks/deploys/6abcb851f1e0fe0008719950), in 1m 12s, with unchanged application source. The public catalogue reports `zurich-2026-09-30-v5`. Two earlier attempts failed during the build; the release corrects a cold Vite worker-dependency reload and the time allowance for a two-route integration test. Publishing remains automatic from `main`; no plan, DNS, security or billing changes were made.

The public smoke test passed all six English/German HTML pages, true 404s, security/cache headers, manifests and every one of the five pack lengths, compressed SHA-256 hashes and native CORS checks. The exact [deployed catalogue](releases/2026-09-30-v060-netlify-catalog.json) is retained. The changed Zurich file was independently decompressed and compared with local source; the four unchanged hashes retain their verified comparisons in the [payload record](releases/2026-09-30-v060-hosted-packs.json).

All four release browser scenarios passed against `https://coolerwalks.ch`. Chrome 154.0.8037.92 installed and launched its PWA, reopened the downloaded Munich area offline and displayed the real Monday 14:00 Zurich counter reference in German after an offline reload. Manifest/installability checks and recorded page errors were empty. See [PWA results](releases/2026-09-30-v060-pwa.json) and [installed counter view](screenshots/installed-vehicle-counts.png). Android and iOS CI builds passed; focused Android count interactions passed offline in the dedicated emulator. Physical phones and iOS count interactions remain untested.

## Version 0.7.0 release — 30 September 2026

Published source `a65c3e871966f00a3988c117caf9e6e4f891f94e` focuses on Zurich, expands routing to 21.81 km², adds official addresses and map-point actions, and labels other integrated cities beta. [The Netlify deployment](https://app.netlify.com/projects/cooler-walks/deploys/6abcc3935ee4c4000876b564) is published, with all redirects and headers processed successfully. DNS, hosting plan and account settings are unchanged.

The real public catalogue reports `zurich-2026-09-30-v6`; its Zurich download is 8,222,869 bytes. All six English/German HTML pages, true 404s, security/cache headers, both manifests and all five map-pack checksum/native-CORS checks pass. Every hosted pack was also decompressed and compared byte-for-byte with the tested local payload. The [deployed catalogue](releases/2026-09-30-v070-netlify-catalog.json) and [payload verification](releases/2026-09-30-v070-hosted-packs.json) retain the exact release evidence. All four live release-browser scenarios pass, including English/German accessibility, production CSP and offline public-page navigation. Chrome also installed the public PWA, launched it standalone and verified German official address search, routes and map actions offline, with zero manifest/installability/page errors. See [the current PWA report](pwa-validation.json).

The published source also passes the full Linux check workflow and both native CI builds. Final documentation and viewport-capture verification do not change the deployed application. See [platform verification](platform.md) for exact runs and remaining device/model limitations.

## Version 0.8.0 release — 30 September 2026

Published source `2c5f7a08ef65a748430a85bc79c360b133badb43` expands Zurich to 57.77 km², including Oerlikon and Altstetten, and adds stricter municipal-edge and uncertain-building coverage handling. The website and German version retain the existing domain, HTTPS, Netlify plan and GitHub deployment connection.

The public catalogue reports `zurich-2026-09-30-v7`; its Zurich pack is **16,564,028 bytes**. All six English/German public pages, real 404s, security/cache headers, both manifests and all five hosted SHA-256/native-CORS checks pass. Each hosted pack’s decompressed payload matches the locally tested data exactly. Node 22 deployment compression differs from local Node 26 compression, so checks use the [actual hosted catalogue](releases/0.8.0-hosted-catalog.json), with [payload evidence](releases/0.8.0-hosted-packs.json).

The first production browser/PWA attempt hit the existing 30-second fetch timeout while several large transfer checks ran concurrently. A separate compressed Zurich transfer completed in 8.54 seconds (11,695,021 transferred bytes). Sequential verification kept the original assertions/time limits: Chrome installed and launched the PWA, cold-reopened saved maps, and calculated the Oerlikon address journey offline in German, including a settled map and map-point actions. No manifest/installability/page errors remained. Slow or contended connections remain a risk for these large initial city bundles; smaller streamed/vector-tile data is a future performance milestone. See [PWA evidence](pwa-validation.json).

A release follow-up separates service-worker interface installation from visited-city downloads. The old `cache.addAll` batch fetched the 100 MB expanded Zurich model/map alongside the planner’s identical requests. Production traces showed duplicated transfers and interrupted installations. The interface now activates independently, and the existing city-cache handoff saves data after loading. Four local production-page scenarios pass with explicit checks that both actual city files are cached before offline tests; no timeout was relaxed. The follow-up is published from `eb9d9456e088b91d7cbcdaae696752594927b9b8`. All four live production-page scenarios pass together (1.4 minutes), including real CSP, no-JavaScript public pages, accessibility and English/German offline navigation. The deployed worker precaches 46 interface assets and no city data; its catalogue exactly matches the already verified downloads. See [deployment evidence](releases/0.8.0-cache-installation.json).

The final map refinement is published from `f6e1bbef14ca50df2e8ffef5f223cfa866308a36`. City-scale rendering now keeps neighbourhoods, the street network, parks and waterways, adding buildings, trees and minor paths at street scale. Both live Zurich address/map flows pass on this exact build (53.3 seconds total); the whole-area overview settled in 1,736 ms in the tested desktop Chrome session. This is a test-machine observation, not a mobile-performance guarantee. [Final script/service-worker provenance](releases/0.8.0-final-host.json) confirms the map catalogue is unchanged.

Final acceptance is complete: [all Linux checks and 17 browser scenarios](https://github.com/gumbrich/cooler-walks/actions/runs/36707730409), both native CI builds, and a fresh public-origin Chrome PWA installation/standalone/offline run pass on `f6e1bbe`. The PWA report is dated 2026-09-30T11:25:25Z with no manifest, installability or page errors. [CI evidence](releases/0.8.0-ci.json) and [platform scope](platform.md) retain exact versions and untested device limitations.

## Version 0.9.0 release — 30 September 2026

Published source `2f662ebc0aee94e644d42ffd301d6a809672a62f` updates building shadows to the expected arrival at each route sample, with English/German arrival labels and honest low-sun/night transitions. The deployed routing worker matches the locally tested production build byte-for-byte. [Deployment provenance](releases/0.9.0-host.json).

The public route scenario passes arrival times for both alternatives, English/German phone layouts, the low-sun transition and recovery to a shade comparison. All six public pages, true 404s, security/cache headers, both manifests and every hosted pack checksum/native CORS check pass. Pack files and embedded hashes match the [0.8 catalogue](releases/0.8.0-hosted-catalog.json); the previous decompressed-source comparisons therefore remain applicable. Existing offline packs do not need a new download for this model update. Hosting, DNS and account settings are unchanged.

All four live release-browser scenarios pass, including production CSP, accessibility/200% text, English/German pages without JavaScript and offline privacy navigation. Chrome installed and launched the public PWA and passed offline arrival-time shade and address planning, with no manifest, installability or page errors. Android and iOS CI packaging passed. [Platform scope](platform.md) and [PWA report](pwa-validation.json).

Final acceptance includes the complete [Linux workflow with all 18 browser scenarios](https://github.com/gumbrich/cooler-walks/actions/runs/36716054350) and both native CI builds. [CI evidence](releases/0.9.0-ci.json) records the published revision. No physical-phone or field-shadow accuracy validation is implied.

## Version 0.10.0 release — 30 September 2026

Published source `0df33ef6204bfd349ad1be027e8d4b40fd45e82e` adds the bounded central Zurich 3D-roof/LiDAR-ground model. The public routing worker and detailed geometry match the locally tested production bytes exactly. [Deployment provenance](releases/0.10.0-host.json). Zurich data advances to `zurich-2026-09-30-v8`; the five downloadable packs pass their deployed compressed checksums and native CORS checks using the [actual Node 22 hosted catalogue](releases/0.10.0-hosted-catalog.json).

All six public pages, true missing-file 404s, security/cache headers and both manifests pass the hosted smoke checks. Chrome installed and launched the public PWA, cached the detailed geometry and verified offline routing, German addresses, saved-area reopening and reconnection without page errors. The first PWA attempt timed out during concurrent large transfers; the sequential rerun passed with unchanged time limits. [PWA results](pwa-validation.json). Android and iOS CI builds pass; physical-phone and field-shadow validation remain outstanding. DNS, hosting plan and account settings are unchanged.

All four release-browser scenarios pass on the live domain, covering English/German no-JavaScript pages, accessibility, enlarged text, CSP and offline privacy navigation. [Platform scope](platform.md) records actual browser/native checks and the remaining device limitations.

Final acceptance on `0df33ef` includes all 79 unit/model checks, eight Python source checks, real-data verification, formatting, the production build and **all 20 Linux browser scenarios**, plus successful Android/iOS packaging. [CI evidence](releases/0.10.0-ci.json) retains the exact run links and validation scope.

## 0.11.0 traffic update

Published application source `4697889c64928ed5fe54fede40eced23c6b12db2` updates Zurich street context to v2 and the dataset to `zurich-2026-09-30-v9`. The deployed routing worker matches the tested local build byte-for-byte; the changed Zurich pack decompresses to the exact tested payload. [Provenance](releases/0.11.0-host.json). All six public pages, true 404s, security/cache headers, both manifests and all five hosted pack hashes/native CORS checks pass against the [actual deployed catalogue](releases/0.11.0-hosted-catalog.json).

A returning Chrome session initially received an older cached Zurich dataset during the service-worker handover. The app rejected it with its version-mismatch state; the visible **Retry / Erneut laden** action then loaded the current data and restored real routes. This recovery was verified, but seamless upgrades across old caches remain an improvement item. A fresh PWA installation was not repeated for this traffic update; the latest installation report remains 0.10.0. Hosting, DNS, account settings and store-submission status are unchanged.

## 0.13.0: expanded Zurich 3D library

Published from `0417b8a6dcb56437847eeaafa8d94a40fa4026d2` to https://coolerwalks.ch/. The manifest and **all 81 online tile hashes** match the audited local library. The deployed routing worker and styles match the tested build byte-for-byte. All six EN/DE public pages, security/cache headers, true missing-file 404s, both manifests and all five pack checksum/native-CORS checks pass. [Deployment evidence](releases/0.13.0-host.json).

Zurich data is `zurich-2026-09-30-v10`. The [actual hosted catalogue](releases/0.13.0-hosted-catalog.json) identifies its 79,453,151-byte download; the local macOS build produces an 80,214,280-byte archive because compression differs. Existing saved Zurich areas need updating. The old central-only 3D JSON is excluded from production output. Native bundled builds contain the full tiled library; no raw source surveys are published.

Chrome 154.0.8037.92 installed the public PWA, launched standalone and passed cached central routes, complete-Zurich downloaded offline Oerlikon address planning, historical counters, water/stops, cold saved-area reopening and unvisited-city error/recovery. Manifest, installability and page-error lists are empty. [Public PWA report](releases/0.13.0-pwa-validation.json); [local preview run](releases/0.13.0-local-pwa-validation.json). Android and iOS CI packaging pass; current iOS interactions and physical phones remain untested. DNS, account and store-submission settings are unchanged.

All 22 Linux browser scenarios and the complete shared model/data/format/build job pass for `0417b8a`, alongside both native packaging workflows. [CI evidence](releases/0.13.0-ci.json). The final verification commit changes reports, screenshots and read-only deployment-check tooling; the published application remains this tested source.

## Pavement pilot · 0.14.0

Published the bounded municipal-pavement pilot from `16a5d24`, followed by the native safe-area correction in `aa742ef`. The public pavement graph matches the reviewed local bytes. All 81 model-tile hashes, five hosted pack hashes/native-CORS checks, six EN/DE pages, security/cache headers, manifests and missing-file 404s pass. The deployed stylesheet matches the corrected local build. [Hosted evidence](releases/0.14.0-host.json), [deployed catalogue](releases/0.14.0-hosted-catalog.json).

An existing Chrome session initially rejected an older cached dataset; the visible Reload action recovered to a real pilot route. Seamless cache handover remains a known follow-up. Local production PWA installation/offline checks passed; they were not repeated on the public deployment. CI shared checks and native compilation pass, but seven Linux browser initial-route timeouts and GitHub artifact-storage quota failures remain. [CI evidence](releases/0.14.0-ci.json). No billing, account access or stored-artifact deletion was performed.
