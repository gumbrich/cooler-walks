import { _android, expect as baseExpect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pavementReference } from './lib/pavement-browser.mjs';

const expect = baseExpect.configure({ timeout: 60000 });
const adb = path.join(
  process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk'),
  'platform-tools/adb',
);
const serial = 'emulator-5554',
  pkg = 'io.github.gumbrich.coolerwalks';
assert.equal(
  execFileSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], {
    encoding: 'utf8',
  }).trim(),
  'CoolerWalks_Test',
);
const device = (await _android.devices()).find((d) => d.serial() === serial);
assert(device);
device.setDefaultTimeout(60000);
const shell = async (cmd) => (await device.shell(cmd)).toString().trim();
const wifi = await shell('settings get global wifi_on'),
  mobile = await shell('settings get global mobile_data');
const errors = [];
try {
  await shell(`am force-stop ${pkg}`);
  await shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).selectOption('en');
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-zurich');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await pavementReference(page);
  if (!(await page.getByRole('button', { name: '+5 min', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  const status = page.locator('.light-routing-status');
  const selected = page.locator('.route-card[aria-pressed="true"] .route-distance');
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  await expect(status).toContainText('Shadier option:');
  await expect(selected).toContainText('490 m');
  await shell('svc wifi disable');
  await shell('svc data disable');
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await expect(status).toContainText('Sunnier option: about 94%');
  await expect(selected).toContainText('460 m');
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  await expect(status).toContainText('Shadier option:');
  await expect(selected).toContainText('490 m');
  await page.getByLabel('Departure date', { exact: true }).fill('2026-10-10');
  await expect(status).toContainText('Building shade:');
  await expect(selected).toContainText('400 m');
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await expect(status).toContainText('Without building shade:');
  await expect(selected).toContainText('440 m');
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  await expect(selected).toContainText('400 m');
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Calm streets', exact: true }).check();
  await expect(status).toContainText('Building shade:');
  await expect(selected).toContainText('400 m');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(status).toContainText('Gebäudeschatten:');
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await page.locator('.light-choice').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/shade-restored-android-de.png' });
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('1320');
  await expect(status).toContainText('Zur gewählten Zeit ist es dunkel.');
  assert.deepEqual(errors, []);
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  fs.writeFileSync(
    `docs/releases/${version}-android-light-choice.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        version,
        device: 'CoolerWalks_Test',
        offlineSwitching: true,
        shadeDistanceDisplay: '490 m',
        sunDistanceDisplay: '460 m',
        repeatedSwitching: true,
        octoberShadeDistanceDisplay: '400 m',
        octoberSunDistanceDisplay: '440 m',
        buildingComparisonWithCalm: true,
        night: true,
        languages: ['en', 'de'],
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Android offline Sun/Shade route switching and explicit fallbacks passed.');
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
