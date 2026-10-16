import { expect, type Page } from '@playwright/test';

export async function reviewSetup(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip to review', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole('region', { name: 'Review your connection', exact: true })).toBeVisible();
}

export async function chooseSetup(page: Page, field: string, option: string) {
  await reviewSetup(page);
  const priorTab = await page.locator('.se-editor-tabs [aria-selected="true"]').textContent();
  const terminalWasOpen = await page.locator('.se-terminal').getAttribute('open') !== null;
  const history: Record<string, string> = { Connecting: 'intent', Client: 'client', Runs: 'environment' };
  if (history[field]) await page.locator('.se-history').getByRole('button', { name: new RegExp(`^Edit ${history[field]}:`) }).click();
  else await page.locator('.se-context').getByRole('button', { name: new RegExp(`^${field}`) }).click();
  const labels: Record<string, string> = { 'New app': 'a new app', 'Existing app': 'an existing app', 'Coding agent': 'my coding agent', 'Another platform': 'on another server', 'Local development': 'on my machine', 'On Vercel': 'on Vercel' };
  await page.locator('.se-decision').getByRole('button', { name: new RegExp(`^${labels[option] ?? option}(?:$|\\s)`) }).click();
  await reviewSetup(page);
  if (priorTab) {
    const tab = page.getByRole('tab', { name: priorTab.trim(), exact: true });
    if (await tab.isVisible()) await tab.click();
  }
  if (terminalWasOpen && await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
}

export async function chooseSetupEditor(page: Page, editor: 'Cursor' | 'VS Code') {
  await reviewSetup(page);
  await page.getByRole('group', { name: 'Handoff editor', exact: true }).getByRole('button', { name: editor, exact: true }).click();
  await expect(page.getByRole('button', { name: `Open in ${editor}`, exact: true })).toBeVisible();
}
