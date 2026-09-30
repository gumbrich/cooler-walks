import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public help and privacy pages work without JavaScript, including phone and enlarged text', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/support/');
  await expect(page.getByRole('heading', { name: 'Help & feedback' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'knoerzerjohannes@protonmail.com' })).toHaveAttribute(
    'href',
    'mailto:knoerzerjohannes@protonmail.com',
  );
  await page.screenshot({ path: 'docs/screenshots/phone-support.png', fullPage: true });
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location is your choice' })).toBeVisible();
  await context.close();
  // A fresh viewport avoids Chromium's full-page capture tiling after a resize.
  const desktop = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto('/privacy/');
  await desktopPage.screenshot({ path: 'docs/screenshots/desktop-privacy.png' });
  await desktop.close();
});

test('release pages meet accessibility checks and stay within the phone viewport at 200% text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/support/', '/privacy/', '/de/support/', '/de/privacy/']) {
    await page.goto(route);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('planner runs under production CSP and offline privacy navigation stays on the privacy page', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as unknown as { cspErrors: string[] }).cspErrors = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspErrors: string[] }).cspErrors.push(event.violatedDirective);
    });
  });
  await page.goto('/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-ready', 'true');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Shell installation is independent of the large visited-city cache. Wait
  // for both actual files before deliberately disconnecting the browser.
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            Boolean(await caches.match('/data/zurich.json')) &&
            Boolean(await caches.match('/data/zurich-map.geojson')),
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { cspErrors: string[] }).cspErrors),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await page.goto('/privacy/');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Location is your choice' })).toBeVisible();
  await context.setOffline(false);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/not-a-page');
  await expect(page.getByRole('heading', { name: 'This path ends here.' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/tablet-release-404.png', fullPage: true });
});

test('German public pages work without JavaScript and offline navigation stays German', async ({
  browser,
  page,
  context,
  baseURL,
}) => {
  const noScript = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const publicPage = await noScript.newPage();
  await publicPage.goto('/de/support/');
  await expect(
    publicPage.getByRole('heading', { name: 'Wie funktionieren verkehrsberuhigte Wege?' }),
  ).toBeVisible();
  await publicPage.getByRole('link', { name: 'Datenschutz', exact: true }).click();
  await expect(
    publicPage.getByRole('heading', { name: 'Der Standort bleibt deine Entscheidung' }),
  ).toBeVisible();
  await noScript.close();
  await page.goto('/de/?view=planner');
  await expect(page.locator('.route-card').first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Shell installation is independent of the large visited-city cache. Wait
  // for both actual files before deliberately disconnecting the browser.
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            Boolean(await caches.match('/data/zurich.json')) &&
            Boolean(await caches.match('/data/zurich-map.geojson')),
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.goto('/de/privacy/');
  await expect(
    page.getByRole('heading', { name: 'Der Standort bleibt deine Entscheidung' }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.goto('/de/not-a-page');
  await expect(page.getByRole('heading', { name: 'Hier endet dieser Weg.' })).toBeVisible();
});
