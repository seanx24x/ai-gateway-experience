import { chooseSetupEditor, reviewSetup } from './setup-helper';
import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

test('an unavailable editor and an oversized Cursor brief retain a complete manual handoff', async ({ page, context }) => {
  await context.addInitScript(() => {
    // Exercise the requested-draft UI without opening an installed desktop app.
    document.addEventListener('click', event => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link?.getAttribute('href')?.startsWith('vscode:')) event.preventDefault();
    }, true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { document.documentElement.dataset.copiedPrompt = text; return Promise.resolve(); } },
    });
  });
  await page.goto('/connect');
  await reviewSetup(page);
  await chooseSetupEditor(page, 'VS Code');
  await page.getByRole('button', { name: 'Open in VS Code', exact: true }).click();
  await expect(page.locator('.se-handoff-status')).toContainText('Draft handoff requested');
  await expect(page.locator('.se-handoff-status')).toContainText('If the app did not open, use Copy Prompt');
  await expect(page).toHaveURL(/\/connect$/);

  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await chooseSetupEditor(page, 'Cursor');
  const oversized = '模'.repeat(1200);
  await brief.fill(oversized);
  const blockedCursorActions = page.getByRole('button', { name: 'Open in Cursor', exact: true });
  await expect(blockedCursorActions).toHaveCount(1);
  for (const action of await blockedCursorActions.all()) await expect(action).toBeDisabled();
  await expect(page.locator('.se-handoff-status')).toContainText('exceeds Cursor’s link limit');
  await expect(brief).toHaveValue(oversized);
  await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-copied-prompt', oversized);
  await expect(page.getByRole('textbox', { name: /key|credential/i })).toHaveCount(0);
  await brief.fill('A revised task for my existing app.');
  await expect(page.getByRole('button', { name: 'Copy Prompt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0);
  await expect(page.locator('.se-handoff-status')).not.toContainText('Draft handoff requested');
});
