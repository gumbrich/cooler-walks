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
  await to.press('Enter');
  await from.fill('Franklinstrasse / Hofwiesenstrasse');
  await from.press('Enter');
  await expect(page.locator('.route-card')).toHaveCount(2);
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

test('pavement pilot compares real routes, preserves the time budget and returns to Zurich', async ({
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
  await expect(page.getByRole('checkbox', { name: 'Prefer calmer streets' })).toHaveCount(0);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-pavement-pilot.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Direct', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(2);
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('1080');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.route-card')).toContainText('76%');
  await page.getByRole('button', { name: 'Zurich map', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue(
    'Bahnhofquai',
  );
  await expect(page.locator('.route-pavement-note')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Prefer calmer streets' })).toBeVisible();
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Try pavement pilot', exact: true }).click();
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await page.getByLabel('City', { exact: true }).selectOption('ch-basel');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.network-choice')).toHaveCount(0);
  await expect(page.locator('.route-pavement-note')).toHaveCount(0);
});

test('German phone and tablet show the pilot, reject an outside location and recover', async ({
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
  await expect(page.getByText(/Dieser Punkt liegt ausserhalb des Trottoir-Piloten/)).toBeVisible();
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
