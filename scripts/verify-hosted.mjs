import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Run after upload against the real HTTPS host. --local only relaxes HTTPS, for
// a local host that actually applies _headers and _redirects (not vite preview).
const origin = process.argv[2];
if (!origin)
  throw new Error(
    'Usage: npm run release:smoke -- https://owned-domain [https://map-host/packs/] [--catalog path/to/build-catalog.json] [--local]',
  );
const site = new URL(origin);
if (
  site.protocol !== 'https:' &&
  !(process.argv.includes('--local') && ['localhost', '127.0.0.1'].includes(site.hostname))
)
  throw new Error('A production host must use HTTPS.');
const packOrigin =
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3].replace(/\/?$/, '/')
    : new URL('/packs/', site).href;
const checks = [];
// Use the catalogue emitted by the deployed build, not a recompression on a
// different OS or Node/zlib version. Keep checksum validation strict.
const catalogFlag = process.argv.indexOf('--catalog');
const catalogPath =
  catalogFlag < 0 ? 'src/generated/area-catalog.json' : process.argv[catalogFlag + 1];
assert.ok(catalogPath && !catalogPath.startsWith('--'), '--catalog requires a local JSON file');
const get = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
  return response;
};
for (const [route, phrase] of [
  ['/', 'Cooler Walks'],
  ['/de/', 'Fusswege planen'],
  ['/de/privacy/', 'Der Standort bleibt deine Entscheidung'],
  ['/de/support/', 'verkehrsberuhigte Wege'],
  ['/privacy/', 'Location is your choice'],
  ['/support/', 'Help & feedback'],
]) {
  const response = await get(new URL(route, site));
  assert.equal(response.status, 200, route);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  const html = await response.text();
  assert.ok(html.includes(phrase), route);
  checks.push(`${route}: real HTML and security headers`);
}
for (const route of [
  '/packs/does-not-exist.cwp',
  '/data/does-not-exist.json',
  '/not-a-page',
  '/de/not-a-page',
])
  assert.equal(
    (await get(new URL(route, site))).status,
    404,
    `Missing files must be 404, not the SPA: ${route}`,
  );
const sw = await get(new URL('/sw.js', site));
assert.equal(sw.status, 200);
assert.match(sw.headers.get('cache-control') ?? '', /no-cache|max-age=0/);
const manifest = await (await get(new URL('/manifest.webmanifest', site))).json();
assert.equal(manifest.display, 'standalone');
const germanManifest = await (await get(new URL('/manifest-de.webmanifest', site))).json();
assert.equal(germanManifest.lang, 'de');
assert.equal(germanManifest.id, manifest.id);
assert.equal(germanManifest.start_url, '/de/?view=planner');
// The expanded model is also served as independent, immutable online tiles.
// A valid full offline pack alone does not prove that every district can load.
const libraryPath = '/data/zurich-shade-library.json';
const localLibrary = fs.readFileSync(`public${libraryPath}`);
const libraryResponse = await get(new URL(libraryPath, site));
assert.equal(libraryResponse.status, 200);
const libraryBytes = Buffer.from(await libraryResponse.arrayBuffer());
assert.deepEqual(libraryBytes, localLibrary, 'Hosted 3D manifest matches the audited library');
const tiles = JSON.parse(libraryBytes.toString()).tiles;
for (let first = 0; first < tiles.length; first += 3) {
  await Promise.all(
    tiles.slice(first, first + 3).map(async (tile) => {
      const response = await get(new URL(tile.url, site));
      assert.equal(response.status, 200, tile.id);
      assert.ok(!(response.headers.get('content-encoding') ?? '').includes('gzip'));
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, tile.bytes, tile.id);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), tile.sha256, tile.id);
    }),
  );
}
checks.push(`Zurich 3D library: manifest and all ${tiles.length} hosted tile hashes verified`);
const pavementResponse = await get(new URL('/data/zurich-pavements.json', site));
assert.equal(pavementResponse.status, 200);
assert.deepEqual(
  Buffer.from(await pavementResponse.arrayBuffer()),
  fs.readFileSync('public/data/zurich-pavements.json'),
  'Hosted municipal pavement graph matches the audited pilot',
);
checks.push('Zurich pavement pilot: published graph matches the reviewed source extract');
for (const entry of JSON.parse(fs.readFileSync(catalogPath, 'utf8'))) {
  const url = new URL(entry.file, packOrigin);
  const response = await get(url, { headers: { Origin: 'capacitor://localhost' } });
  assert.equal(response.status, 200, entry.id);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    '*',
    'Public credential-free packs must support native app origins.',
  );
  assert.ok(
    !(response.headers.get('content-encoding') ?? '').includes('gzip'),
    'Do not mark an already-gzipped .cwp file with Content-Encoding: gzip.',
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, entry.bytes, entry.id);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.id);
  checks.push(`${entry.id}: hosted bytes, SHA-256 and native CORS verified`);
}
console.log(checks.join('\n'));
console.log(
  'Hosted smoke check passed. Browser/PWA/native download verification remains required on this deployment.',
);
