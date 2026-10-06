import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('official zones toggle, remain distinct from route scores, and fit EN/DE layouts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.getByRole('checkbox', { name: 'Verkehrsberuhigt bevorzugen', exact: true }).check();
  await expect(page.getByRole('button', { name: /Verkehrsberuhigter Weg/ })).toBeVisible();
  const before = await page.locator('.route-numbers').allTextContents();
  const toggle = page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('note', { name: 'Zonenlegende' })).toContainText(
    'Umsetzung unbekannt',
  );
  expect(await page.locator('.route-numbers').allTextContents()).toEqual(before);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/desktop-tempo-zones-de.png' });
  const legend = await page.locator('.map-legend').boundingBox();
  const time = await page.locator('.timeline-wrap').boundingBox();
  expect(legend!.y).toBeGreaterThanOrEqual(time!.y + time!.height);
  await page.locator('.map-canvas').click({ position: { x: 200, y: 300 } });
  await expect(page.locator('.map-zone-detail')).toContainText('Stadtdaten · umgesetzt');
  await page.getByRole('button', { name: 'Kartenpunkt schliessen', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(page.getByRole('note', { name: 'Zone legend' })).toContainText(
    'Ordered · implementation unknown',
  );
  for (const [width, height, name] of [
    [820, 1180, 'tablet'],
    [390, 844, 'phone'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Fit route to map', exact: true }).click();
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
    await page.screenshot({ path: `docs/screenshots/${name}-tempo-zones-en.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const key = await page.locator('.map-legend').boundingBox();
    const attribution = await page.locator('.maplibregl-ctrl-attrib').boundingBox();
    expect(key!.y + key!.height).toBeLessThanOrEqual(attribution!.y);
    if (width < 620) {
      const destination = await page.locator('.map-marker.destination').boundingBox();
      expect(destination!.y + destination!.height).toBeLessThan(key!.y);
    } else {
      const timeline = await page.locator('.timeline-wrap').boundingBox();
      expect(key!.y).toBeGreaterThanOrEqual(timeline!.y + timeline!.height);
      const destination = await page.locator('.map-marker.destination').boundingBox();
      expect(destination!.y + destination!.height).toBeLessThan(timeline!.y);
    }
  }
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await page.screenshot({ path: 'docs/screenshots/phone-tempo-zones-de.png' });
  await page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true }).click();
  await expect(page.locator('.zone-legend')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Stadt', exact: true }).selectOption('ch-basel');
  await expect(page.getByRole('button', { name: 'Tempo-30-/20-Zonen', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.route-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('downloaded Zurich map retains zone boundaries with network data unavailable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Offline maps', exact: true }).click();
  const pack = page.locator('[data-area-id="ch-zurich"]');
  await pack.getByRole('button', { name: 'Download area', exact: true }).click();
  await expect(pack.locator('.area-state')).toHaveText('Saved');
  await pack.getByRole('button', { name: 'Open this area', exact: true }).click();
  await page.route('**/data/**', (route) => route.abort('internetdisconnected'));
  await page.route('**/packs/**', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tempo 30 / 20 zones', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Tempo 30 / 20 zones', exact: true }).click();
  await expect(page.getByRole('note', { name: 'Zone legend' })).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expect(page.locator('.map-failure')).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/phone-tempo-zones-offline.png' });
});
