import { expect } from '@playwright/test';
/** The old toggle replaced the journey with a demo. Now explicitly choose the
 * frozen reference when a cache regression needs its known four crossings. */
export async function pavementReference(page) {
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  await from.fill('');
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await to.fill('Bahnhofstrasse / Sihlstrasse');
  await to.press('Enter');
  await from.fill('Talacker / Pelikanstrasse');
  await from.press('Enter');
  await expect(page.locator('.route-pavement-note').first()).toContainText('4 crossing sections', {
    timeout: 45000,
  });
}
export async function standardReference(page) {
  const from = page.getByRole('combobox', { name: 'From', exact: true });
  await from.fill('');
  const to = page.getByRole('combobox', { name: 'To', exact: true });
  await to.fill('Bürkliplatz');
  await to.press('Enter');
  await from.fill('Bahnhofquai');
  await from.press('Enter');
  await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 45000 });
}
export async function confirmGermanAddressSides(page) {
  const picker = page.getByRole('region', { name: 'Fussweg wählen', exact: true });
  for (const address of ['Hofwiesenstrasse 350', 'Wallisellenstrasse 45']) {
    await expect(picker).toContainText(address, { timeout: 45000 });
    await page.locator('.pavement-option').first().click();
  }
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.route-pavement-note').first()).toBeVisible({ timeout: 45000 });
}
