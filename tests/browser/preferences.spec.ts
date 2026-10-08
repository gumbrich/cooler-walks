import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('combined wishes keep a visible priority, compare trade-offs and obey the time limit', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  const primary = page.getByRole('combobox', { name: 'Am wichtigsten', exact: true });
  await primary.selectOption('calm');
  await expect(page.locator('.route-card')).toHaveCount(2);
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Am Wasser', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Flachere Wege', exact: true }).check();
  await expect(primary).toHaveValue('calm');
  await expect(page.locator('.preference-comparison')).toContainText('Am Wasser');
  await expect(page.locator('.preference-comparison')).toContainText('Flachere Wege');
  await expect(page.locator('.preference-order')).toContainText(
    'Verkehrsberuhigt → Am Wasser → Flachere Wege',
  );
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.locator('.results').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/desktop-preferences-de.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Direkt', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.preference-comparison')).toBeVisible();
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.locator('.preference-order')).toContainText(
    'Calm streets → Waterside → Flatter routes',
  );
  // Choosing a new primary preserves compatible optional wishes without duplicating it.
  await page.locator('#route-priority').selectOption('shade');
  await expect(page.getByRole('checkbox', { name: 'Waterside', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Flatter routes', exact: true })).toBeChecked();
  await page.locator('#route-priority').selectOption('water');
  await expect(page.getByRole('checkbox', { name: 'Waterside', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Flatter routes', exact: true })).toBeChecked();
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-basel');
  await expect(page.locator('#route-priority')).toHaveValue('greenery');
  await expect(page.locator('.preference-order')).toHaveCount(0);
  await expect(page.locator('#route-priority option[value="flat"]')).toHaveCount(0);
});

test('phone and tablet keep the optional controls compact and sunlight choices compatible', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await expect(page.locator('.additional-preferences')).not.toHaveAttribute('open', '');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-preferences-de.png', fullPage: true });
  await page.locator('#route-priority').selectOption('water');
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Schatten', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Sonne', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Schatten', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Sonne', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/phone-combined-results-de.png', fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/tablet-preferences-de.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
