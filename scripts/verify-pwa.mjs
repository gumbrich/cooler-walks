import {
  pavementReference,
  standardReference,
  confirmGermanAddressSides,
} from './lib/pavement-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { authorizeBrowser } from './lib/site-access.mjs';
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
// Route eligibility changes with the real solar date/time. Use the same
// documented summer reference as the browser water/waypoint regression.
await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('Browser error:', m.text());
});
page.on('requestfailed', (r) => console.log('Request failed:', r.url(), r.failure()));
const origin = (process.env.PWA_ORIGIN ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
await authorizeBrowser(context, origin);
await page.goto(origin + '/?view=planner');
await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
  'crossorigin',
  'use-credentials',
);
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.route-model-note').first()).toContainText('3D roofs');
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await page.waitForFunction(
  async () =>
    Boolean(await caches.match('/data/zurich.json', { ignoreSearch: true })) &&
    Boolean(await caches.match('/data/zurich-map.geojson', { ignoreSearch: true })) &&
    Boolean(await caches.match('/data/zurich-shade-library.json', { ignoreSearch: true })) &&
    Boolean(await caches.match('/data/zurich-pavements.json', { ignoreSearch: true })),
);
// Canopy is fetched on demand and its exact version must survive offline reload.
const canopyToggle = page.getByRole('checkbox', {
  name: 'Tree shade pilot',
  exact: true,
  includeHidden: true,
});
await expect(canopyToggle).not.toBeChecked();
if (
  await page.evaluate(async () =>
    Boolean(await caches.match('/data/zurich-canopy-library.json', { ignoreSearch: true })),
  )
)
  throw new Error('Canopy should not be fetched before the user enables the scenario');
await page.locator('.model-options summary').click();
await canopyToggle.check();
await expect(page.locator('.route-card').first()).toContainText('potential shade', {
  timeout: 60000,
});
await page.waitForFunction(async () =>
  Boolean(await caches.match('/data/zurich-canopy-library.json', { ignoreSearch: true })),
);
await canopyToggle.uncheck();
await expect(page.locator('.route-card').first()).toContainText('estimated shade', {
  timeout: 60000,
});
const cdp = await context.newCDPSession(page);
const manifest = await cdp.send('Page.getAppManifest');
const installability = await cdp.send('Page.getInstallabilityErrors');
if (manifest.errors.length) throw new Error('Manifest errors: ' + JSON.stringify(manifest.errors));
if (installability.installabilityErrors.length)
  throw new Error('Installability errors: ' + JSON.stringify(installability));
