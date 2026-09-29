import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cooler-walks-pwa-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: process.env.PWA_HEADFUL !== '1',
  ...(executablePath ? { executablePath } : {}),
  viewport: { width: 1280, height: 900 },
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const browser = context.browser();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('Browser error:', m.text());
});
page.on('requestfailed', (r) => console.log('Request failed:', r.url(), r.failure()));
const origin = (process.env.PWA_ORIGIN ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
await page.goto(origin + '/?view=planner');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const cdp = await context.newCDPSession(page);
const manifest = await cdp.send('Page.getAppManifest');
const installability = await cdp.send('Page.getInstallabilityErrors');
if (manifest.errors.length) throw new Error('Manifest errors: ' + JSON.stringify(manifest.errors));
if (installability.installabilityErrors.length)
  throw new Error('Installability errors: ' + JSON.stringify(installability));
// Download one additional city while controlled by the production worker.
await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.waitForFunction(
  async () =>
    Boolean(await caches.match('/data/basel.json')) &&
    Boolean(await caches.match('/data/basel-map.geojson')),
);
const unvisitedCityPrecached = await page.evaluate(async () =>
  Boolean(await caches.match('/data/cambridge.json')),
);
if (unvisitedCityPrecached)
  throw new Error('Unvisited cities should not be downloaded during installation');
await page.getByLabel('City', { exact: true }).selectOption('ch-zurich');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
const compactPack = page.locator('[data-area-id="de-munich-old-town"]');
await compactPack.getByRole('button', { name: 'Download area', exact: true }).click();
await expect(compactPack.locator('.area-state')).toHaveText('Saved', { timeout: 120000 });
await page.getByRole('button', { name: 'Close information' }).click();
await context.setOffline(true);
await page.reload();
// Chrome 153 resets navigator.onLine on a cached navigation while retaining
// request blocking. Reapply its documented UI-state emulation to the new document.
await cdp.send('Network.overrideNetworkState', {
  offline: true,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'none',
});
try {
  await expect(page.locator('.offline-banner')).toBeVisible({ timeout: 30000 });
} catch (e) {
  console.log(
    'Offline diagnostics',
    await page.evaluate(async () => ({
      online: navigator.onLine,
      body: document.body.innerText,
      html: document.documentElement.outerHTML.slice(0, 2000),
      caches: await caches.keys(),
    })),
    errors,
  );
  await page.screenshot({ path: '/tmp/cooler-offline-error.png' });
  await context.close();
  throw e;
}
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.screenshot({ path: 'docs/screenshots/desktop-offline.png', fullPage: true });
await page.getByRole('checkbox', { name: /Prefer waterside/ }).check();
await expect(page.getByRole('button', { name: /More time near water/ })).toBeVisible({
  timeout: 60000,
});
await page.getByRole('button', { name: 'Add a stop' }).click();
await page.getByRole('combobox', { name: 'Stop 1', exact: true }).fill('Rennweg');
await page.getByRole('listbox').getByRole('option').first().click();
await expect(page.getByRole('button', { name: /More time near water/ })).toBeVisible({
  timeout: 60000,
});
await expect(page.locator('.map-marker')).toHaveCount(3);
await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.getByLabel('City', { exact: true }).selectOption('us-cambridge-ma');
await expect(
  page.getByText('The pilot data could not load. Check your connection and try again.'),
).toBeVisible({ timeout: 60000 });
await expect(page.locator('.route-card')).toHaveCount(0);
await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
await compactPack.getByRole('button', { name: 'Use this area', exact: true }).click();
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await page.reload();
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
  timeout: 60000,
});
await expect(page.locator('.map-location')).toContainText('Old Town essentials');
await expect(page.locator('.map-failure')).toHaveCount(0);
await page.screenshot({ path: 'docs/screenshots/desktop-downloaded-offline.png' });
await context.setOffline(false);
await cdp.send('Network.overrideNetworkState', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi',
});
await expect(page.locator('.offline-banner')).toHaveCount(0);
await page.getByLabel('City', { exact: true }).selectOption('us-cambridge-ma');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await expect(page.locator('.map-failure')).toHaveCount(0);
let installation = { installed: false, standalone: false, germanOffline: false, error: null };
const root = await browser.newBrowserCDPSession();
try {
  await root.send('PWA.install', { manifestId: origin + '/', installUrlOrBundleUrl: origin + '/' });
  installation.installed = true;
  await root.send('PWA.changeAppUserSettings', {
    manifestId: origin + '/',
    displayMode: 'standalone',
  });
  // PWA.launch returns a tab target in current Chrome; wait for its page separately.
  const windowPromise = context.waitForEvent('page', { timeout: 30000 });
  await root.send('PWA.launch', { manifestId: origin + '/' });
  const app = await windowPromise;
  await app.waitForLoadState('domcontentloaded');
  await expect(app.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await expect(app.locator('.map-failure')).toHaveCount(0);
  installation.standalone = await app.evaluate(
    () => matchMedia('(display-mode: standalone)').matches,
  );
  if (!installation.standalone) throw new Error('Installed app did not launch standalone');
  await app.screenshot({ path: 'docs/screenshots/installed-app.png' });
  await app.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-zurich');
  await expect(app.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await app.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  const germanSession = await context.newCDPSession(app);
  const germanManifest = await germanSession.send('Page.getAppManifest');
  if (germanManifest.errors.length) throw new Error('German manifest validation failed');
  await context.setOffline(true);
  await app.reload();
  await expect(app.locator('html')).toHaveAttribute('lang', 'de');
  await expect(app.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await app.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).check();
  await expect(app.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible();
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  installation.germanOffline = true;
  await app.screenshot({ path: 'docs/screenshots/installed-german-app.png' });
  await context.setOffline(false);
} catch (e) {
  installation.error = e.message;
} finally {
  if (installation.installed) await root.send('PWA.uninstall', { manifestId: origin + '/' });
}
const report = {
  browser: await browser.version(),
  verifiedAt: new Date().toISOString(),
  origin,
  manifestErrors: manifest.errors,
  installabilityErrors: installability.installabilityErrors,
  offlineReload: true,
  offlineRoutes: true,
  offlineMap: true,
  verifiedAreaDownload: true,
  downloadedAreaColdOfflineReload: true,
  offlineWaterPreference: true,
  offlineVisitedCitySwitch: true,
  unvisitedCityPrecached,
  offlineUnvisitedCityError: true,
  unvisitedCityRecovery: true,
  offlineWaypoints: true,
  reconnected: true,
  installation,
  pageErrors: errors,
};
fs.writeFileSync('docs/pwa-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await context.close();
if (errors.length || !installation.standalone || !installation.germanOffline || installation.error)
  process.exitCode = 1;
