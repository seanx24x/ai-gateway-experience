import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { chooseSetup, chooseSetupEditor, reviewSetup } from './setup-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

test('Connect keeps its sentence, artifact and primary action clear across the shared canvas', async ({ page }, testInfo) => {
  const directory = `artifacts/visual-workspaces/${testInfo.project.name}/connect`;
  await mkdir(directory, { recursive: true });
  await page.goto('/connect');
  for (const width of [360, 390, 768, 1440, 1920]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 1000 });
      await page.evaluate(value => {
        localStorage.setItem('gateway-theme', value);
        sessionStorage.removeItem('gateway-sentence-flow-v1');
      }, theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.se-sentence')).toBeVisible();
      const primary = page.getByRole('button', { name: 'Continue', exact: true });
      await expect(primary).toHaveCount(1);
      const bounds = await primary.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(width < 768 ? 800 : 1000);
      await expect(page.locator('.se-artifact .se-context')).toHaveCount(1);
      await expect(page.locator('.se-starter-files')).not.toHaveAttribute('open');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${directory}/initial-${theme}-${width}.png`, fullPage: true });
      {
        await reviewSetup(page);
        await expect(page.getByRole('tab', { name: 'Agent Brief', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Server Code', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Starter', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open in Cursor', exact: true })).toHaveCount(1);
        await expect(page.locator('.se-terminal')).not.toHaveAttribute('open');
        const draft = await page.locator('.se-review-draft').boundingBox();
        const inspector = await page.getByRole('complementary', { name: 'Connection handoff', exact: true }).boundingBox();
        expect(draft).not.toBeNull();
        expect(inspector).not.toBeNull();
        // The draft keeps its reading width. The configuration moves below it
        // before either surface would become squeezed into a narrow column.
        if (width <= 768) {
          expect(inspector!.y).toBeGreaterThanOrEqual(draft!.y + draft!.height - 1);
          expect(Math.abs(inspector!.width - draft!.width)).toBeLessThanOrEqual(1);
        } else {
          expect(inspector!.x).toBeGreaterThanOrEqual(draft!.x + draft!.width + 24);
          expect(Math.abs(inspector!.y - draft!.y)).toBeLessThanOrEqual(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `${directory}/review-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
});

test('Connect progressively reveals starter, existing-app change and reviewed agent CLI without claiming a connection', async ({ page }) => {
  await page.goto('/connect');
  await reviewSetup(page);
  await page.getByRole('tab', { name: 'Starter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download Starter', exact: true })).toBeVisible();
  await chooseSetup(page, 'Connecting', 'Existing app');
  await expect(page.getByRole('tab', { name: 'Starter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/First inspect its framework/);
  await page.locator('.se-terminal > summary').click();
  await chooseSetup(page, 'Auth', 'API key');
  await expect(page.locator('.se-terminal')).toHaveAttribute('open');
  await expect(page.locator('.se-terminal pre')).toContainText('AI_GATEWAY_API_KEY');
  await chooseSetup(page, 'Runs', 'Another platform');
  await expect(page.locator('.se-terminal')).toHaveAttribute('open');
  await chooseSetup(page, 'Connecting', 'Coding agent');
  await expect(page.getByRole('tab', { name: 'Server Code', exact: true })).toHaveCount(0);
  await expect(page.locator('.se-terminal')).toHaveAttribute('open');
  await expect(page.locator('.se-terminal pre')).toContainText('ai-gateway setup --dry-run');
  await expect(page.locator('.se-terminal pre')).toContainText('# Review the preview');
  await expect(page.locator('.se-handoff-status')).toContainText('does not verify a connection');
  await chooseSetupEditor(page, 'VS Code');
  await expect(page.getByRole('button', { name: 'Open in Cursor', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open in VS Code', exact: true })).toHaveCount(1);
});
