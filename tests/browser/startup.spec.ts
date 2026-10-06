import { test, expect } from '@playwright/test';

test('planner prioritizes its first route over basemap indexing and still allows early map picking', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let tileRequested = false;
  let basemapRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/zurich-map.geojson')) basemapRequests++;
  });
  await page.route('**/data/zurich-shade/*.shade', async (route) => {
    tileRequested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?view=planner');
    await expect.poll(() => tileRequested).toBe(true);
    await expect(page.getByText('Loading the Zurich map…', { exact: true })).toBeVisible();
    await expect(page.locator('.route-card')).toHaveCount(0);
    expect(basemapRequests).toBe(0);
    // A deliberate request to use the map takes precedence over this schedule.
    await page.getByRole('button', { name: 'Choose from on map', exact: true }).click();
    await expect.poll(() => basemapRequests).toBeGreaterThan(0);
    await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
    release();
    await expect(page.locator('.route-card').first()).toBeVisible();
  } finally {
    release();
  }
});
