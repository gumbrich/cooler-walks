import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { dataRevisions } from './lib/data-revisions.mjs';
const revisions = dataRevisions('dist');
const versioned = (url) => `${url}?v=${revisions[url]}`;
let current = false;
const legacy = `const CACHE='cooler-walks-upgrade-test-old';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request));
 else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(r=>{
 if(r.ok&&new URL(e.request.url).pathname.startsWith('/data/')){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;
 })));
});`;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/sw.js' && !current) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(legacy);
    return;
  }
  if (url.pathname === '/upgrade-fixture') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><title>Isolated legacy-cache test fixture</title><script>navigator.serviceWorker.register("/sw.js")</script>',
    );
    return;
  }
  const file = path.resolve(
    'dist',
    '.' +
      decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname),
  );
  if (!file.startsWith(path.resolve('dist') + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: 'chromium',
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const context = await browser.newContext();
context.setDefaultTimeout(45000);
try {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('page-error', m.text());
  });
  page.on('requestfailed', (r) => console.log('request-failed', r.url(), r.failure()));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto(origin + '/upgrade-fixture');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const basel = versioned('/data/basel.json');
  await page.evaluate(
    async ({ basel }) => {
      const cache = await caches.open('cooler-walks-upgrade-test-old');
      await cache.put(
        '/data/zurich.json',
        new Response(JSON.stringify({ version: 'stale-test-fixture' })),
      );
      await cache.add(basel);
      // User-managed downloads use a different store and must survive app upgrades.
      const request = indexedDB.open('cw-upgrade-test-download', 1);
      await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => request.result.createObjectStore('files');
        request.onerror = reject;
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put('keep', 'sentinel');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    },
    { basel },
  );
  // Open the new code under the OLD controller first. Hashes must bypass the
  // stale unversioned response even before a service-worker update can finish.
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/')) requests.push(r.url());
  });
  await page.goto(origin + '/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 45000 });
  assert(requests.some((url) => url.includes(versioned('/data/zurich.json'))));
  await expect(page.locator('.route-model-note').first()).toContainText('3D roofs');
  console.log('PASS new app loads under old controller without a manual reload');
  current = true;
  await page.evaluate(async () => {
    window.upgradeClaimed = false;
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.upgradeClaimed = true;
      },
      { once: true },
    );
    await (await navigator.serviceWorker.ready).update();
  });
  try {
    await page.waitForFunction(() => window.upgradeClaimed);
  } catch (error) {
    console.log(
      'upgrade-state',
      await page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return {
          installing: r?.installing?.state,
          waiting: r?.waiting?.state,
          active: r?.active?.state,
          caches: await caches.keys(),
        };
      }),
    );
    throw error;
  }
  await page.waitForFunction(
    async () => !(await caches.keys()).includes('cooler-walks-upgrade-test-old'),
  );
  await page.waitForFunction(
    async (urls) => (await Promise.all(urls.map((url) => caches.match(url)))).every(Boolean),
    [
      versioned('/data/zurich.json'),
      versioned('/data/zurich-map.geojson'),
      versioned('/data/zurich-pavements.json'),
      basel,
    ],
  );
  const retained = await page.evaluate(async () => {
    const request = indexedDB.open('cw-upgrade-test-download');
    return await new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('files').objectStore('files').get('sentinel');
        get.onsuccess = () => {
          db.close();
          resolve(get.result);
        };
      };
    });
  });
  assert.equal(retained, 'keep');
  console.log('PASS compatible city cache migrates; saved download store survives');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.route-model-note').first()).toContainText('3D roofs');
  await page.getByRole('button', { name: 'Try pavement pilot', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 45000 });
  console.log('PASS upgraded app and both Zurich networks work offline');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
