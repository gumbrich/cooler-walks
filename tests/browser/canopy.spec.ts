import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ actionTimeout: 15000 });

test('tree scenario shows coverage, separate contributions, translated mobile controls and resets with city', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/en/?view=planner');
  const toggle = page.getByRole('checkbox', { name: 'Tree shade pilot', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.route-card').first()).toBeVisible();
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
  // Wait for this journey, not a retained result while its route/map is still updating.
  await expect(page.locator('.route-card').first()).toContainText('1.59 km');
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.route-card').first()).toContainText('estimated shade');
  await toggle.check();
  await expect(page.locator('.route-card').first()).toContainText('potential shade');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(
    page.getByText(
      'Tree-scenario coverage is below 95%. No shade comparison; estimates cover only the known part of the walk.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await page.screenshot({ path: 'docs/screenshots/desktop-tree-pilot.png', fullPage: true });
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.canopy-breakdown')).toContainText('Additional potential tree shade:');
  await page.locator('.walk-details > summary').click();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Baumschatten-Pilot' })).toBeChecked();
  await page.screenshot({ path: 'docs/screenshots/phone-tree-controls-de.png', fullPage: true });
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.route-card').first()).toContainText('möglicher Schatten');
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const legend = await page.locator('.map-legend').boundingBox();
  const tools = await page.locator('.map-tools').boundingBox();
  expect(legend && tools && legend.x + legend.width <= tools.x).toBe(true);
  const destination = await page.locator('.map-marker.destination').boundingBox();
  expect(destination && legend && destination.y + destination.height < legend.y).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/phone-tree-pilot-de.png', fullPage: true });
  await page.getByRole('button', { name: 'So schätzen wir', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('volle Belaubung');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: 'docs/screenshots/tablet-tree-method-de.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Baumschatten-Pilot' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-zurich');
  await expect(page.getByRole('checkbox', { name: 'Baumschatten-Pilot' })).not.toBeChecked();
});

test('failed canopy download has a recoverable error and cannot silently fall back', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  await page.route('**/data/zurich-canopy.json*', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/en/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const toggle = page.getByRole('checkbox', { name: 'Tree shade pilot', exact: true });
  await toggle.check();
  await expect(
    page.getByText(
      'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-tree-unavailable.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await toggle.uncheck();
  await expect(page.locator('.route-card').first()).toBeVisible();
});
