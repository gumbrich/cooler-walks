import { test, expect } from '@playwright/test';
import { choosePlace, ready } from './helpers';
test('tree shade is standard, contributions stay separate and city changes clear the model', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto('/?view=planner&lang=en');
  await ready(page);
  await expect(page.locator('.canopy-result-note')).toContainText('Tree shade included');
  await page.locator('.walk-details > summary').click();
  await expect(page.locator('.canopy-breakdown')).toContainText('Additional potential tree shade:');
  await page.getByRole('button', { name: 'How we estimate', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Winter leaf loss is not predicted');
  await expect(page.getByRole('dialog')).toContainText('field validation remains pending');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.canopy-result-note')).toContainText('Baumschatten enthalten');
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await ready(page);
  await expect(page.locator('.canopy-result-note')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-zurich');
  await ready(page);
  await expect(page.locator('.canopy-result-note')).toContainText('Baumschatten enthalten');
});
test('failed tree data is explicit and recoverable without silently removing trees', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.route('**/data/zurich-canopy/*.canopy*', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/?view=planner&lang=en');
  await expect(
    page.getByText(
      'The tree shade data could not load. Reconnect or update the saved Zurich map.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({
    path: 'docs/screenshots/phone-integrated-tree-unavailable.png',
    fullPage: true,
  });
  await page.unroute('**/data/zurich-canopy/*.canopy*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(page);
  await expect(page.locator('.canopy-result-note')).toBeVisible();
});
test('tree tiles load for northern pavements and fast time edits cannot publish stale results', async ({
  page,
}) => {
  const requests = new Set<string>(),
    errors: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/zurich-canopy/')) requests.add(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto('/?view=planner&lang=en');
  await ready(page);
  await choosePlace(page, 'From', 'Franklinstrasse / Hofwiesenstrasse');
  await choosePlace(page, 'To', 'Franklinstrasse / Schaffhauserstrasse');
  await ready(page);
  expect(requests.size).toBeGreaterThan(0);
  expect(requests.size).toBeLessThan(81);
  for (const minutes of ['600', '960', '720'])
    await page.getByRole('slider', { name: 'Departure time', exact: true }).fill(minutes);
  await ready(page);
  await expect(page.locator('.time-heading')).toContainText('12:00');
  await expect(page.locator('.canopy-result-note')).toBeVisible();
  expect(errors).toEqual([]);
});
