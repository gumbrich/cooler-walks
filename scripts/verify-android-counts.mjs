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
adbText('-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
const [device] = await _android.devices();
device.setDefaultTimeout(60000);
const shell = async (cmd) => (await device.shell(cmd)).toString().trim();
const wifi = await shell('settings get global wifi_on'),
  mobile = await shell('settings get global mobile_data');
const errors = [];
try {
  assert.equal(await shell(`pm clear ${pkg}`), 'Success');
  await shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await shell('svc wifi disable');
  await shell('svc data disable');
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-22');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await page.locator('.traffic-counts > summary').click();
  await expect(page.locator('.counter-list li')).toHaveCount(3);
  await expect(page.locator('[data-counter-id="Z030M002"] .counter-value')).toContainText('310');
  await expect(page.locator('.counter-map-marker')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.traffic-counts')).toContainText('Fahrzeuge/Stunde');
  await page.locator('.traffic-counts').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-vehicle-counts.png' });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.traffic-counts')).toHaveCount(0);
  await expect(page.locator('.counter-map-marker')).toHaveCount(0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    'docs/native-counts-validation.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        appVersion: '0.6.0',
        device: 'CoolerWalks_Test Android emulator',
        passed: [
          'Bundled vehicle-count profiles after offline reload',
          'Real Monday 14:00 reference, three counters and map markers',
          'German labels preserve the observations',
          'City change clears counter data and markers',
        ],
        pageErrors: errors,
        limitations: ['No physical-phone test', 'iOS interactions not tested for this update'],
      },
      null,
      2,
    ) + '\n',
  );
  console.log('PASS Android offline vehicle counts, German and city switching');
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
process.exit(0);
