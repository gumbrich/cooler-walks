import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { choosePlace, ready } from './helpers';

test('expanded Munich routes, addresses and coverage remain usable on desktop and phone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('cw-city', 'de-munich');
    localStorage.setItem('cw-area', 'de-munich');
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner&lang=en');
  await ready(page);
  await choosePlace(page, 'From', 'Hohenzollernplatz');
  await choosePlace(page, 'To', 'Münchner Freiheit');
  await ready(page);
  await expect(page.locator('.light-routing-status')).not.toContainText('cannot');
  await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/munich-expanded-desktop.png' });
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await ready(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('.mobile-save').isVisible()) await page.locator('.mobile-save').click();
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/munich-expanded-phone-de.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'So schätzen wir', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Gebäudeverzeichnis: 6. Oktober 2026');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({
    path: 'docs/screenshots/munich-expanded-tablet-method.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.locator('.panel-footer button').first().click();
  await expect(page.getByRole('dialog')).toContainText('40,5 km²');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/munich-expanded-coverage.png' });
  expect(errors).toEqual([]);
});

test('Munich public entry leads to its expanded planner', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('cw-city', 'de-munich'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?lang=en');
  await expect(page.locator('.hero-cta')).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/munich-expanded-entry.png' });
  await page.locator('.hero-cta').click();
  await ready(page);
  await expect(page.getByRole('combobox', { name: 'City', exact: true })).toHaveValue('de-munich');
});
