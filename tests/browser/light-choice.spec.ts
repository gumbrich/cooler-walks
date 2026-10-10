import { test, expect } from '@playwright/test';

test('October desktop shows different real paths and names the building comparison', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  const status = page.locator('.light-routing-status');
  const selected = page.locator('.route-card[aria-pressed="true"] .route-distance');
  await expect(status).toContainText('Gebäudeschatten:');
  await expect(selected).toContainText('400 m');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/shade-restored-october-desktop-de.png' });
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText('Ohne Gebäudeschatten:');
  await expect(selected).toContainText('440 m');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/sun-restored-october-desktop-de.png' });
});

test('Shade and Sun change the selected route, preserve the trip and survive repeated toggles', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  const selected = page.locator('.route-card[aria-pressed="true"]');
  const status = page.locator('.light-routing-status');
  await expect(status).toContainText('Schattenroute:');
  await expect(selected.locator('.route-distance')).toContainText('490 m');
  const from = await page.getByRole('combobox', { name: 'Von', exact: true }).inputValue();
  const to = await page.getByRole('combobox', { name: 'Nach', exact: true }).inputValue();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/light-choice-shade-desktop-de.png' });
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText('Sonnenroute: etwa 94%');
  await expect(selected.locator('.route-distance')).toContainText('460 m');
  await expect(selected).toContainText('Mehr möglicher Sonnenschein');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/light-choice-sun-desktop-de.png' });
  await page.getByRole('button', { name: 'Schatten', exact: true }).click();
  await expect(status).toContainText('Schattenroute:');
  await expect(selected.locator('.route-distance')).toContainText('490 m');
  await expect(page.getByRole('combobox', { name: 'Von', exact: true })).toHaveValue(from);
  await expect(page.getByRole('combobox', { name: 'Nach', exact: true })).toHaveValue(to);
  await page.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(status).toHaveText('Ohne zusätzliche Gehzeit wird der schnellste Weg angezeigt.');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(selected.locator('.route-distance')).toContainText('400 m');
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toHaveText('Ohne zusätzliche Gehzeit wird der schnellste Weg angezeigt.');
  await expect(selected.locator('.route-distance')).toContainText('400 m');
});

test('October sun and shade routes work with explicit building comparison and calm streets', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  const status = page.locator('.light-routing-status');
  await expect(status).toContainText('Gebäudeschatten:');
  await expect(page.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '400 m',
  );
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true }).check();
  await expect(status).toContainText('Gebäudeschatten:');
  await expect(page.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '400 m',
  );
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText('Ohne Gebäudeschatten:');
  await expect(page.locator('.route-card[aria-pressed="true"] .route-distance')).toContainText(
    '440 m',
  );
  await expect(page.locator('.canopy-result-note')).toContainText('Vergleich nach Gebäudeschatten');
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/shade-restored-october-phone-de.png',
    fullPage: true,
  });
  await expect(
    page.getByText('Für diesen Weg fehlen Schattendaten.', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('1320');
  await expect(status).toHaveText(
    'Zur gewählten Zeit ist es dunkel. Sonne oder Schatten ändern den Weg daher nicht.',
  );
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(status).toHaveText(
    'It is dark at this departure time. Sun or shade cannot affect the route.',
  );
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/light-choice-night-tablet-en.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
