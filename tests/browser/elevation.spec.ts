import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('flatter Zurich routes, German and English, time budget, profile and unknown heights', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const from = page.getByRole('combobox', { name: 'Von', exact: true });
  const to = page.getByRole('combobox', { name: 'Nach', exact: true });
  await from.fill('');
  await to.fill('Waidbadstrasse');
  await to.press('Enter');
  await from.fill('Bucheggplatz');
  await from.press('Enter');
  await page.getByRole('checkbox', { name: 'Flachere Wege bevorzugen' }).check();
  await expect(page.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible();
  await expect(page.locator('.route-elevation').first()).toContainText('95 m');
  await expect(page.locator('.route-elevation').last()).toContainText('90 m');
  await page.locator('.elevation-profile summary').click();
  await expect(page.locator('.elevation-chart svg')).toBeVisible();
  await expect(page.locator('.elevation-profile')).toContainText('0 m unbekannt');
  await page.locator('.results').scrollIntoViewIfNeeded();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-elevation-de.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-elevation-de.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Flachere Wege bevorzugen' })).toBeChecked();
  await page.screenshot({
    path: 'docs/screenshots/phone-elevation-controls-de.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Direkt', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.getByRole('button', { name: /Flacherer Weg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: 'docs/screenshots/tablet-elevation-de.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('button', { name: /Flatter route/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Prefer waterside' }).check();
  await expect(page.getByRole('checkbox', { name: 'Prefer flatter routes' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Prefer flatter routes' }).check();
  await expect(page.getByRole('checkbox', { name: 'Prefer waterside' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /Flatter route/ })).toBeVisible();
  const fromEn = page.getByRole('combobox', { name: 'From', exact: true });
  const toEn = page.getByRole('combobox', { name: 'To', exact: true });
  await fromEn.fill('');
  await toEn.fill('Bürkliplatz');
  await toEn.press('Enter');
  await fromEn.fill('Bahnhofquai');
  await fromEn.press('Enter');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.result-note').first()).toContainText('walking heights are unknown');
  await page.locator('.results').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-elevation-unknown.png' });
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-basel');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Prefer flatter routes' })).toHaveCount(0);
  await expect(page.locator('.elevation-profile')).toHaveCount(0);
});

test('flatter preference on municipal pavements keeps actual walking geometry', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner&network=pavements');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const distance = await page.locator('.route-card').first().locator('.route-distance').innerText();
  await page.getByRole('checkbox', { name: 'Prefer flatter routes' }).check();
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await expect(page.locator('.route-card').first().locator('.route-distance')).toHaveText(
    distance,
    { useInnerText: true },
  );
  await expect(page.locator('.route-pavement-note').first()).toContainText('4 crossing sections');
  await expect(page.locator('.result-note').first()).toContainText('No meaningfully flatter');
});
