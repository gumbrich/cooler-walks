import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { authorizeBrowser } from './lib/site-access.mjs';

const expect = baseExpect.configure({ timeout: 60000 });
const origin = 'https://coolerwalks.ch';
const commit = process.env.RELEASE_COMMIT;
assert.match(
  commit ?? '',
  /^[a-f0-9]{40}$/,
  'Set RELEASE_COMMIT to the verified published revision',
);
const unauth = await fetch(origin + '/de/', { method: 'HEAD' });
assert.equal(unauth.status, 401);
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
try {
  await authorizeBrowser(context, origin);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto(origin + '/de/?view=planner');
  const status = page.locator('.light-routing-status');
  const selected = page.locator('.route-card[aria-pressed="true"] .route-distance');
  await expect(status).toContainText('Schattenroute:');
  await expect(selected).toContainText('490 m');
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText('Sonnenroute: etwa 94%');
  await expect(selected).toContainText('460 m');
  await page.getByRole('button', { name: 'Schatten', exact: true }).click();
  await expect(selected).toContainText('490 m');
  await page.getByLabel('Startdatum', { exact: true }).fill('2026-10-10');
  await expect(status).toContainText('Gebäudeschatten:');
  await expect(selected).toContainText('400 m');
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true }).check();
  await expect(status).toContainText('Gebäudeschatten:');
  await expect(selected).toContainText('400 m');
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText('Ohne Gebäudeschatten:');
  await expect(selected).toContainText('440 m');
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true }).uncheck();
  const choose = async (label, value) => {
    const field = page.getByRole('combobox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
    await expect(page.locator('.pavement-option').first()).toBeVisible();
    await page.locator('.pavement-option').first().click();
  };
  await choose('Von', 'Hofwiesenstrasse 350');
  await choose('Nach', 'Wallisellenstrasse 45');
  await expect(status).toContainText('Sonnenroute:');
  await expect(selected).toContainText('810 m');
  await page.getByRole('button', { name: 'Schatten', exact: true }).click();
  await expect(status).toContainText('Schattenroute:');
  await expect(selected).toContainText('960 m');
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('1320');
  await expect(status).toContainText('Zur gewählten Zeit ist es dunkel.');
  assert.deepEqual(errors, []);
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  fs.writeFileSync(
    `docs/releases/${version}-hosted-light-choice.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        origin,
        commit,
        unauthenticatedStatus: unauth.status,
        june: { shadeDistanceDisplay: '490 m', sunDistanceDisplay: '460 m' },
        october: {
          shadeDistanceDisplay: '400 m',
          sunDistanceDisplay: '440 m',
          explicitBuildingModel: true,
          calmStreets: true,
        },
        oerlikonOctober: {
          shadeDistanceDisplay: '960 m',
          sunDistanceDisplay: '810 m',
          treeAware: true,
        },
        repeatedSwitching: true,
        night: true,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Published site: private gate, June/October opposite routes, Oerlikon trees, calm streets and night passed.',
  );
} finally {
  await browser.close();
}
