import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ actionTimeout: 15000 });

test('tree scenario shows coverage, separate contributions, translated mobile controls and resets with city', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/en/?view=planner');
  const toggle = page.getByRole('checkbox', {
    name: 'Tree shade pilot',
    exact: true,
    includeHidden: true,
  });
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
  if (!(await page.locator('.model-options').evaluate((el) => (el as HTMLDetailsElement).open)))
    await page.locator('.model-options summary').click();
  await toggle.check();
  await expect(page.locator('.route-card').first()).toContainText('potential shade');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.exposure-number').first()).toContainText('830 m');
  await expect(page.locator('.route-unknown-note').first()).toContainText('730 m unknown');
  // Neither unknown coverage nor a changing denominator can fill the shade bar.
  const widths = await page
    .locator('.exposure-bar')
    .first()
    .evaluate((bar) => ({
      shaded: parseFloat((bar.querySelector('span') as HTMLElement).style.width),
      unknown: parseFloat((bar.querySelector('.exposure-unknown') as HTMLElement).style.width),
    }));
  expect(widths.shaded).toBeCloseTo(51.83, 1);
  expect(widths.unknown).toBeCloseTo(45.5, 1);
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
  await expect(
    page.getByRole('checkbox', { name: 'Baumschatten-Pilot', includeHidden: true }),
  ).not.toBeChecked();
});

test('failed canopy download has a recoverable error and cannot silently fall back', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  await page.route('**/data/zurich-canopy/*.canopy*', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/en/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const toggle = page.getByRole('checkbox', {
    name: 'Tree shade pilot',
    exact: true,
    includeHidden: true,
  });
  if (!(await page.locator('.model-options').evaluate((el) => (el as HTMLDetailsElement).open)))
    await page.locator('.model-options summary').click();
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

test('tree tiles serve northern Zurich on demand and cancelled time changes cannot publish stale results', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const treeRequests = new Set<string>();
  page.on('request', (request) => {
    if (request.url().includes('/zurich-canopy/')) treeRequests.add(request.url());
  });
  await page.clock.setFixedTime(new Date('2024-08-01T14:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/en/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const from = page.getByRole('combobox', { name: 'From', exact: true }),
    to = page.getByRole('combobox', { name: 'To', exact: true });
  await from.fill('Hofwiesenstrasse 350');
  await from.press('Enter');
  await to.fill('Wallisellenstrasse 45');
  await to.press('Enter');
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.route-card').first()).toBeVisible();
  expect(treeRequests.size).toBe(0);
  const toggle = page.getByRole('checkbox', {
    name: 'Tree shade pilot',
    exact: true,
    includeHidden: true,
  });
  if (!(await page.locator('.model-options').evaluate((el) => (el as HTMLDetailsElement).open)))
    await page.locator('.model-options summary').click();
  await toggle.check();
  await expect(page.locator('.route-card').first()).toContainText('potential shade');
  await expect(page.locator('#canopy-help')).toContainText('Zurich map');
  expect(treeRequests.size).toBeGreaterThan(0);
  expect(treeRequests.size).toBeLessThan(81); // Never preload the 324-tile library for this short trip.
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('600');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('960');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('720');
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.route-card').first()).toContainText('potential shade');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.locator('.route-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'docs/screenshots/desktop-oerlikon-tree-shade.png',
    fullPage: true,
  });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.route-card').first()).toContainText('möglicher Schatten');
  await page.screenshot({
    path: 'docs/screenshots/phone-oerlikon-tree-shade-de.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
