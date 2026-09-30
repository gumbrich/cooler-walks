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
  // Finish first launch before setting the reference trip. Reloading during
  // the initial 3D-data transfer can overlap two large loads on a 2 GB AVD.
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.mobile-time .time-control')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Departure time', exact: true })).toHaveCount(1);
  await page.clock.setFixedTime(new Date('2026-06-22T12:00:00Z'));
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-22');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  console.log('PASS Android first launch and reference-date routes');
  await page.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await shell('svc wifi disable');
  await shell('svc data disable');
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.route-model-note').first()).toContainText('3D roofs');
  console.log('PASS Android offline reload and bundled 3D data');
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await device.screenshot({ path: 'docs/screenshots/android-3d-shade.png' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator('.mobile-time .time-control')).toBeInViewport();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await device.screenshot({ path: 'docs/screenshots/android-lean-planner.png' });
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-22');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await expect(page.locator('.route-arrival').first()).toContainText('Arrive around 14:19');
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.walk-details')).toContainText(
    'Shadows follow your expected arrival along the walk',
  );
  await page.locator('.walk-details > summary').click();
  await page.locator('.traffic-counts > summary').click();
  await expect(page.locator('.counter-list li')).toHaveCount(3);
  await expect(page.locator('[data-counter-id="Z030M002"] .counter-value')).toContainText('310');
  await expect(page.locator('.counter-map-marker')).toHaveCount(3);
  // A single walk crosses the hour boundary: use each counter's passing time.
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('885');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await expect(page.locator('[data-counter-id="Z049M002"] .counter-slot')).toContainText(
    '14:00–15:00',
  );
  await expect(page.locator('[data-counter-id="Z031M002"] .counter-slot')).toContainText(
    '15:00–16:00',
  );
  console.log('PASS Android passing-time counter profiles across an hour boundary');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.traffic-counts')).toContainText('Fahrzeuge/Stunde');
  await page.locator('.traffic-counts').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-vehicle-counts.png' });
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).check();
  await expect(page.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await page.locator('.traffic-profile > summary').click();
  await expect(page.locator('.traffic-profile')).toContainText('Tempo-30-Strassen');
  await expect(page.locator('.traffic-profile')).toContainText('Vor-Ort-Prüfung steht aus');
  await page.locator('.traffic-profile').scrollIntoViewIfNeeded();
  await device.screenshot({ path: 'docs/screenshots/android-traffic-v2.png' });
  console.log('PASS Android traffic v2 comparison and German street breakdown');
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).uncheck();
  await page.getByRole('combobox', { name: 'Von', exact: true }).fill('Hofwiesenstrasse 350');
  await page.getByRole('option', { name: /^Hofwiesenstrasse 350 Amtliche Adresse/ }).click();
  await expect(page.getByRole('combobox', { name: 'Von', exact: true })).toHaveValue(
    'Hofwiesenstrasse 350',
  );
  await page.getByRole('combobox', { name: 'Nach', exact: true }).fill('Wallisellenstrasse 45');
  await page.getByRole('option', { name: /^Wallisellenstrasse 45 Amtliche Adresse/ }).click();
  await expect(page.getByRole('combobox', { name: 'Nach', exact: true })).toHaveValue(
    'Wallisellenstrasse 45',
  );
  await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /Schnellster Weg/ })).toBeVisible();
  await expect(page.locator('.route-model-note').first()).toContainText('100%');
  await expect(page.locator('.route-arrival').first()).toContainText('Ankunft gegen 14:10');
  await expect(page.locator('.map-marker')).toHaveCount(2);
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true', {
    timeout: 60000,
  });
  await expect(page.locator('.map-failure')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await device.screenshot({ path: 'docs/screenshots/android-zurich-addresses.png' });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.traffic-counts')).toHaveCount(0);
  await expect(page.locator('.counter-map-marker')).toHaveCount(0);
  await expect(page.locator('.map-location')).toContainText('Beta');
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    'docs/native-counts-validation.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        appVersion: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
        device: 'CoolerWalks_Test Android emulator',
        passed: [
          'Ground-referenced 3D roofs compute after an offline reload in central Zurich',
          'Whole Zurich coverage view renders on the 2 GB emulator',
          'Bundled vehicle-count profiles after offline reload',
          'Real Monday 14:00 reference, three counters and map markers',
          'Each nearby counter selects its own passing hour across the 15:00 boundary while offline',
          'Traffic v2 alternatives and German street-distance breakdown while offline',
          'German labels preserve the observations',
          'Official Oerlikon addresses, real routes with 100% geographic 3D coverage and a settled map while offline',
          'Arrival-time shadow explanation and city-local arrival times in English/German while offline',
          'Other launched cities labelled beta',
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
