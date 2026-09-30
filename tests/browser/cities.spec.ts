import { test, expect, type Page } from '@playwright/test';

async function expectMarkersVisible(page: Page) {
  await expect
    .poll(() =>
      page.locator('.map-shell').evaluate((map) => {
        const bounds = map.getBoundingClientRect();
        const overlays = [...map.querySelectorAll('.map-tools, .map-location, .map-legend')].map(
          (el) => el.getBoundingClientRect(),
        );
        const markers = [...map.querySelectorAll('.map-marker')];
        return (
          markers.length === 2 &&
          markers.every((marker) => {
            const p = marker.getBoundingClientRect();
            return (
              p.top >= bounds.top &&
              p.bottom <= bounds.bottom &&
              p.left >= bounds.left &&
              p.right <= bounds.right &&
              overlays.every(
                (o) =>
                  p.right <= o.left || p.left >= o.right || p.bottom <= o.top || p.top >= o.bottom,
              )
            );
          })
        );
      }),
    )
    .toBe(true);
}

test('prefer sun works in winter and respects the direct-walk limit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=planner');
  await page.getByLabel('Departure date', { exact: true }).fill('2026-12-21');
  await page.getByRole('slider', { name: 'Departure time' }).fill('720');
  await page.getByRole('radio', { name: 'Prefer sun', exact: true }).check();
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('.route-card').first()).toContainText('estimated sun');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await expectMarkersVisible(page);
  await page.locator('.results').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/desktop-prefer-sun.png', fullPage: true });
  await page.getByRole('button', { name: 'Direct', exact: true }).click();
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.locator('.map-shell').evaluate((map) => {
        const bounds = map.getBoundingClientRect();
        return [...map.querySelectorAll('.map-marker')].every((marker) => {
          const p = marker.getBoundingClientRect();
          return (
            p.top >= bounds.top &&
            p.bottom <= bounds.bottom &&
            p.left >= bounds.left &&
            p.right <= bounds.right
          );
        });
      }),
    )
    .toBe(true);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  await page.screenshot({ path: 'docs/screenshots/phone-prefer-sun.png', fullPage: true });
  await page.getByRole('slider', { name: 'Departure time' }).fill('0');
  await expect(
    page.getByText('Direct sun is not relevant after dark. Greenery is shown separately.'),
  ).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(1);
});

for (const [id, slug, sunlight, timeZone] of [
  ['de-munich', 'munich', true, 'Berlin'],
  ['us-cambridge-ma', 'cambridge', false, 'New York'],
  ['ch-basel', 'basel', false, 'Zurich'],
] as const) {
  test(`${slug} uses its own map, sources, capabilities and local time`, async ({ page }) => {
    // The initial Zurich route also needs a repeatable solar workload before switching.
    await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
    await page.setViewportSize({
      width: slug === 'cambridge' ? 390 : 1440,
      height: slug === 'cambridge' ? 844 : 1000,
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?view=planner');
    await expect(page.locator('.route-card').first()).toBeVisible();
    await page.getByLabel('City', { exact: true }).selectOption(id);
    await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
    await page.getByRole('slider', { name: 'Departure time' }).fill('840');
    await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
    await expect(page.locator('.time-heading')).toContainText(`${timeZone} time`);
    if (sunlight) {
      await page.getByRole('radio', { name: 'Prefer sun', exact: true }).check();
      await expect(page.locator('.route-card').first()).toContainText('estimated sun');
    } else {
      await expect(page.getByRole('radio', { name: 'Prefer sun', exact: true })).toHaveCount(0);
      await expect(page.locator('.route-card').first()).toContainText('near trees');
      await expect(page.locator('.capability-note')).toContainText('Greenery prototype');
    }
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
    await expect(page.locator('.map-failure')).toHaveCount(0);
    await expect(page.locator('.map-marker')).toHaveCount(2);
    await expectMarkersVisible(page);
    await page.locator('.results').scrollIntoViewIfNeeded();
    await page.locator('.header').click({ position: { x: 1, y: 1 } });
    await page.screenshot({
      path: `docs/screenshots/${slug === 'cambridge' ? 'phone' : 'desktop'}-${slug}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (slug === 'munich') {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectMarkersVisible(page);
      await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
      await expect
        .poll(() =>
          page.locator('.map-shell').evaluate((map) => {
            const bounds = map.getBoundingClientRect();
            return [...map.querySelectorAll('.map-marker')].every((marker) => {
              const p = marker.getBoundingClientRect();
              return p.top >= bounds.top && p.bottom <= bounds.bottom;
            });
          }),
        )
        .toBe(true);
      await page.screenshot({ path: 'docs/screenshots/phone-munich.png', fullPage: true });
    }
    // Switching while another city is loading must never resurrect its results.
    await page.getByLabel('City', { exact: true }).selectOption('ch-zurich');
    await page.getByLabel('City', { exact: true }).selectOption('fr-paris');
    await expect(page.getByRole('heading', { name: /Paris, under review/ })).toBeVisible();
    await expect(page.locator('.route-card')).toHaveCount(0);
    await page.getByLabel('City', { exact: true }).selectOption(id);
    await expect(page.getByRole('button', { name: /Fastest walk/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
