import { wish } from './helpers';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('expanded pavement search reaches Oerlikon and shows the whole supported map', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner&network=pavements');
  await expect(page.locator('.route-card')).toHaveCount(2);
  const from = page.getByRole('combobox', { name: 'Von', exact: true });
  const to = page.getByRole('combobox', { name: 'Nach', exact: true });
  // Clearing both points also checks cancellation of the intermediate cross-city trip.
  await from.fill('');
  await to.fill('Franklinstrasse / Schaffhauserstrasse');
  await expect(page.getByRole('listbox').last()).toContainText('Wegkreuzung');
  await to.press('Enter');
  // Quickly returning to a field must not let its earlier blur close suggestions.
  await from.focus();
  await to.focus();
  await from.focus();
  await page.waitForTimeout(200);
  await expect(from).toHaveAttribute('aria-expanded', 'true');
  await from.fill('Franklinstrasse / Hofwiesenstrasse');
  await from.press('Enter');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.route-card').first()).toContainText('380 m');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/desktop-pavements-oerlikon-de.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Gesamte Abdeckung anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/desktop-pavements-coverage-de.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect
    .poll(async () => {
      const marker = await page.locator('.map-marker').first().boundingBox();
      const label = await page.locator('.map-location').boundingBox();
      return !!marker && !!label && marker.y >= label.y + label.height + 2;
    })
    .toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/phone-pavements-oerlikon-de.png',
    fullPage: true,
  });
});

test('pavements compare real routes and preserve the trip and time budget with calmer-street preferences', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner&network=pavements');
  await expect(page.locator('.route-card')).toHaveCount(2);
  await expect(page.locator('.route-pavement-note').first()).toContainText('4 crossing sections');
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue(
    'Talacker / Pelikanstrasse',
  );
  await wish(page, 'Calm streets');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-pavement-pilot.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(2);
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('1080');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.canopy-result-note')).toBeVisible();
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.network-choice')).toHaveCount(0);
  await expect(page.locator('.route-pavement-note')).toHaveCount(0);
});

test('German phone and tablet show pavements, reject an outside location and recover', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 8.6, latitude: 47.38 });
  await page.goto('/de/?view=planner&network=pavements');
  await expect(page.locator('.route-card')).toHaveCount(2);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.route-pavement-note').first()).toContainText('Querungsabschnitte');
  await page.screenshot({ path: 'docs/screenshots/phone-pavement-pilot-de.png', fullPage: true });
  await page.getByRole('button', { name: 'Karte vergrössern', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveClass(/map-expanded/);
  await expect(
    page.getByRole('button', { name: 'Karte verkleinern', exact: true }),
  ).toBeInViewport();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-pavement-detail-de.png', fullPage: false });
  await page.getByRole('button', { name: 'Karte verkleinern', exact: true }).click();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Meinen Standort nutzen', exact: true }).click();
  await expect(
    page.getByText(
      'Kein kartierter Fussweg in der Nähe. Wähle auf der Karte einen Weg im unterstützten Gebiet.',
    ),
  ).toBeVisible();
  await expect(page.locator('.pavement-address')).toHaveText('Dein Standort');
  await expect(page.locator('.route-card')).toHaveCount(0);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/tablet-pavement-outside-de.png',
    fullPage: true,
  });
  const from = page.getByRole('combobox', { name: 'Von', exact: true });
  await from.fill('Talacker');
  await from.press('Enter');
  await expect(page.locator('.route-card')).toHaveCount(2);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect
    .poll(async () => {
      const a = await page.locator('.map-marker').first().boundingBox();
      const b = await page.locator('.map-marker').last().boundingBox();
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    })
    .toBeGreaterThan(50);
  await page.screenshot({ path: 'docs/screenshots/tablet-pavement-pilot-de.png', fullPage: true });
});

test('addresses keep their names and require an explicit walking point, with default pavement routing', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const from = page.getByRole('combobox', { name: 'Von', exact: true });
  const to = page.getByRole('combobox', { name: 'Nach', exact: true });
  await from.fill('Hofwiesenstrasse 350');
  await from.press('Enter');
  await to.fill('Wallisellenstrasse 45');
  await to.press('Enter');
  const picker = page.getByRole('region', { name: 'Fussweg wählen', exact: true });
  await expect(picker).toContainText('Hofwiesenstrasse 350');
  await expect(page.locator('.route-card')).toHaveCount(0);
  await expect(page.locator('.pavement-choice-marker')).toHaveCount(4);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-pavement-address-choice-de.png' });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator('.pavement-option').first().click();
  await expect(picker).toContainText('Wallisellenstrasse 45');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/phone-pavement-address-choice-de.png',
    fullPage: true,
  });
  await page.locator('.pavement-choice-marker').first().click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await expect(page.locator('.trip-compact')).toContainText('Hofwiesenstrasse 350');
  await expect(page.locator('.trip-compact')).toContainText('Wallisellenstrasse 45');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/phone-pavement-address-route-de.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await wish(page, 'Am Wasser');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A newly searched address needs a new choice; the previous side is not reused.
  await from.fill('Hofwiesenstrasse 340');
  await from.press('Enter');
  await expect(picker).toContainText('Hofwiesenstrasse 340');
  await expect(page.locator('.route-card')).toHaveCount(0);
});
