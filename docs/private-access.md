# Private website testing

The website is protected by `netlify/edge-functions/access.ts` on every path of each new Netlify deployment. The gate runs before static-asset caching; it also covers JavaScript, city data, map downloads and direct HTML URLs. Local Vite development remains open on localhost. Native apps retain their bundled interface and data.

Set `CW_SITE_PASSWORD` and an independent random `CW_SESSION_SECRET` (at least 32 characters) in the Netlify project's environment variables, including the **Functions** scope and every deployment context. Do not use `VITE_` prefixes, commit secrets, or put them in `netlify.toml`. Missing configuration returns HTTP 503 and does not serve the app. Generate the signing key with `openssl rand -hex 32`. Redeploy after changing environment variables.

Successful sign-in sets a host-bound, signed, HttpOnly, Secure, SameSite cookie for seven days. Changing either secret invalidates existing sessions. Passwords are submitted only over HTTPS; neither password nor signing key reaches client JavaScript. Login rejects cross-origin form submissions and external return URLs. Responses are private/non-cacheable at the browser HTTP and CDN layers, and carry `noindex`. No login attempt or password logging is added. This is a shared testing password, not individual user accounts or a substitute for a security audit; it does not provide a distributed login-attempt limiter.

Netlify's built-in password protection is unavailable on the existing Free Legacy plan. This implementation does not change the plan or billing. References: [Netlify password protection](https://docs.netlify.com/manage/security/secure-access-to-sites/password-protection/), [request processing](https://docs.netlify.com/resources/troubleshooting/request-chain/), [edge environment variables](https://docs.netlify.com/build/edge-functions/environment-variables/).

## Limits and offline use

- A password cannot retract files already downloaded while the site was public. Installed PWAs and native APKs can retain offline copies. After authorized sign-in, the PWA can still save its interface and maps locally; anyone with access to that browser profile may use those saved copies offline.
- Logout expires the cookie and sends `Clear-Site-Data` for cache/storage. Browser support varies; use the browser's site-data controls to remove saved offline copies when sharing a device.
- This gate protects the current custom domain, current Netlify hostname, and future deploys containing the gate. **Historical Netlify deploy permalinks may still expose old public snapshots.** Do not roll back to a pre-gate deploy. Restricting every historical deploy would require Netlify's paid site-wide protection or an explicitly approved retention/deletion change.
- Native apps with existing bundled data still work. Cross-origin downloads from this now-private website require website authentication and are not an authenticated native-download service. Do not publish an app-store release against that download host until native access is addressed or public access resumes.

## Verification

`tests/access.test.ts` checks direct assets/HEAD requests, missing configuration, wrong passwords, German/English forms, signed sessions, tampering, expiry, hostname isolation, secret rotation, cross-origin requests, redirects and logout. Verify the actual deployed edge gate with unauthenticated and authenticated requests; Vite does not execute Netlify functions. Keep test cookies and credentials in ignored local files only.

The login page uses `Referrer-Policy: same-origin`: browsers otherwise send a null Origin on the form POST, which the strict CSRF check correctly rejects. A real browser form regression now checks wrong passwords, successful login, retained destination and logout. Both entry pages request the manifest with `crossorigin="use-credentials"`, required for an authenticated same-origin manifest ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest#deploying_a_manifest)). The production PWA check covers actual installation rather than inferring it from an HTTP fetch.

Map-pack and supplementary tree-tile downloads use same-origin credentials. Separate map hosts receive no website cookie. The app CSP permits same-origin forms for logout, while keeping external form submissions blocked.
