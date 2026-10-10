import { _android, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 60000 });
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
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-zurich');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await expect(page.locator('.canopy-result-note')).toBeVisible();
  await page.locator('.additional-preferences summary').click();
  for (const name of ['Calm streets', 'Waterside', 'Accessibility'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await expect(page.locator('.accessibility-result-note')).toBeVisible();
  await page.getByRole('button', { name: '+15 min', exact: true }).click();
  await page.locator('#detour-minutes').fill('7');
  await expect(page.locator('.detour-range output')).toHaveText('+7 min');
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-walk-mode', 'sun');
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await shell('svc wifi disable');
  await shell('svc data disable');
  await page.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1, { timeout: 60000 });
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  await page.locator('.light-choice').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-simple-sun-de.png' });
  await page.getByRole('button', { name: 'Schatten', exact: true }).click();
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await page.locator('.route-card').first().scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-simple-results-de.png' });
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  const from = page.getByRole('combobox', { name: 'Von', exact: true }),
    to = page.getByRole('combobox', { name: 'Nach', exact: true });
  await from.fill('Hofwiesenstrasse 350');
  await from.press('Enter');
  await page.locator('.pavement-option').first().click();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await to.fill('Wallisellenstrasse 45');
  await to.press('Enter');
  await page.locator('.pavement-option').first().click();
  await expect(page.locator('.route-pavement-note').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.canopy-result-note')).toBeVisible();
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('600');
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  await expect(page.locator('.route-arrival').first()).toContainText('10:');
  await page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await expect(page.locator('.zone-legend')).toBeVisible();
  await page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await from.fill('Bahnhofquai / Museumstrasse');
  await from.press('Enter');
  await to.fill('Bürkliplatz / Stadthausquai');
  await to.press('Enter');
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  await page.getByRole('button', { name: /Schnellster Weg/ }).click();
  await page.locator('.traffic-counts > summary').click();
  await expect(page.locator('.traffic-counts')).toContainText('2025');
  await expect(page.locator('.counter-list li').first()).toBeVisible();
  await expect(page.locator('.counter-slot').first()).toContainText('10:00');
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('480');
  await expect(page.locator('.counter-slot').first()).toContainText('08:00', { timeout: 60000 });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator('.traffic-counts, .canopy-result-note, .route-pavement-note'),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-zurich');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    version: JSON.parse(fs.readFileSync('package.json')).version,
    device: 'CoolerWalks_Test, Android 36.1, 2 GB',
    passed: [
      'Municipal pavements and tree shade enabled by default',
      'Calmer streets, water and accessibility together',
      'Zero, five, seven and fifteen minute budgets',
      'Sun/shade buttons and themes',
      'Elevation summaries with accessibility selected',
      'Offline route recalculation and northern Zurich address-side selection',
      'Moving arrival-time shade, street-zone overlay and historical counter hour updates offline',
      'City change clears incompatible tree, pavement and traffic data',
      'English/German, no horizontal overflow or JavaScript errors',
    ],
    limitations: ['No physical-phone test', 'No iOS interaction test', 'No field-validation claim'],
  };
  fs.writeFileSync(
    'docs/native-preferences-validation.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
process.exit(0);
