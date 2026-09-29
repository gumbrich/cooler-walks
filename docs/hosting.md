# Hosting and domain launch

Prepared 29 September 2026. **No domain purchased, public deployment created or store submission made.** The private GitHub repository remains the source of truth. The public support email is `knoerzerjohannes@protonmail.com`, as requested. “Cooler Walks” is the public brand; the legal publisher/account-holder identity still needs confirmation for store enrollment.

## Recommended launch setup

Use **Netlify for the website**, **coolerwalks.ch for its domain**, and **Cloudflare R2 with a separate HTTPS hostname for native map downloads**. Register the domain through a registrar supporting .ch, such as Infomaniak, and retain control of DNS. The web app is static: it needs no database, routing server or paid map API. Keep the private source repository private; only `dist/` is published.

The current complete web output is about **124 MB uncompressed**, including five compressed packs. Cambridge's map is **31,093,355 bytes**. That exceeds Cloudflare Pages' [25 MiB per-file limit](https://developers.cloudflare.com/pages/platform/limits/). Pages/Sites would need the large map moved to object storage or a revised data-loading format; do not upload the current output there unchanged. The existing `.openai/hosting.json` is only an unregistered static-output descriptor, not a live site.

Netlify has a private-GitHub import workflow, atomic deployments, custom domains and HTTPS. Import through Git or use its CLI; its [manual drop-zone guidance](https://docs.netlify.com/manage/projects/add-new-project/) warns that large files can stall drag-and-drop uploads. The [current Free plan](https://www.netlify.com/pricing/) has 300 monthly credits and a hard usage limit; the Personal plan lists 1,000 credits. This data-heavy app can consume bandwidth quickly. Start with a controlled pilot, watch usage, and confirm the checkout price/limits before choosing a paid plan. A private source repository does **not** make the resulting website private.

R2 is recommended for a permanent, additive map archive so an older installed app can still retrieve its exact hashed files after a new website deploy. It charges for storage and operations, with [no direct egress charge](https://developers.cloudflare.com/r2/pricing/); account billing and limits still need review. The smaller launch alternative is to keep every released pack in each Netlify deployment, but that increases every deployment's size and requires explicit retention discipline.

## Domain check

At **2026-09-29 15:23 UTC**, SWITCH's official Domain Check service returned:

```text
whois -h whois.nic.ch -p 4343 coolerwalks.ch
1: This domain name can be registered.
```

The registry [documents code 1 as available for registration](https://www.nic.ch/whois/domaincheck/). This is an availability check, not a reservation or a purchase. Recheck at checkout, including renewal price and taxes. `coolerwalks.com` and `coolerwalks.app` also returned RDAP 404/no registration record earlier that day, but their registrar availability and price were not confirmed. `.ch` is the user's preferred candidate. It does not change the app's international scope.

## Prepare locally

```sh
npm ci
npm run release:prepare
npm run release:serve
```

Open `http://127.0.0.1:4181/`, `/privacy/` and `/support/`. This local server applies the project's security/cache headers and real 404 responses. It is a test approximation of Netlify, not a production server. The ordinary Vite preview on port 4173 does not apply `_headers`.

The ignored `release-artifacts/` directory contains the website folder, a `.tar.gz` archive, the matching map packs/catalogue, R2 CORS configuration and a SHA-256 manifest with source commit, dirty-state flag and Node version. The manual **Prepare release files (no publishing)** GitHub workflow produces the same artifacts with Node 22 and runs release browser checks. No workflow publishes anything.

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

Cloudflare credentials stay in the provider login, a local credential store or scoped CI secrets. No upload token is required by the app. Domain registration, DNS delegation and billable bucket creation have not been performed.

## Live acceptance checks

```sh
npm run release:smoke -- https://coolerwalks.ch https://maps.coolerwalks.ch/packs/
```

Use the actual owned URLs and the matching app checkout/catalogue. The script checks HTML pages, security headers, true missing-file 404s, service-worker revalidation, the PWA manifest, all pack hashes and Capacitor CORS. Repeat real Android/iOS downloads, cancel/retry, cold offline launch and removal against the final host before submitting to stores. The private/local draft still works without any hosting account.
