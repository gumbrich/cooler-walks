import { chromium, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { authorizeBrowser } from './lib/site-access.mjs';
import { checkMunichPlanner, munichReady } from './lib/munich-browser.mjs';
const expect = baseExpect.configure({ timeout: 60000 });
const origin = (process.env.PWA_ORIGIN ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cooler-munich-pwa-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  viewport: { width: 1280, height: 900 },
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
context.setDefaultTimeout(60000);
const errors = [];
let root,
  installed = false;
try {
  await authorizeBrowser(context, origin);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('cw-city', 'de-munich');
    localStorage.setItem('cw-area', 'de-munich');
  });
  await page.goto(origin + '/?view=planner&lang=en');
  await munichReady(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await context.newCDPSession(page);
  assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  const pack = page.locator('[data-area-id="de-munich"]');
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(pack.locator('.area-state')).toHaveText('Saved');
  await pack.getByRole('button', { name: 'Open this area', exact: true }).click();
  await munichReady(page);
  root = await context.browser().newBrowserCDPSession();
  await root.send('PWA.install', { manifestId: origin + '/', installUrlOrBundleUrl: origin + '/' });
  installed = true;
  await root.send('PWA.changeAppUserSettings', {
    manifestId: origin + '/',
    displayMode: 'standalone',
  });
  const launched = context.waitForEvent('page');
  await root.send('PWA.launch', { manifestId: origin + '/' });
  const app = await launched;
  app.on('pageerror', (e) => errors.push(e.message));
  await app.waitForLoadState('domcontentloaded');
  await munichReady(app);
  assert(await app.evaluate(() => matchMedia('(display-mode: standalone)').matches));
  await context.setOffline(true);
  await app.reload();
  await munichReady(app);
  const checks = await checkMunichPlanner(app);
  await app.screenshot({ path: 'docs/screenshots/munich-features-pwa-de.png' });
  assert.deepEqual(errors, []);
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  fs.writeFileSync(
    `docs/releases/${version}-pwa-munich.json`,
    JSON.stringify(
      {
        version,
        origin,
        checkedAt: new Date().toISOString(),
        installed: true,
        standalone: true,
        offlineReload: true,
        fullMunichDownload: true,
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Munich installed PWA offline checks passed', checks);
} finally {
  if (installed) await root.send('PWA.uninstall', { manifestId: origin + '/' }).catch(() => {});
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
