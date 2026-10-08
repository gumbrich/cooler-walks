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
const routeChecks = JSON.parse(fs.readFileSync('docs/canopy-library-validation.json', 'utf8'));
const expectedExposure = (hour, locale) => {
  const route = routeChecks.records.find(
    (r) =>
      r.district === 'Lakeshore' && r.extra === 5 && r.departure === `2024-08-01T${hour}:00:00Z`,
  ).fastest;
  if ((route.shadeMeters + route.sunMeters) / route.distance >= 0.95)
    return `${Math.round((100 * route.shadeMeters) / (route.shadeMeters + route.sunMeters))}%`;
  return route.shadeMeters >= 1000
    ? `${(route.shadeMeters / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
    : `${Math.round(route.shadeMeters / 10) * 10} m`;
};
const serial = 'emulator-5554',
  pkg = 'io.github.gumbrich.coolerwalks';
const adbText = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
assert.deepEqual(adbText('devices').split('\n').slice(1).filter(Boolean), [`${serial}\tdevice`]);
assert.equal(
  adbText('-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'),
  'CoolerWalks_Test',
);
adbText('-s', serial, 'install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
const [device] = await _android.devices();
device.setDefaultTimeout(60000);
const shell = async (cmd) => (await device.shell(cmd)).toString().trim();
const wifi = await shell('settings get global wifi_on'),
  mobile = await shell('settings get global mobile_data');
try {
  await shell(`am force-stop ${pkg}`);
  await shell(`am start -n ${pkg}/.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  const url = new URL(page.url());
  url.searchParams.set('view', 'planner');
  url.searchParams.set('lang', 'en');
  url.searchParams.delete('network');
  await page.goto(url.href);
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-zurich');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  // Block the emulator's radios before loading the optional asset or selecting the trip.
  await shell('svc wifi disable');
  await shell('svc data disable');
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByRole('combobox', { name: 'From', exact: true }).fill('Bellevue');
  await page
    .getByRole('option', { name: /^Bellevue/ })
    .first()
    .click();
  await page.getByRole('combobox', { name: 'To', exact: true }).fill('Zürichhorn');
  await page
    .getByRole('option', { name: /^Zürichhorn/ })
    .first()
    .click();
  await page.getByRole('checkbox', { name: 'Tree shade pilot', exact: true }).check();
  await page.getByRole('button', { name: 'Show routes', exact: true }).click();
  await expect(page.locator('.route-card').first()).toContainText('potential shade', {
    timeout: 60000,
  });
  const afternoonText = await page.locator('.route-card').first().innerText();
  await expect(page.locator('.route-card').first()).toContainText(expectedExposure('14', 'en-GB'));
  await expect(page.locator('.route-card').first()).toContainText('potential shade');
  await expect(page.locator('.canopy-result-note')).toContainText('full foliage assumed');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.route-card').first()).toContainText('möglicher Schatten');
  await page.evaluate(() => window.scrollTo(0, 0));
  const brand = await page.locator('.brand').boundingBox();
  const safeTop = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.body, '::before').height),
  );
  assert(brand && brand.y >= safeTop, 'Native header must clear the status bar');
  await device.screenshot({ path: 'docs/screenshots/android-tree-pilot-de.png' });
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('600');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.route-card').first()).toContainText('möglicher Schatten', {
    timeout: 60000,
  });
  const morningText = await page.locator('.route-card').first().innerText();
  await expect(page.locator('.route-card').first()).toContainText(expectedExposure('08', 'de-DE'));
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('combobox', { name: 'Von', exact: true }).fill('Hofwiesenstrasse 350');
  await page.getByRole('combobox', { name: 'Von', exact: true }).press('Enter');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).fill('Wallisellenstrasse 45');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.route-card').first()).toContainText('möglicher Schatten', {
    timeout: 60000,
  });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  const oerlikonText = await page.locator('.route-card').first().innerText();
  await device.screenshot({ path: 'docs/screenshots/android-oerlikon-tree-shade-de.png' });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    'docs/android-canopy-validation.json',
    JSON.stringify(
      {
        appVersion: '0.17.0',
        build: 16,
        verifiedAt: new Date().toISOString(),
        device: 'CoolerWalks_Test emulator',
        offlineCanopy: true,
        afternoonText,
        morningText,
        oerlikonText,
        expandedCanopyOffline: true,
        german: true,
        pageErrors: errors,
        limits: 'Emulator only; not a physical-phone or field validation.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('PASS Android offline canopy, arrival-time changes, separate labels and German');
} finally {
  await shell(`svc wifi ${wifi === '1' ? 'enable' : 'disable'}`);
  await shell(`svc data ${mobile === '1' ? 'enable' : 'disable'}`);
  await device.close();
}
