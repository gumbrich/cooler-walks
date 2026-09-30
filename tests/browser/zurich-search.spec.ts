import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Zurich addresses, beta labels, direct map selection and honest outside coverage', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await from.fill('8001 Bahnhofstr. 1');
  await expect(
    page.getByRole('option', { name: /Bahnhofstrasse 1 Official address/ }),
  ).toBeVisible();
  await from.press('Enter');
  await expect(from).toHaveValue('Bahnhofstrasse 1');
  await to.fill('Muensterhof 2');
  await to.press('Enter');
  await expect(to).toHaveValue('Münsterhof 2');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-zurich-addresses.png', fullPage: true });
  await page.getByRole('button', { name: 'Choose to on map', exact: true }).click();
  await expect(page.getByText('Tap a public path to set your destination.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel map selection' }).click();
  await expect(to).toHaveValue('Münsterhof 2');
  // A normal map click opens actions; choosing one changes only that trip endpoint.
  await page.locator('.map-canvas').click({ position: { x: 320, y: 320 } });
  await expect(page.getByRole('group', { name: 'Use this map point' })).toBeVisible();
  await page.getByRole('button', { name: 'Walk to here', exact: true }).click();
  await expect(to).toHaveValue(/^Map point ·/);
  await expect(from).toHaveValue('Bahnhofstrasse 1');
  await to.fill('Wehntalerstrasse 500');
  await to.press('Enter');
  await expect(page.getByText(/This point is outside the Zurich pilot/)).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await expect(to).toHaveValue('Wehntalerstrasse 500');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: 'docs/screenshots/tablet-zurich-outside.png', fullPage: true });
  await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
  await expect(page.locator('.map-location')).toContainText('Beta');
  await expect(
    page.getByRole('option', { name: 'Basel, Switzerland · Beta', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
});

test('German phone address search and map controls stay usable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  await expect(page.getByRole('button', { name: /Schnellster Weg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  const from = page.getByRole('combobox', { name: 'Von', exact: true });
  await from.fill('Schaffhauserstrasse 100');
  await expect(page.getByRole('listbox')).toContainText('Amtliche Adresse');
  await page.screenshot({ path: 'docs/screenshots/phone-zurich-search.png', fullPage: true });
  await from.press('Enter');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).fill('Röschibachplatz');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /Schnellster Weg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Meinen Weg anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-zurich-expanded.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
