import { test, expect } from '@playwright/test';

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

test('missing shade coverage and night are explained beside the choice even with calm streets', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  const status = page.locator('.light-routing-status');
  await expect(status).toContainText('Für diesen Weg fehlen Schattendaten.');
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true }).check();
  await expect(status).toContainText('Für diesen Weg fehlen Schattendaten.');
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(status).toContainText(
    'Die Wahl von Sonne oder Schatten kann nicht berücksichtigt werden.',
  );
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/light-choice-unavailable-phone-de.png',
    fullPage: true,
  });
  await expect(page.locator('.results')).toContainText('unter 95%');
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
