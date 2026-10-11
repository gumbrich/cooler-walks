import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { authorizeBrowser, siteAccess } from './lib/site-access.mjs';

const origin = 'https://coolerwalks.ch';
const expect = baseExpect.configure({ timeout: 60000 });
const cookie = await siteAccess(origin);
assert.equal((await fetch(origin + '/de/', { method: 'HEAD' })).status, 401);
const assets = [];
for (const file of fs
  .readdirSync('dist/assets')
  .filter((f) => /^(route-worker-.*\.js|main-.*\.css)$/.test(f))) {
  const response = await fetch(`${origin}/assets/${file}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200, file);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes, fs.readFileSync(`dist/assets/${file}`));
  assets.push({ file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
assert.equal(assets.length, 2);
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await authorizeBrowser(context, origin);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto(origin + '/de/?view=planner');
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(page.locator('.light-routing-status')).toContainText('Sonnenroute: etwa 94%');
  await expect(page.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '460 m',
  );
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.getByRole('button', { name: 'Vergrössern', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/sun-lines-live-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('.mobile-save').isVisible()) await page.locator('.mobile-save').click();
  await page.getByRole('button', { name: 'Karte vergrössern', exact: true }).click();
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/sun-lines-live-phone.png', fullPage: true });
  assert.deepEqual(errors, []);
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  fs.writeFileSync(
    `docs/releases/${version}-hosted.json`,
    JSON.stringify(
      {
        version,
        origin,
        checkedAt: new Date().toISOString(),
        assets,
        anonymousAccess: 401,
        sunRouteDistance: '460 m',
        sunnyPercent: 94,
        viewports: ['desktop close zoom', 'phone expanded map'],
        pageErrors: errors,
        limitations: [
          'No new field or physical-device validation; unchanged data packs were not downloaded again.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Live sunlight-route rendering passed; worker/CSS match the tested build.');
} finally {
  await browser.close();
}
