import { _android, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const adb = path.join(
  process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk'),
  'platform-tools/adb',
);
const serial = 'emulator-5554',
  pkg = 'io.github.gumbrich.coolerwalks';
const adbText = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
assert.equal(
  adbText('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'),
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
  await expect(page.locator('.mobile-time')).toBeVisible({ timeout: 60000 });
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).selectOption('en');
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await from.fill('');
  await to.fill('Waidbadstrasse');
  await page
    .getByRole('option', { name: /^Waidbadstrasse/ })
    .first()
    .click();
  await from.fill('Bucheggplatz');
  await page
    .getByRole('option', { name: /^Bucheggplatz/ })
    .first()
    .click();
  await page.locator('#route-priority').selectOption('flat');
  await expect(page.getByRole('button', { name: /Flatter route/ })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.route-elevation').first()).toContainText('95 m');
  await expect(page.locator('.route-elevation').last()).toContainText('90 m');
  await page.getByRole('button', { name: 'Show routes', exact: true }).click();
  await page.locator('.elevation-profile summary').click();
  await expect(page.locator('.elevation-chart svg')).toBeVisible();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible();
  await page.locator('.route-card.selected').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-elevation-de.png' });
  await shell('svc wifi disable');
  await shell('svc data disable');
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Direkt', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1, { timeout: 60000 });
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible({ timeout: 60000 });
  await page.locator('#route-priority').selectOption('shade');
  await expect(page.locator('.route-elevation')).toHaveCount(0, { timeout: 60000 });
  await page.locator('#route-priority').selectOption('flat');
  await expect(page.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    version: JSON.parse(fs.readFileSync('package.json')).version,
    device: 'CoolerWalks_Test, Android 36.1, 2 GB',
    passed: [
      'Real Bucheggplatz–Waidbadstrasse flatter alternative',
      'Estimated ascent/descent and profile',
      'English/German',
      'Zero and five-minute budgets offline',
      'Preference toggling offline',
      'No horizontal overflow or JavaScript errors',
    ],
    limitations: ['No physical-phone test', 'No iOS interaction test', 'No field-validation claim'],
  };
  fs.writeFileSync('docs/native-elevation-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
process.exit(0);
