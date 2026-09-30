import { test, expect } from '@playwright/test';

test('arrival-aware shade explains route timing and a walk crossing into low sun', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  const fastest = page.getByRole('button', { name: /Fastest walk/ });
  await expect(fastest).toContainText('Arrive around 14:19');
  await expect(page.getByRole('button', { name: /More estimated shade/ })).toContainText(
    'Arrive around 14:23',
  );
  await fastest.click();
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.walk-details')).toContainText(
    'Shadows follow your expected arrival along the walk',
  );
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-arrival-shade.png' });

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.route-arrival').first()).toContainText('Ankunft gegen 14:19');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-arrival-shade.png', fullPage: true });
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('1200');
  await expect(page.getByText(/Bei diesem Weg fällt ein Teil in tiefen Sonnenstand/)).toBeVisible();
  await expect(page.locator('.route-card').first()).toContainText('Ankunft gegen 20:19');
  await expect(page.locator('.route-card').first()).toContainText('nahe Bäumen');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.locator('.results').scrollIntoViewIfNeeded();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/tablet-changing-light.png' });
  await page.getByRole('slider', { name: 'Startzeit', exact: true }).fill('840');
  await expect(page.locator('.route-card').first()).toContainText('geschätzter Schatten');
  await expect(page.getByText(/Bei diesem Weg fällt ein Teil in tiefen Sonnenstand/)).toHaveCount(
    0,
  );
});
