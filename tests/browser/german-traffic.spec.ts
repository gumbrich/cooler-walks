import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('German entry, calmer streets and language switching preserve the trip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('.hero-route-note')).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-german-home.png', fullPage: true });
  await page.locator('.hero-cta').click();
  await page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).check();
  await expect(page.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible();
  await expect(page.locator('.route-name').last()).toContainText('+3,0');
  await expect(page.locator('body')).not.toContainText('{zone}');
  const from = await page.getByRole('combobox', { name: 'Von', exact: true }).inputValue();
  const destination = await page.getByRole('combobox', { name: 'Nach', exact: true }).inputValue();
  const route = await page.locator('.route-card.selected .route-numbers').innerText();
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue(from);
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue(destination);
  await expect(page.getByRole('checkbox', { name: /Prefer calmer streets/ })).toBeChecked();
  await expect(page.getByRole('button', { name: /Calmer streets/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.route-card.selected .route-numbers')).toHaveText(route, {
    useInnerText: true,
  });
  await page.locator('.results').scrollIntoViewIfNeeded();
  await page.locator('.traffic-profile > summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.traffic-profile')).toHaveAttribute('open', '');
  await expect(page.locator('.traffic-profile')).toContainText('Tempo-30-Strassen');
  await expect(page.locator('.traffic-profile')).toContainText('Vor-Ort-Prüfung steht aus');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-german-calm.png', fullPage: true });
  await page.screenshot({ path: 'docs/screenshots/desktop-traffic-v2.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Direkt', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.getByRole('button', { name: /\+5 min/ }).click();
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('de-munich');
  await expect(page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ })).toHaveCount(0);
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
test('German phone and tablet layouts, controls, downloads and error recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Weg bearbeiten', exact: true }).click();
  await page.getByRole('checkbox', { name: /Verkehrsberuhigt bevorzugen/ }).check();
  await expect(page.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/phone-german-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Meinen Weg anzeigen' }).click();
  await page.locator('.traffic-profile > summary').click();
  await expect(page.locator('.traffic-profile')).toContainText(
    'Wege & verkehrsbeschränkte Strassen',
  );
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-german-calm.png', fullPage: true });
  await page.screenshot({ path: 'docs/screenshots/phone-traffic-v2.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('.traffic-profile').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/tablet-traffic-v2.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.downloads-link').click();
  await expect(page.locator('.area-list')).toBeVisible();
  await expect(page.locator('.area-list')).toContainText('Zürich · Zentrum, Nord und West');
  await page.screenshot({ path: 'docs/screenshots/phone-german-downloads.png', fullPage: true });
  await page.locator('.dialog-close').click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('fr-paris');
  await expect(page.locator('.unsupported')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/tablet-german-unsupported.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/data/zurich.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-zurich');
  await expect(page.locator('.status.error')).toContainText('Verbindung');
  await page.screenshot({ path: 'docs/screenshots/tablet-german-error.png', fullPage: true });
  await page.unroute('**/data/zurich.json');
  await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
  await expect(page.locator('.route-card').first()).toBeVisible();
});
