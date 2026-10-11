import { test, expect } from '@playwright/test';

test('Zurich and Munich disclose their own 3D building coverage and clear it in a greenery city', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-model-note').first()).toContainText(
    '3D roofs + ground elevation · 100% of walk',
  );
  await expect(page.locator('.map-model-key')).toContainText('3D buildings · experimental');
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.walk-details')).toContainText(
    'Bridges, tunnels and missing ground elevations',
  );
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-3d-shade.png' });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.route-model-note').first()).toContainText(
    '3D-Dächer + Geländehöhe · 100% des Wegs',
  );
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-3d-shade.png', fullPage: true });
  await page.getByRole('button', { name: 'So schätzen wir', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('LiDAR-Befliegung');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: 'docs/screenshots/tablet-3d-method.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.route-model-note').first()).toContainText('3D-Dächer');
  await expect(page.locator('.map-model-key')).toBeVisible();
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-basel');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.route-model-note')).toHaveCount(0);
  await expect(page.locator('.map-model-key')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('missing detailed source cannot silently substitute the old model', async ({ page }) => {
  await page.route('**/data/zurich-shade-library.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/?view=planner&lang=en');
  await expect(
    page.getByText('The pilot data could not load. Check your connection and try again.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
});
