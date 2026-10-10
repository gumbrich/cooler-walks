import { test, expect } from '@playwright/test';
import { choosePlace, ready, wish } from './helpers';
test('elevation works alongside light and water preferences and keeps pavement geometry', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto('/de/?view=planner');
  await ready(page);
  const distance = await page.locator('.route-distance').first().innerText();
  await wish(page, 'Flachere Wege');
  await ready(page);
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await expect(page.locator('.route-distance').first()).toHaveText(distance, {
    useInnerText: true,
  });
  await page.locator('.elevation-profile summary').click();
  await expect(page.locator('.elevation-chart svg')).toBeVisible();
  await wish(page, 'Am Wasser');
  await expect(page.getByRole('checkbox', { name: 'Flachere Wege', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('checkbox', { name: 'Flatter routes', exact: true })).toBeChecked();
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-basel');
  await ready(page);
  await expect(page.locator('.elevation-profile')).toHaveCount(0);
});
test('accessibility applies mapped barrier restrictions and discloses incomplete access data', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto('/?view=planner&lang=en');
  await ready(page);
  await choosePlace(page, 'From', 'Bucheggplatz / Hofwiesenstrasse');
  await choosePlace(page, 'To', 'Fuchspass / Waidbadstrasse');
  await wish(page, 'Accessibility');
  await ready(page);
  await expect(page.locator('.accessibility-result-note')).toContainText(
    'Accessibility is not verified throughout',
  );
  await expect(page.locator('#accessibility-help')).toContainText('Kerbs, widths and surfaces');
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/screenshots/phone-barrier-aware-results.png',
    fullPage: true,
  });
});
