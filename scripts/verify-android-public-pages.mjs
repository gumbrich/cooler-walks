import { _android } from 'playwright';
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const adb = path.join(
  process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk'),
  'platform-tools/adb',
);
const serial = 'emulator-5554';
const text = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
assert.equal(
  text('devices').split('\n').slice(1).filter(Boolean).length,
  1,
  'Connect only the test emulator.',
);
assert.equal(text('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'), 'CoolerWalks_Test');
const [device] = await _android.devices();
const pkg = 'io.github.gumbrich.coolerwalks';
try {
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(45000);
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'How we estimate' }).click();
  await page.getByRole('link', { name: 'Help & feedback' }).click();
  await expect(page.getByRole('heading', { name: 'Help & feedback' })).toBeVisible({
    timeout: 15000,
  });
  assert.equal(new URL(page.url()).pathname, '/support/index.html');
  await expect(page.getByRole('link', { name: 'knoerzerjohannes@protonmail.com' })).toBeVisible();
  const insets = await page.evaluate(() => ({
    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'),
    brandTop: document.querySelector('.brand').getBoundingClientRect().top,
  }));
  assert(
    insets.brandTop >= (Number.parseFloat(insets.safeTop) || 0),
    'Header must clear the native status bar.',
  );
  await page.waitForTimeout(1000);
  await device.screenshot({ path: 'docs/screenshots/android-support.png' });
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location is your choice' })).toBeVisible({
    timeout: 15000,
  });
  assert.equal(new URL(page.url()).pathname, '/privacy/index.html');
  await page.getByRole('link', { name: 'Open planner' }).click();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.getByRole('button', { name: 'So schätzen wir' }).click();
  await page.getByRole('link', { name: 'Hilfe & Feedback' }).click();
  await expect(
    page.getByRole('heading', { name: 'Wie funktionieren verkehrsberuhigte Wege?' }),
  ).toBeVisible();
  assert.equal(new URL(page.url()).pathname, '/de/support/index.html');
  await page.getByRole('link', { name: 'Datenschutz', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Der Standort bleibt deine Entscheidung' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Planer öffnen' }).click();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  const report = {
    checkedAt: new Date().toISOString(),
    platform: 'Android emulator only',
    passed: [
      'Native help page, real mailto link and status-bar clearance',
      'Bundled privacy page',
      'German bundled help and privacy, returning to the German planner',
      'Return to real planner after static-page navigation',
    ],
    insets,
  };
  fs.writeFileSync(
    'docs/native-public-pages-validation.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} finally {
  await device.close();
}
process.exit(0);
