import { _android } from 'playwright';
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// This integration test resets only our dedicated emulator app and temporarily
// disables that emulator's network. Never target a personal phone/profile.
const pkg = 'io.github.gumbrich.coolerwalks';
const serial = process.env.COOLER_ANDROID_SERIAL ?? 'emulator-5554';
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const adbText = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
assert(serial.startsWith('emulator-'), 'Use a dedicated emulator, never a physical phone.');
const attached = adbText('devices').split('\n').slice(1).filter(Boolean);
assert(
  attached.length === 1 && attached[0].startsWith(`${serial}\t`),
  'Connect only the test emulator.',
);
assert.equal(
  adbText('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'),
  'CoolerWalks_Test',
);
const [device] = await _android.devices();
device.setDefaultTimeout(45000);
const shell = async (command) => (await device.shell(command)).toString().trim();
const wifi = await shell('settings get global wifi_on');
const mobile = await shell('settings get global mobile_data');
const report = {
  checkedAt: new Date().toISOString(),
  appVersion: '0.3.0',
  device: { model: device.model(), avd: 'CoolerWalks_Test', emulated: true },
  android: await shell('getprop ro.build.version.release'),
  webView: (await shell('dumpsys webviewupdate')).match(/Current WebView package.*$/m)?.[0],
  passed: [],
  pageErrors: [],
  limitations: [
    'No physical-device testing',
    'iOS compile/launch blocked by missing Xcode platform; see mobile.md',
  ],
};
const passed = (name) => {
  report.passed.push(name);
  console.log(`PASS ${name}`);
};
const ready = async (page) => {
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
};
try {
  assert.equal(await shell(`pm clear ${pkg}`), 'Success');
  await shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await ready(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.Capacitor.isNativePlatform(),
      window.Capacitor.getPlatform(),
    ]),
    [true, 'android'],
  );
  assert.equal(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    0,
  );
  assert.equal(await page.evaluate(() => location.origin), 'https://localhost');
  passed('Native launch, bundled Zurich map, real routes and no service worker');

  await page.getByRole('button', { name: 'About this app', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Planning works offline');
  await device.input.press('Back');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  passed('Android Back closes the native information view');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const origin = await page.getByRole('combobox', { name: 'From', exact: true }).inputValue();
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await device.tap({ text: /Don.t allow/ });
  await expect(page.getByText(/Location access was unavailable/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue(origin);
  await device.screenshot({ path: 'docs/screenshots/android-location-denied.png' });
  await device.input.press('Back');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  passed('Native permission denial preserves the trip; Back closes editing');

  await shell('svc wifi disable');
  await shell('svc data disable');
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();
  await ready(page);
  for (const city of ['ch-zurich', 'de-munich', 'us-cambridge-ma', 'ch-basel']) {
    await page.getByLabel('City', { exact: true }).selectOption(city);
    await ready(page);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    passed(`Offline map and real routing: ${city}`);
  }
  await page.getByLabel('City', { exact: true }).selectOption('de-munich');
  await ready(page);
  await page.getByLabel('Departure date', { exact: true }).fill('2026-12-21');
  await page.getByRole('slider', { name: 'Departure time' }).fill('720');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('radio', { name: 'Prefer sun', exact: true }).check();
  await device.input.press('Back');
  await ready(page);
  await expect(page.locator('.route-card').first()).toContainText('estimated sun');
  await page.evaluate(() => window.scrollTo(0, 0));
  await device.screenshot({ path: 'docs/screenshots/android-offline-munich.png' });
  passed('Winter sun preference calculates inside the offline native app');

  await page.getByLabel('City', { exact: true }).selectOption('us-cambridge-ma');
  await ready(page);
  await device.input.press('Back');
  await expect
    .poll(
      async () =>
        (await shell('dumpsys activity activities')).match(/mResumedActivity:.*$/m)?.[0] ?? '',
    )
    .not.toContain(pkg);
  await shell(`am start -n ${pkg}/.MainActivity`);
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('us-cambridge-ma');
  await ready(page);
  passed('Root Back minimizes; resume preserves selected city and routes');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  passed('Native viewport has no horizontal overflow');
  await shell(`am force-stop ${pkg}`);
  await shell(`am start -n ${pkg}/.MainActivity`);
  const relaunched = await (await device.webView({ pkg })).page();
  await ready(relaunched);
  await expect(relaunched.getByLabel('City', { exact: true })).toHaveValue('us-cambridge-ma');
  assert.equal(await relaunched.evaluate(() => navigator.onLine), false);
  passed('Cold native relaunch works offline and remembers the city');
  await relaunched.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await ready(relaunched);
  await relaunched.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await device.screenshot({ path: 'docs/screenshots/android-offline-cambridge.png' });
  assert.deepEqual(report.pageErrors, []);
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
await fs.writeFile('docs/native-validation.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('Native Android validation complete. Network settings restored.');
