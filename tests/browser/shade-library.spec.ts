import { test, expect } from '@playwright/test';

test('Zurich loads 3D tiles per trip and recovers from a missing tile without losing addresses', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requested = new Set<string>();
  page.on('request', (r) => {
    if (r.url().includes('/zurich-shade/')) requested.add(r.url());
  });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.route-model-note').first()).toContainText('100%');
  expect(requested.size).toBeGreaterThan(0);
  expect(requested.size).toBeLessThan(20); // The library contains 81 tiles.
  await page.route('**/data/zurich-shade/*.shade', (route) =>
    route.fulfill({ status: 503, body: 'temporarily unavailable' }),
  );
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await from.fill('Hofwiesenstrasse 350');
  await from.press('Enter');
  await to.fill('Wallisellenstrasse 45');
  await to.press('Enter');
  for (let i = 0; i < 2; i++)
    if (await page.locator('.pavement-option').first().isVisible())
      await page.locator('.pavement-option').first().click();
  await expect(
    page.getByText('The 3D model could not load. Reconnect or download the Zurich map.'),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await expect(from).toHaveValue('Hofwiesenstrasse 350');
  await expect(to).toHaveValue('Wallisellenstrasse 45');
  await page.screenshot({ path: 'docs/screenshots/desktop-3d-tile-error.png' });
  await page.unroute('**/data/zurich-shade/*.shade');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.route-model-note').first()).toContainText('100%');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-3d-oerlikon.png' });
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Weg bearbeiten', exact: true })).toBeVisible();
  await expect(page.locator('.route-model-note').first()).toContainText('100%');
  await page.screenshot({ path: 'docs/screenshots/phone-3d-oerlikon-de.png', fullPage: true });
});
