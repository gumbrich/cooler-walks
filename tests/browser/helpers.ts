import { expect, type Page } from '@playwright/test';
export async function wish(page: Page, name: string, checked = true) {
  if (
    !(await page.locator('.additional-preferences').evaluate((e) => (e as HTMLDetailsElement).open))
  )
    await page.locator('.additional-preferences summary').click();
  await page.getByRole('checkbox', { name, exact: true }).setChecked(checked);
}
export async function choosePlace(page: Page, label: string, name: string) {
  const field = page.getByRole('combobox', { name: label, exact: true });
  await field.fill(name);
  await page.getByRole('listbox').getByRole('option').first().click();
  if (await page.locator('.pavement-option').first().isVisible())
    await page.locator('.pavement-option').first().click();
}
export async function ready(page: Page) {
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
}
