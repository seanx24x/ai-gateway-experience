import { expect, type Page } from '@playwright/test';

export async function navigateStage(page: Page, stage: 'Try' | 'Shape' | 'Connect' | 'Observe') {
  const destination = { Try: 'Playground', Shape: 'Routing', Connect: 'Connect', Observe: 'Logs' }[stage];
  const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Choose Gateway section', exact: true }).click();
  await navigation.getByRole('link', { name: destination, exact: true }).click();
  await expect(page.locator('main h1')).toHaveText(destination);
}

export async function openRouteSettings(page: Page) {
  const context = page.getByRole('region', { name: 'Route settings', exact: true });
  if (await context.isVisible()) return;
  await page.getByRole('button', { name: 'Route settings', exact: true }).click();
  await expect(context).toBeVisible();
}

export async function showRequestTable(page: Page) {
  const table = page.getByRole('tab', { name: 'Table', exact: true });
  if (await table.isVisible()) await table.click();
}

export async function openRequestConditions(page: Page) {
  const settings = page.locator('.ew-fixture > details');
  if (await settings.count() && !(await settings.evaluate(element => (element as HTMLDetailsElement).open))) await settings.locator('summary').click();
}
export async function closeRouteSettings(page: Page) {
  const close = page.getByRole('button', { name: 'Close route settings', exact: true });
  if (await close.isVisible()) await close.click();
}
