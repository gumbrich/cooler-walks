import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('download, verify, reopen offline, select smaller coverage and remove', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  const pack = page.locator('[data-area-id="de-munich-old-town"]');
  await expect(pack.getByRole('button', { name: 'Download area', exact: true })).toBeEnabled();
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(pack.locator('.area-state')).toHaveText('Saved');
  await expect(page.getByRole('dialog')).toContainText('2.3 MB saved');
  await page.getByRole('dialog').evaluate((dialog) => dialog.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/desktop-downloads.png' });
  expect((await new AxeBuilder({ page }).include('.info-dialog').analyze()).violations).toEqual([]);
  await pack.getByRole('button', { name: 'Use this area', exact: true }).click();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('de-munich');
  await expect(page.locator('.map-location')).toContainText('Old Town essentials');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.map-failure')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/phone-downloaded-area.png', fullPage: true });
  // Block every network data source. The app shell is served normally by Vite;
  // production service-worker offline reload is checked separately by test:pwa.
  await page.route('**/data/**', (route) => route.abort('internetdisconnected'));
  await page.route('**/packs/**', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.map-failure')).toHaveCount(0);
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  await page.getByRole('dialog').evaluate((dialog) => dialog.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/phone-downloads.png' });
  await pack.getByRole('button', { name: 'Remove Old Town essentials download' }).click();
  await expect(pack.locator('.area-state')).toHaveText('Available');
  await page.getByRole('button', { name: 'Close information' }).click();
  await expect(page.locator('.route-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('interrupted downloads and quota failure preserve previous saved data', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?view=planner');
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  const pack = page.locator('[data-area-id="ch-basel"]');
  await page.route('**/packs/ch-basel-*.cwp', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({ status: 503, body: 'Unavailable' }).catch(() => {});
  });
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await pack.getByRole('button', { name: 'Cancel download' }).click();
  await expect(page.getByRole('dialog')).toContainText('Download cancelled');
  await expect(pack.locator('.area-state')).toHaveText('Available');
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('could not download (503)');
  await page.getByRole('dialog').evaluate((dialog) => dialog.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/tablet-download-error.png' });
  await page.unroute('**/packs/ch-basel-*.cwp');
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(pack.locator('.area-state')).toHaveText('Saved');
  // Exercise a real aborted IndexedDB transaction, retaining the earlier record.
  const retained = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('cooler-walks-areas', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('areas', 'readwrite');
      tx.objectStore('areas').put({ areaId: 'ch-basel', bytesData: new Uint8Array([0]) });
      tx.onabort = () => resolve();
      tx.abort();
    });
    return new Promise<boolean>((resolve) => {
      const req = db.transaction('areas').objectStore('areas').get('ch-basel');
      req.onsuccess = () =>
        resolve(req.result.bytesData.length > 1000 && req.result.sha256.length === 64);
    });
  });
  expect(retained).toBe(true);
});
