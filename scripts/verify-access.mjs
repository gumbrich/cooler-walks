import assert from 'node:assert/strict';
import fs from 'node:fs';
import { siteAccess } from './lib/site-access.mjs';
const origin = process.argv[2] ?? 'https://coolerwalks.ch';
const paths = [
  '/',
  '/de/',
  '/index.html',
  '/packs/catalog.json',
  '/data/zurich.json',
  '/sw.js',
  '/manifest.webmanifest',
  '/.netlify/images?url=/icons/icon-192.png',
];
async function unauthenticated() {
  for (const path of paths) {
    const response = await fetch(new URL(path, origin), { method: 'HEAD', redirect: 'manual' });
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
}
await unauthenticated();
const wrong = await fetch(new URL('/_access', origin), {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: 'intentionally-wrong-test-value', next: '/' }),
  redirect: 'manual',
});
assert.equal(wrong.status, 401);
assert.equal(wrong.headers.has('set-cookie'), false);
const cookie = await siteAccess(origin);
assert(cookie, 'Supply CW_SITE_PASSWORD through an ignored environment file.');
for (const path of ['/de/', '/packs/catalog.json', '/sw.js']) {
  const response = await fetch(new URL(path, origin), { headers: { Cookie: cookie } });
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-cw-private'), '1');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  await response.arrayBuffer();
}
// Warming an authenticated response must never open the CDN cache to other visitors.
await unauthenticated();
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  version: JSON.parse(fs.readFileSync('package.json')).version,
  unauthenticatedPaths: paths,
  wrongPassword: 401,
  authorizedPagesAndData: 200,
  unauthorizedAfterAuthorizedCacheWarm: 401,
  limitations: ['Historical deploy permalinks and already saved offline files are not retracted.'],
};
fs.writeFileSync('docs/private-access-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log('Live access checks passed; no credentials or cookies written to the report.');
