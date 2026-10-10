import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('default pavements, integrated trees, equal wishes, light modes and minute detours', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.route-pavement-note').first()).toBeVisible();
  await expect(page.locator('.canopy-result-note')).toContainText('Baumschatten enthalten');
  await expect(
    page.locator('.network-choice, #route-priority, .preference-order, .model-options'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Schatten', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.additional-preferences summary').click();
  for (const name of ['Verkehrsberuhigt', 'Am Wasser', 'Barrierefreiheit'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await expect(page.locator('.accessibility-result-note')).toBeVisible();
  await page.getByRole('button', { name: '+15 min', exact: true }).click();
  await expect(page.locator('#detour-minutes')).toHaveValue('15');
  await page.locator('#detour-minutes').fill('7');
  await expect(page.locator('.detour-range output')).toHaveText('+7 min');
  await page.locator('#detour-minutes').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#detour-minutes')).toHaveValue('8');
  const box = (await page.locator('#detour-minutes').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  expect(Number(await page.locator('#detour-minutes').inputValue())).toBeLessThan(7);
  await page.getByRole('button', { name: '+0 min', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.trip-form').scrollIntoViewIfNeeded();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-simple-shade-de.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-walk-mode', 'sun');
  await expect(page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true })).toBeChecked();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path: 'docs/screenshots/desktop-simple-sun-de.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Sun', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: 'Accessibility', exact: true })).toBeChecked();
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('ch-basel');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.light-choice')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Accessibility', exact: true })).toHaveCount(0);
  await expect(page.locator('.route-pavement-note, .canopy-result-note')).toHaveCount(0);
});

test('phone and tablet keep the planner simple, legible and usable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await expect(page.locator('.additional-preferences')).not.toHaveAttribute('open', '');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-simple-shade-de.png', fullPage: true });
  await page.getByRole('button', { name: 'Sonne', exact: true }).click();
  await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Barrierefreiheit', exact: true }).check();
  await page.getByRole('button', { name: '+15 min', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/phone-simple-sun-de.png', fullPage: true });
  await page.getByRole('button', { name: 'Routen anzeigen', exact: true }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path: 'docs/screenshots/phone-simple-results-de.png', fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/tablet-simple-planner-de.png' });
  const legend = (await page.locator('.map-legend').boundingBox())!;
  const timeline = (await page.locator('.timeline-wrap').boundingBox())!;
  expect(legend.y).toBeGreaterThanOrEqual(timeline.y + timeline.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
