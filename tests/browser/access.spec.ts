import { test, expect } from '@playwright/test';
import { gate } from '../../netlify/edge-functions/access';

test('private access supports real browser login and logout forms', async ({ page }) => {
  // Deliberately isolated credentials and origin: no production secret enters CI.
  const origin = 'https://access.example.test';
  await page.route(`${origin}/**`, async (route) => {
    const incoming = route.request();
    const request = new Request(incoming.url(), {
      method: incoming.method(),
      headers: await incoming.allHeaders(),
      ...(incoming.method() === 'POST' ? { body: incoming.postData() } : {}),
    });
    const response = await gate(
      request,
      {
        next: async () =>
          new Response(
            '<h1>Protected planner</h1><form method="post" action="/_access/logout"><button>Lock website</button></form>',
            {
              headers: { 'Content-Type': 'text/html' },
            },
          ),
      },
      'browser-fixture-password',
      'browser-fixture-signing-secret-32-bytes',
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto(`${origin}/de/?view=planner`);
  await page.getByLabel('Passwort', { exact: true }).fill('wrong-fixture');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Das Passwort stimmt nicht.');
  await page.getByLabel('Passwort', { exact: true }).fill('browser-fixture-password');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Protected planner' })).toBeVisible();
  await expect(page).toHaveURL(`${origin}/de/?view=planner`);
  await page.getByRole('button', { name: 'Lock website', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.goto(`${origin}/de/`);
  await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
});
