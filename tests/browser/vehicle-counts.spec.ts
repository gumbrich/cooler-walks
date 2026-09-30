import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Historical counters follow route, local departure time and language without implying zero traffic', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-22T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner&lang=en');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-22');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await expect(page.locator('.spinner')).toHaveCount(0);
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await page.locator('.traffic-counts > summary').click();
  const evidence = page.locator('.traffic-counts');
  await expect(evidence).toContainText('2025 observations');
  await expect(evidence.locator('.counter-slot').first()).toContainText('Monday, 14:00–15:00');
  await expect(evidence.locator('.counter-list li')).toHaveCount(3);
  await expect(evidence.locator('[data-counter-id="Z030M002"] .counter-value')).toContainText(
    '310',
  );
  await expect(page.locator('.counter-map-marker')).toHaveCount(3);
  await expect(evidence).toContainText('too sparse to rank whole routes');
  await evidence.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/desktop-vehicle-counts.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const value = await evidence.locator('[data-counter-id="Z030M002"] .counter-value').innerText();
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('480');
  await expect(evidence.locator('.counter-slot').first()).toContainText('08:00–09:00');
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await expect(evidence.locator('[data-counter-id="Z030M002"] .counter-value')).not.toHaveText(
    value,
    { useInnerText: true },
  );
  // One walk crosses an hour boundary: each counter uses its own passing hour.
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('885');
  await page.getByRole('button', { name: /Fastest walk/ }).click();
  await expect(evidence.locator('[data-counter-id="Z049M002"] .counter-slot')).toContainText(
    '14:00–15:00',
  );
  await expect(evidence.locator('[data-counter-id="Z031M002"] .counter-slot')).toContainText(
    '15:00–16:00',
  );
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(evidence).toContainText('Fahrzeuge/Stunde');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await evidence.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/phone-vehicle-counts.png', fullPage: true });
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).check();
  await expect(page.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Meinen Weg anzeigen' }).click();
  await expect(evidence).toContainText('das bedeutet nicht null Verkehr');
  await expect(page.locator('.counter-map-marker')).toHaveCount(0);
  await page.setViewportSize({ width: 820, height: 1180 });
  await evidence.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/tablet-counts-unavailable.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(evidence).toHaveCount(0);
  await expect(page.locator('.counter-map-marker')).toHaveCount(0);
});