// Cache the municipal pavement working set before exercising its offline reload.
await page.getByRole('button', { name: 'Use pavements & crossings', exact: true }).click();
await pavementReference(page);
await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
await page.getByRole('button', { name: 'Standard walking network', exact: true }).click();
await standardReference(page);
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
// Download one additional city while controlled by the production worker.
await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true', {
  timeout: 60000,
});
await page.waitForFunction(
  async () =>
    Boolean(await caches.match('/data/basel.json', { ignoreSearch: true })) &&
    Boolean(await caches.match('/data/basel-map.geojson', { ignoreSearch: true })),
);
const unvisitedCityPrecached = await page.evaluate(async () =>
  Boolean(await caches.match('/data/cambridge.json', { ignoreSearch: true })),
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
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await page.locator('.model-options summary').click();
await canopyToggle.check();
await expect(page.locator('.route-card').first()).toContainText('potential shade', {
  timeout: 60000,
});
await canopyToggle.uncheck();
await expect(page.locator('.route-card').first()).toContainText('estimated shade', {
  timeout: 60000,
});
console.log('PASS optional canopy asset and routes survive offline reload');
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
// Wait for actual offline map tiles before capture. Full-page software-WebGL
// captures can stall while a large GeoJSON view is still settling.
await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
  timeout: 60000,
});
await page.screenshot({ path: 'docs/screenshots/desktop-offline.png' });
await page.getByRole('button', { name: 'Use pavements & crossings', exact: true }).click();
await pavementReference(page);
await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
await expect(page.locator('.route-pavement-note').first()).toContainText('4 crossing sections');
await page.getByRole('button', { name: 'Standard walking network', exact: true }).click();
await standardReference(page);
await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
await page.locator('#route-priority').selectOption('water');
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
// A visited trip only caches its working tiles. Exercise the complete ~205 MB
// Zurich download before planning in an unvisited district while offline.
await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
const zurichPack = page.locator('[data-area-id="ch-zurich"]');
const zurichDownloadStarted = performance.now();
await zurichPack.getByRole('button', { name: 'Download area', exact: true }).click();
try {
  // Matches the existing full-supplement download policy. The public 205 MB
  // transfer was still progressing at 77% when the former 80 MB test expired.
  // Route-calculation and interaction limits remain unchanged.
  await expect(zurichPack.locator('.area-state')).toHaveText('Saved', { timeout: 600000 });
} catch (error) {
  console.log('Full Zurich download diagnostics:', await page.getByRole('dialog').innerText());
  await context.close();
  throw error;
}
const zurichDownloadMs = Math.round(performance.now() - zurichDownloadStarted);
console.log(`PASS complete Zurich download in ${zurichDownloadMs} ms`);
await page.getByRole('button', { name: 'Close information' }).click();
let installation = {
  installed: false,
  standalone: false,
  germanOffline: false,
  vehicleCountsOffline: false,
  addressSearchOffline: false,
  pavementsOffline: false,
  error: null,
};
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
  await app.locator('#route-priority').selectOption('calm');
  await expect(app.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible({
    timeout: 60000,
  });
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  installation.germanOffline = true;
  await app.screenshot({ path: 'docs/screenshots/installed-german-app.png' });
  await app.getByLabel('Startdatum', { exact: true }).fill('2026-06-22');
  await app.getByRole('slider', { name: 'Startzeit', exact: true }).fill('840');
  await expect(app.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await app.getByRole('button', { name: /Schnellster Weg/ }).click();
  await app.locator('.traffic-counts > summary').click();
  await expect(app.locator('.counter-list li')).toHaveCount(3);
  await expect(app.locator('[data-counter-id="Z030M002"] .counter-value')).toContainText('310');
  installation.vehicleCountsOffline = true;
  await app.locator('.traffic-counts').scrollIntoViewIfNeeded();
  await app.screenshot({ path: 'docs/screenshots/installed-vehicle-counts.png' });
  await app.locator('#route-priority').selectOption('shade');
  await app.getByRole('combobox', { name: 'Von', exact: true }).fill('Hofwiesenstrasse 350');
  await app.getByRole('combobox', { name: 'Von', exact: true }).press('Enter');
  await app.getByRole('combobox', { name: 'Nach', exact: true }).fill('Wallisellenstrasse 45');
  await app.getByRole('combobox', { name: 'Nach', exact: true }).press('Enter');
  await expect(app.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await expect(app.locator('.route-arrival').first()).toContainText('Ankunft gegen 14:10');
  await app.locator('.walk-details > summary').click();
  await expect(app.locator('.walk-details')).toContainText(
    'Schatten wird für deine erwartete Ankunft',
  );
  await app.locator('.walk-details > summary').click();
  installation.arrivalShadeOffline = true;
  await expect(app.getByRole('button', { name: /Schnellster Weg/ })).toBeVisible();
  await expect(app.locator('.map-marker')).toHaveCount(2);
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await expect(app.locator('.map-failure')).toHaveCount(0);
  installation.addressSearchOffline = true;
  if (!(await app.locator('.model-options').evaluate((el) => el.open)))
    await app.locator('.model-options summary').click();
  await app.getByRole('checkbox', { name: 'Baumschatten-Pilot', exact: true }).check();
  await expect(app.locator('.route-card').first()).toContainText('möglicher Schatten', {
    timeout: 60000,
  });
  await expect(app.locator('.canopy-result-note')).toContainText('volle Belaubung');
  installation.expandedCanopyOffline = true;
  await app.screenshot({ path: 'docs/screenshots/installed-oerlikon-tree-shade-de.png' });
  await app.getByRole('checkbox', { name: 'Baumschatten-Pilot', exact: true }).uncheck();
  await app.screenshot({ path: 'docs/screenshots/installed-zurich-addresses.png' });
  await app.locator('.map-canvas').click({ position: { x: 320, y: 320 } });
  await expect(app.getByRole('group', { name: 'Diesen Kartenpunkt verwenden' })).toBeVisible();
  await app.screenshot({ path: 'docs/screenshots/installed-map-selection.png' });
  await app.getByRole('button', { name: 'Kartenpunkt schliessen' }).click();
  await app.getByRole('button', { name: 'Trottoirs und Querungen nutzen', exact: true }).click();
  await confirmGermanAddressSides(app);
  installation.pavementAddressSelectionOffline = true;
  await expect(app.getByRole('combobox', { name: 'Von', exact: true })).toHaveValue(
    'Hofwiesenstrasse 350',
  );
  await expect(app.locator('.route-pavement-note').first()).toContainText('Querungsabschnitte', {
    timeout: 60000,
  });
  await app.reload();
  await expect(app.locator('.route-pavement-note').first()).toContainText('Querungsabschnitte', {
    timeout: 60000,
  });
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await app.screenshot({ path: 'docs/screenshots/installed-pavement-pilot-de.png' });
  installation.pavementsOffline = true;
  await app.getByRole('button', { name: 'Standard-Fusswegnetz', exact: true }).click();
  const elevationFrom = app.getByRole('combobox', { name: 'Von', exact: true });
  const elevationTo = app.getByRole('combobox', { name: 'Nach', exact: true });
  await elevationFrom.fill('');
  await elevationTo.fill('Waidbadstrasse');
  await elevationTo.press('Enter');
  await elevationFrom.fill('Bucheggplatz');
  await elevationFrom.press('Enter');
  await app.locator('#route-priority').selectOption('flat');
  await expect(app.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible({ timeout: 60000 });
  await expect(app.locator('.route-elevation').last()).toContainText('90 m');
  await app.locator('.elevation-profile summary').click();
  await expect(app.locator('.elevation-chart svg')).toBeVisible();
  await app.locator('.results').scrollIntoViewIfNeeded();
  await app.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await app.screenshot({ path: 'docs/screenshots/installed-elevation-de.png' });
  installation.elevationOffline = true;
  await app.locator('.additional-preferences summary').click();
  await app.getByRole('checkbox', { name: 'Schatten', exact: true }).check();
  await app.getByRole('checkbox', { name: 'Am Wasser', exact: true }).check();
  await expect(app.locator('#route-priority')).toHaveValue('flat');
  await expect(app.locator('.preference-comparison')).toContainText('Am Wasser', {
    timeout: 60000,
  });
  await app.locator('.preference-comparison').scrollIntoViewIfNeeded();
  await app.screenshot({ path: 'docs/screenshots/installed-combined-preferences-de.png' });
  installation.combinedPreferencesOffline = true;
  await context.setOffline(false);
} catch (e) {
  installation.error = e.message;
} finally {
  if (installation.installed) await root.send('PWA.uninstall', { manifestId: origin + '/' });
}
const report = {
  appVersion: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  browser: await browser.version(),
  verifiedAt: new Date().toISOString(),
  origin,
  manifestErrors: manifest.errors,
  installabilityErrors: installability.installabilityErrors,
  offlineReload: true,
  offlineRoutes: true,
  canopyOffline: true,
  pavementsOffline: true,
  offlineMap: true,
  verifiedAreaDownload: true,
  verifiedCompleteZurichDownload: true,
  zurichDownloadMs,
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
if (
  errors.length ||
  !installation.standalone ||
  !installation.germanOffline ||
  !installation.vehicleCountsOffline ||
  !installation.addressSearchOffline ||
  !installation.pavementsOffline ||
  !installation.expandedCanopyOffline ||
  !installation.elevationOffline ||
  !installation.combinedPreferencesOffline ||
  installation.error
)
  process.exitCode = 1;
