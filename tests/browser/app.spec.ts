import { test, expect } from '@playwright/test';
test('failed pilot download explains the issue and can recover', async ({ page }) => {
  await page.route('**/data/zurich.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/?view=planner');
  await expect(
    page.getByText('The pilot data could not load. Check your connection and try again.'),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await page.unroute('**/data/zurich.json');
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
});
test('desktop planner, search, time, units, coverage and city switching', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A little less sun/ })).toBeVisible();
  await expect(page.locator('.hero-route-note')).toBeVisible();
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/desktop-entry.png', fullPage: true });
  await page.getByRole('button', { name: 'Find a cooler walk', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time' }).fill('840');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/desktop-planner.png', fullPage: true });
  await page.getByRole('button', { name: 'Direct', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch to imperial units' }).click();
  await expect(page.locator('.route-numbers')).toContainText('mi');
  await page.getByRole('button', { name: 'Switch to metric units' }).click();
  await page.getByRole('button', { name: 'How we estimate' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'To', exact: true }).fill('Rennweg');
  await page.getByRole('listbox').getByRole('option').first().click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByLabel('City', { exact: true }).selectOption('fr-paris');
  await expect(page.getByRole('heading', { name: /Paris, under review/ })).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/desktop-unsupported.png', fullPage: true });
  await page.getByRole('button', { name: 'Explore the Zurich pilot' }).click();
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test('phone and tablet layouts, keyboard search, night and location denial', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.hero-route-note')).toBeVisible();
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/phone-entry.png', fullPage: true });
  await page.getByRole('button', { name: 'Find a cooler walk', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time' }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/phone-planner.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toBeVisible();
  await context.clearPermissions();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText(/Location access was unavailable/)).toBeVisible();
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/phone-location-denied.png', fullPage: true });
  const input = page.getByRole('combobox', { name: 'From', exact: true });
  await input.fill('Rennweg');
  await input.press('ArrowDown');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Show my walk' }).click();
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  await page.getByRole('slider', { name: 'Departure time' }).fill('0');
  await expect(
    page.getByText('Direct sun is not relevant after dark. Greenery is shown separately.'),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.map-failure')).toHaveCount(0);
  if (await page.locator('.map-shell').count()) {
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  }
  await page.locator('.header').click({ position: { x: 1, y: 1 } });
  await page.screenshot({ path: 'docs/screenshots/tablet-planner.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
