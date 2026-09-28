import { test, expect } from '@playwright/test';

test('expanded Cambridge routes and whole-area view work on desktop and phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await page.getByLabel('City', { exact: true }).selectOption('us-cambridge-ma');
  await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
  for (const [label, name] of [
    ['From', 'Fresh Pond Path'],
    ['To', 'Kendall Street'],
  ]) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    await page
      .getByRole('option', { name: new RegExp(`^${name}`) })
      .first()
      .click();
  }
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.route-card').first()).toContainText('7.14 km');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Toggle coverage boundary' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/desktop-expanded-cambridge.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show whole coverage', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.map-marker')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/phone-expanded-cambridge.png', fullPage: true });
});
