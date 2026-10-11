import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { choosePlace, ready, wish } from './helpers';

test('Munich light, preferences, addresses and zone streets work in German and English', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await ready(page);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await ready(page);
  await expect(page.locator('.route-model-note').first()).toContainText('3D-Dächer');
  await expect(page.locator('.canopy-result-note')).toHaveCount(0);
  await expect(page.locator('.light-routing-status')).not.toContainText('fehlen Schattendaten');
  const shade = await page.locator('.route-card.selected .route-distance').innerText();
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await ready(page);
  await expect(page.locator('.route-card.selected .route-distance')).not.toHaveText(shade);
  await page.getByRole('button', { name: 'Schatten', exact: true }).click();
  await wish(page, 'Verkehrsberuhigt');
  await wish(page, 'Flachere Wege');
  await wish(page, 'Am Wasser');
  await wish(page, 'Barrierefreiheit');
  await ready(page);
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await expect(page.locator('.traffic-profile')).toBeVisible();
  await page.getByRole('button', { name: '+15 min', exact: true }).click();
  await ready(page);
  const slider = page.locator('#detour-minutes');
  await expect(slider).toHaveValue('15');
  await slider.fill('7');
  await ready(page);
  await page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/munich-features-desktop-de.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('checkbox', { name: 'Accessibility', exact: true })).toBeChecked();
  await choosePlace(page, 'From', 'Marienplatz 1');
  await choosePlace(page, 'To', 'Residenzstraße 1');
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('.mobile-save').isVisible()) await page.locator('.mobile-save').click();
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/munich-features-phone-en.png', fullPage: true });
  await page.getByRole('button', { name: 'How we estimate', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Bavarian LoD2');
  await expect(page.getByRole('dialog')).toContainText('building shade only');
  await expect(page.getByRole('dialog')).toContainText('not survey-accurate');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({
    path: 'docs/screenshots/munich-features-tablet-method.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-basel');
  await ready(page);
  await expect(page.getByRole('checkbox', { name: 'Calm streets', exact: true })).toHaveCount(0);
  await expect(page.locator('.route-model-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Munich fails clearly when 3D source data is unavailable, then recovers', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw-city', 'de-munich');
    localStorage.setItem('cw-area', 'de-munich');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/data/munich-shade-library.json', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/de/?view=planner');
  await expect(page.locator('.status.error')).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await page.screenshot({
    path: 'docs/screenshots/munich-features-phone-error.png',
    fullPage: true,
  });
  await page.unroute('**/data/munich-shade-library.json');
  await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
  await ready(page);
});
