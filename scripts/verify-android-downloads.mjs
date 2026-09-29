import { _android } from 'playwright';
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Destructive only to Cooler Walks on our named, isolated test AVD.
const pkg = 'io.github.gumbrich.coolerwalks',
  serial = process.env.COOLER_ANDROID_SERIAL ?? 'emulator-5554';
const adb = path.join(
  process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk'),
  'platform-tools/adb',
);
const adbText = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
assert(serial.startsWith('emulator-'));
assert.equal(
  adbText('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'),
  'CoolerWalks_Test',
);
const device = (await _android.devices()).find((d) => d.serial() === serial);
assert(device);
device.setDefaultTimeout(60000);
const shell = async (command) => (await device.shell(command)).toString().trim();
const wifi = await shell('settings get global wifi_on'),
  mobile = await shell('settings get global mobile_data');
const report = {
  checkedAt: new Date().toISOString(),
  appVersion: '0.4.0',
  device: device.model(),
  emulated: true,
  passed: [],
  pageErrors: [],
};
const passed = (name) => {
  report.passed.push(name);
  console.log(`PASS ${name}`);
};
const ready = async (page) => {
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
};
try {
  adbText('-s', serial, 'reverse', 'tcp:4180', 'tcp:4180');
  assert.equal(await shell(`pm clear ${pkg}`), 'Success');
  await shell(`am start -n ${pkg}/.MainActivity`);
  let page = await (await device.webView({ pkg })).page();
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await ready(page);
  const inventory = await page.evaluate(
    async () => (await (await fetch('/native-areas.json')).json()).areaIds,
  );
  assert.deepEqual(inventory, ['ch-zurich']);
  passed('Lite app contains Zurich only, with working offline-ready routes');
  await page.getByLabel('City', { exact: true }).selectOption('de-munich');
  await expect(
    page.getByText('Download this walking area to open its map and plan offline.'),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  passed('Missing native area is explicit and has no invented route');
  await page.getByRole('button', { name: 'Open downloads', exact: true }).click();
  const compact = page.locator('[data-area-id="de-munich-old-town"]');
  await compact.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(compact.locator('.area-state')).toHaveText('Saved', { timeout: 60000 });
  await compact.scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-area-download.png' });
  const files = await shell(`run-as ${pkg} find files -name '*.cwp'`);
  assert(files.includes('cooler-areas/de-munich-old-town/'));
  passed('Verified HTTP-loopback download persisted in private native filesystem');
  await compact.getByRole('button', { name: 'Use this area', exact: true }).click();
  await ready(page);
  await expect(page.locator('.map-location')).toContainText('Old Town essentials');
  passed('Downloaded area renders its real map, route and building-shade model');
  await shell('svc wifi disable');
  await shell('svc data disable');
  adbText('-s', serial, 'reverse', '--remove', 'tcp:4180');
  await shell(`am force-stop ${pkg}`);
  await shell(`am start -n ${pkg}/.MainActivity`);
  page = await (await device.webView({ pkg })).page();
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await ready(page);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await expect(page.locator('.map-location')).toContainText('Old Town essentials');
  await expect(page.locator('.map-failure')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await device.screenshot({ path: 'docs/screenshots/android-downloaded-offline.png' });
  passed('Cold restart loads saved native map and routes without network or download server');
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  await page
    .locator('[data-area-id="de-munich-old-town"]')
    .getByRole('button', { name: 'Remove Old Town essentials download' })
    .click();
  await expect(page.locator('[data-area-id="de-munich-old-town"] .area-state')).toHaveText(
    'Available',
  );
  assert(!(await shell(`run-as ${pkg} find files -name '*.cwp'`)).includes('de-munich-old-town'));
  await page.getByRole('button', { name: 'Close information' }).click();
  await ready(page);
  passed('Remove frees native download while keeping the open walk usable');
  assert.deepEqual(report.pageErrors, []);
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  if (adbText('-s', serial, 'reverse', '--list').includes('tcp:4180'))
    adbText('-s', serial, 'reverse', '--remove', 'tcp:4180');
  await device.close();
}
await fs.writeFile('docs/native-download-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log('Native area-download checks complete. Emulator network restored.');
process.exit(0);
