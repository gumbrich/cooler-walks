import { expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 60000 });
export async function munichReady(page) {
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
}
export async function checkMunichPlanner(page) {
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).selectOption('en');
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('de-munich');
  await munichReady(page);
  if (!(await page.locator('#detour-minutes').isVisible()))
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByLabel('Departure date', { exact: true }).fill('2026-06-21');
  await page.getByRole('slider', { name: 'Departure time', exact: true }).fill('840');
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  await munichReady(page);
  const selected = page.locator('.route-card.selected .route-distance');
  const shade = await selected.innerText();
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await munichReady(page);
  await expect(selected).not.toHaveText(shade);
  const sun = await selected.innerText();
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  if (!(await page.locator('.additional-preferences').evaluate((e) => e.open)))
    await page.locator('.additional-preferences summary').click();
  for (const name of ['Calm streets', 'Flatter routes', 'Waterside', 'Accessibility'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await page.getByRole('button', { name: '+15 min', exact: true }).click();
  await page.locator('#detour-minutes').fill('7');
  await munichReady(page);
  await expect(page.locator('.route-elevation').first()).toBeVisible();
  await expect(page.locator('.accessibility-result-note')).toBeVisible();
  await page.getByRole('button', { name: 'Tempo 30 / 20 zones', exact: true }).click();
  await expect(page.locator('.zone-legend')).toContainText('Tempo 30');
  for (const [label, address] of [
    ['From', 'Marienplatz 1'],
    ['To', 'Residenzstraße 1'],
  ]) {
    const field = page.getByRole('combobox', { name: label, exact: true });
    await field.fill(address);
    await page.getByRole('listbox').getByRole('option').first().click();
  }
  await munichReady(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await expect(page.locator('.route-model-note').first()).toContainText('3D-Dächer');
  await expect(page.getByRole('checkbox', { name: 'Barrierefreiheit', exact: true })).toBeChecked();
  if (await page.locator('.mobile-save').isVisible()) await page.locator('.mobile-save').click();
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  return {
    shadeDistance: shade,
    sunDistance: sun,
    combinedPreferences: true,
    minuteSlider: true,
    addresses: true,
    german: true,
    zones: true,
    groundProfile: true,
  };
}

export async function checkMunichExpansion(page) {
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).selectOption('en');
  if (!(await page.getByRole('combobox', { name: 'From', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  if (!(await page.locator('.additional-preferences').evaluate((e) => e.open)))
    await page.locator('.additional-preferences summary').click();
  for (const name of ['Calm streets', 'Flatter routes', 'Waterside', 'Accessibility'])
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  for (const [label, name] of [
    ['From', 'Hohenzollernplatz'],
    ['To', 'Münchner Freiheit'],
  ]) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    await page.getByRole('listbox').getByRole('option').first().click();
  }
  await page.getByRole('button', { name: '+5 min', exact: true }).click();
  await page.getByRole('button', { name: 'Shade', exact: true }).click();
  await munichReady(page);
  const selected = page.locator('.route-card.selected .route-distance');
  const shade = await selected.innerText();
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await munichReady(page);
  await expect(selected).not.toHaveText(shade);
  const sun = await selected.innerText();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  if (await page.locator('.mobile-save').isVisible()) await page.locator('.mobile-save').click();
  await page.getByRole('button', { name: 'Weg auf der Karte einpassen', exact: true }).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-settled', 'true');
  return {
    from: 'Hohenzollernplatz',
    to: 'Münchner Freiheit',
    shadeDistance: shade,
    sunDistance: sun,
  };
}
