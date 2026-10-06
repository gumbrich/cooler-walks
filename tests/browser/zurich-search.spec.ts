import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Zurich whole-area map renders at desktop size', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  const overviewStarted = Date.now();
  await page.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  console.log(`Zurich whole-area map settled in ${Date.now() - overviewStarted} ms`);
  await page.screenshot({ path: 'docs/screenshots/desktop-zurich-coverage.png' });
});

test('Zurich addresses, beta labels, direct map selection and honest outside coverage', async ({
  page,
}) => {
  // Keep the expensive city overview in its own scenario. Each complete flow
  // retains the same timeout and route assertions on slower software-rendering CI.
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await from.fill('8048 Altstetterstr. 145');
  await expect(
    page.getByRole('option', { name: /Altstetterstrasse 145 Official address/ }),
  ).toBeVisible();
  await from.press('Enter');
  await expect(from).toHaveValue('Altstetterstrasse 145');
  // Simulate the pause between editing two addresses: the intermediate long
  // Altstetten-to-lake trip must start, then yield to the final nearby trip.
  await page.waitForTimeout(500);
  const changedAt = Date.now();
  await to.fill('Hohlstrasse 554');
  await to.press('Enter');
  await expect(to).toHaveValue('Hohlstrasse 554');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  console.log(`Updated Altstetten trip appeared in ${Date.now() - changedAt} ms`);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  // The desktop planner fits the viewport. Full-page capture resizes the WebGL
  // surface unnecessarily and can stall Chrome's software compositor.
  await page.screenshot({ path: 'docs/screenshots/desktop-zurich-addresses.png' });
  await page.getByRole('button', { name: 'Choose to on map', exact: true }).click();
  await expect(page.getByText('Tap a public path to set your destination.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel map selection' }).click();
  await expect(to).toHaveValue('Hohlstrasse 554');
  // A normal map click opens actions; choosing one changes only that trip endpoint.
  await page.locator('.map-canvas').click({ position: { x: 320, y: 320 } });
  await expect(page.getByRole('group', { name: 'Use this map point' })).toBeVisible();
  await page.getByRole('button', { name: 'Walk to here', exact: true }).click();
  await expect(to).toHaveValue(/^Map point ·/);
  await expect(from).toHaveValue('Altstetterstrasse 145');
  await to.fill('Wehntalerstrasse 790');
  await to.press('Enter');
  await expect(page.getByText(/This point is outside the Zurich pilot/)).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await expect(to).toHaveValue('Wehntalerstrasse 790');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: 'docs/screenshots/tablet-zurich-outside.png' });
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
  await from.fill('Hofwiesenstrasse 350');
  await expect(page.getByRole('listbox')).toContainText('Amtliche Adresse');
  await page.screenshot({ path: 'docs/screenshots/phone-zurich-search.png', fullPage: true });
  await from.press('Enter');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).fill('Wallisellenstrasse 45');
  await page.getByRole('combobox', { name: 'Nach', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /Schnellster Weg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-zurich-expanded.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
