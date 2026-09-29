import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public help and privacy pages work without JavaScript, including phone and enlarged text', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4181/support/');
  await expect(page.getByRole('heading', { name: 'Help & feedback' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'knoerzerjohannes@protonmail.com' })).toHaveAttribute(
    'href',
    'mailto:knoerzerjohannes@protonmail.com',
  );
  await page.screenshot({ path: 'docs/screenshots/phone-support.png', fullPage: true });
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location is your choice' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/desktop-privacy.png', fullPage: true });
  await context.close();
});

test('release pages meet accessibility checks and stay within the phone viewport at 200% text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/support/', '/privacy/']) {
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
