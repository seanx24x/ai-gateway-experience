import { expect, type Page } from '@playwright/test';

export async function navigateWorkspace(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('link', { name: name === 'Model List' ? 'Models' : name === 'Quick Start' ? 'Connect' : name, exact: true });
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Choose Gateway section', exact: true }).click();
  await link.click();
  await expect(page.locator('main h1')).toBeVisible();
}
