import { _android } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkMunichPlanner } from './lib/munich-browser.mjs';

const adb = path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb');
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
  await shell('svc wifi disable');
  await shell('svc data disable');
  await shell(`am force-stop ${pkg}`);
  await shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.on('pageerror', (e) => errors.push(e.message));
  if (await page.locator('.hero-cta').isVisible()) await page.locator('.hero-cta').click();
  const checks = await checkMunichPlanner(page);
  await page.locator('.light-choice').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/munich-features-android-de.png' });
  assert.deepEqual(errors, []);
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  fs.writeFileSync(
    `docs/releases/${version}-android-munich.json`,
    JSON.stringify(
      {
        version,
        checkedAt: new Date().toISOString(),
        emulator: 'CoolerWalks_Test',
        offline: true,
        checks,
        pageErrors: errors,
        limitations: ['Emulator only; no physical phone or iOS device test.'],
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Munich Android offline checks passed', checks);
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
