import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('planner accessibility and 200% text enlargement', async ({ page }) => {
  // Keep the layout and shadow workload independent of the runner's wall clock.
  // Seasonal, low-sun and night behaviour have separate model/browser checks.
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/desktop-large-text.png', fullPage: true });
});
