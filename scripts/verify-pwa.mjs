import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { authorizeBrowser } from './lib/site-access.mjs';
const expect = baseExpect.configure({ timeout: 60000 });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cooler-walks-pwa-'));
const origin = (process.env.PWA_ORIGIN ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const context = await chromium.launchPersistentContext(profile, {
  headless: process.env.PWA_HEADFUL !== '1',
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  viewport: { width: 1280, height: 900 },
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
context.setDefaultTimeout(60000);
const browser = context.browser(),
  errors = [];
const ready = async (p) => {
  await expect(p.locator('.route-card').first()).toBeVisible();
  await expect(p.locator('.results')).toHaveAttribute('aria-busy', 'false');
};
const wish = async (p, name) => {
  if (!(await p.locator('.additional-preferences').evaluate((e) => e.open)))
    await p.locator('.additional-preferences summary').click();
  await p.getByRole('checkbox', { name, exact: true }).check();
};
const choose = async (p, label, name) => {
  const field = p.getByRole('combobox', { name: label, exact: true });
  await field.fill(name);
  await field.press('Enter');
  if (await p.locator('.pavement-option').first().isVisible())
    await p.locator('.pavement-option').first().click();
};
let installed = false,
  root;
try {
  await authorizeBrowser(context, origin);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto(origin + '/?view=planner&lang=en');
  await ready(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'crossorigin',
    'use-credentials',
  );
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await expect(page.locator('.canopy-result-note')).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest'),
    installability = await cdp.send('Page.getInstallabilityErrors');
  assert.equal(manifest.errors.length, 0);
  assert.equal(installability.installabilityErrors.length, 0);
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  const pack = page.locator('[data-area-id="ch-zurich"]');
  const started = performance.now();
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(pack.locator('.area-state')).toHaveText('Saved', { timeout: 600000 });
  const downloadMs = Math.round(performance.now() - started);
  console.log('Full Zurich download verified', downloadMs, 'ms');
  await pack.getByRole('button', { name: 'Open this area', exact: true }).click();
  await ready(page);
  root = await browser.newBrowserCDPSession();
  await root.send('PWA.install', { manifestId: origin + '/', installUrlOrBundleUrl: origin + '/' });
  installed = true;
  await root.send('PWA.changeAppUserSettings', {
    manifestId: origin + '/',
    displayMode: 'standalone',
  });
  const window = context.waitForEvent('page');
  await root.send('PWA.launch', { manifestId: origin + '/' });
  const app = await window;
  app.on('pageerror', (e) => errors.push(e.message));
  await app.waitForLoadState('domcontentloaded');
  await ready(app);
  assert(await app.evaluate(() => matchMedia('(display-mode: standalone)').matches));
  await app.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await context.setOffline(true);
  await app.reload();
  await ready(app);
  await app.getByLabel('Startdatum', { exact: true }).fill('2026-06-21');
  await app.getByRole('slider', { name: 'Startzeit', exact: true }).fill('840');
  await app.getByLabel('Startdatum', { exact: true }).fill('2026-10-10');
  await app.getByRole('button', { name: 'Schatten', exact: true }).click();
  await expect(app.locator('.light-routing-status')).toContainText('Gebäudeschatten:');
  await expect(app.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '400 m',
  );
  await app.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(app.locator('.light-routing-status')).toContainText('Ohne Gebäudeschatten:');
  await expect(app.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '440 m',
  );
  await app.getByLabel('Startdatum', { exact: true }).fill('2026-06-21');
  await app.getByRole('button', { name: 'Schatten', exact: true }).click();
  await wish(app, 'Verkehrsberuhigt');
  await wish(app, 'Am Wasser');
  await wish(app, 'Barrierefreiheit');
  await app.getByRole('button', { name: '+15 min', exact: true }).click();
  await app.locator('#detour-minutes').fill('7');
  await ready(app);
  await expect(app.locator('.accessibility-result-note')).toBeVisible();
  await expect(app.locator('.route-elevation').first()).toBeVisible();
  await app.getByRole('button', { name: 'Sonne', exact: true }).click();
  await ready(app);
  await expect(app.locator('html')).toHaveAttribute('data-walk-mode', 'sun');
  await app.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(app.locator('.route-card')).toHaveCount(1);
  await app.getByRole('button', { name: '+5 min', exact: true }).click();
  await ready(app);
  await expect(app.locator('.route-card')).toHaveCount(2);
  await app.locator('.light-choice').scrollIntoViewIfNeeded();
  await app.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(app.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(app.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await app.screenshot({ path: 'docs/screenshots/installed-simple-planner-de.png' });
  await choose(app, 'Von', 'Hofwiesenstrasse 350');
  await choose(app, 'Nach', 'Wallisellenstrasse 45');
  await ready(app);
  await expect(app.locator('.canopy-result-note')).toBeVisible();
  await expect(app.locator('.route-pavement-note').first()).toBeVisible();
  await app.getByRole('button', { name: 'Zwischenziel hinzufügen', exact: true }).click();
  await choose(app, 'Zwischenziel 1', 'Franklinstrasse / Hofwiesenstrasse');
  await ready(app);
  await expect(app.locator('.map-marker')).toHaveCount(3);
  await app.getByRole('button', { name: 'Zwischenziel 1 entfernen', exact: true }).click();
  await ready(app);
  await app.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await expect(app.locator('.zone-legend')).toBeVisible();
  await app.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await app.getByRole('button', { name: /Schnellster Weg/ }).click();
  await app.locator('.traffic-counts > summary').click();
  await expect(app.locator('.traffic-counts')).toContainText('2025');
  await app.reload();
  await ready(app);
  await expect(app.locator('.canopy-result-note')).toBeVisible();
  const report = {
    appVersion: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
    verifiedAt: new Date().toISOString(),
    origin,
    browser: await browser.version(),
    manifestErrors: manifest.errors,
    installabilityErrors: installability.installabilityErrors,
    standalone: true,
    germanOffline: true,
    verifiedCompleteZurichDownload: true,
    downloadMs,
    pavementsDefault: true,
    treesDefault: true,
    calmPavements: true,
    barrierAvoidance: true,
    minuteDetour: true,
    shadeSunThemes: true,
    offlineOctoberShadeDistance: '400 m',
    offlineOctoberSunDistance: '440 m',
    offlineAddressSelection: true,
    offlineWaypoints: true,
    offlineTrafficEvidence: true,
    offlineZones: true,
    pageErrors: errors,
  };
  assert.deepEqual(errors, []);
  fs.writeFileSync('docs/pwa-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  await context.setOffline(false);
  if (installed) await root.send('PWA.uninstall', { manifestId: origin + '/' });
  await context.close();
}
