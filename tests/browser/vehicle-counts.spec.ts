import { test, expect } from '@playwright/test';
import { choosePlace, ready, wish } from './helpers';
test('historical counter evidence follows pavement trips and language without claiming live traffic', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-22T12:00:00Z'));
  await page.goto('/?view=planner&lang=en');
  await ready(page);
  await choosePlace(page, 'From', 'Bahnhofquai / Museumstrasse');
  await choosePlace(page, 'To', 'Bürkliplatz / Stadthausquai');
  await ready(page);
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await page.locator('.traffic-counts > summary').click();
  const evidence = page.locator('.traffic-counts');
  await expect(evidence).toContainText('2025 observations');
  await expect(evidence).toContainText('too sparse to rank whole routes');
  await expect(evidence.locator('.counter-list li').first()).toBeVisible();
  await expect(evidence.locator('.counter-slot').first()).toContainText('14:00');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('480');
  await ready(page);
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await expect(evidence.locator('.counter-slot').first()).toContainText('08:00');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(evidence).toContainText('Fahrzeuge/Stunde');
  await wish(page, 'Verkehrsberuhigt');
  await ready(page);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await ready(page);
  await expect(evidence).toHaveCount(0);
  await expect(page.locator('.counter-map-marker')).toHaveCount(0);
});
