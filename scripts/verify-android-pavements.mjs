import { _android } from 'playwright';
import { expect } from '@playwright/test';
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
assert.deepEqual(adbText('devices').split('\n').slice(1).filter(Boolean), [`${serial}\tdevice`]);
assert.equal(
  adbText('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'),
  'CoolerWalks_Test',
);
const [device] = await _android.devices();
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
  // Test the bounded pilot independently of the expensive full-city default trip.
  // The public deep link is the same one used by the website, not a test data override.
  await expect(page.locator('.mobile-time')).toBeVisible({ timeout: 60000 });
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).selectOption('en');
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  const pilot = new URL(page.url());
  pilot.searchParams.set('view', 'planner');
  pilot.searchParams.set('network', 'pavements');
  await page.goto(pilot.href);
  await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
  await expect(page.locator('.route-pavement-note').first()).toContainText('4 crossing sections');
  console.log('PASS native pilot routes on the summer reference');
  await shell('svc wifi disable');
  await shell('svc data disable');
  await page.reload();
  await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.getByRole('button', { name: 'Karte vergrössern', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await expect(
    page.getByRole('button', { name: 'Karte verkleinern', exact: true }),
  ).toBeInViewport();
  const attribution = await page.locator('.maplibregl-ctrl-attrib').boundingBox();
  const safeHeight = await page.evaluate(
    () => innerHeight - parseFloat(getComputedStyle(document.body, '::after').height),
  );
  assert(
    attribution && attribution.y + attribution.height <= safeHeight + 1,
    'Map attribution must remain above the native bottom safe area',
  );
  await device.screenshot({ path: 'docs/screenshots/android-pavement-pilot-de.png' });
  await page.getByRole('button', { name: 'Karte verkleinern', exact: true }).click();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Direkt', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1, { timeout: 60000 });
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('1080');
  await expect(page.locator('.route-card')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('.route-card')).toContainText('76%');
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('840');
  await expect(page.locator('.route-card')).toHaveCount(2, { timeout: 60000 });
  console.log('PASS offline pilot, German, enlarged map, time changes and zero detour');
  await page.getByRole('button', { name: 'Zürich-Karte', exact: true }).click();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.route-pavement-note')).toHaveCount(0);
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    appVersion: JSON.parse(fs.readFileSync('package.json')).version,
    device: 'CoolerWalks_Test Android 16 emulator, 2 GB',
    passed: [
      'Public pavement deep link',
      'Summer reference routes and four crossing sections',
      'Offline reload',
      'German',
      'Expanded map',
      'Zero and five-minute budgets',
      'Moving shadows with departure time',
      'Return to regular Zurich at reference time',
    ],
    limitations: [
      'No physical-phone test',
      'No iOS interaction test',
      'Full-city first launch at 6 October afternoon exceeded 60 seconds in the separate general regression, before and after an emulator reboot',
    ],
    pageErrors: errors,
  };
  fs.writeFileSync('docs/native-pavement-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
process.exit(0);
