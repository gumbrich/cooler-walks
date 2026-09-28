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
const origin = 'http://127.0.0.1:4173';
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
await context.setOffline(false);
await cdp.send('Network.overrideNetworkState', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi',
});
await expect(page.locator('.offline-banner')).toHaveCount(0);
let installation = { installed: false, standalone: false, error: null };
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
  installation.standalone = await app.evaluate(
    () => matchMedia('(display-mode: standalone)').matches,
  );
  if (!installation.standalone) throw new Error('Installed app did not launch standalone');
  await app.screenshot({ path: 'docs/screenshots/installed-app.png' });
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
  offlineWaterPreference: true,
  offlineWaypoints: true,
  reconnected: true,
  installation,
  pageErrors: errors,
};
fs.writeFileSync('docs/pwa-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await context.close();
if (errors.length || !installation.standalone) process.exitCode = 1;
