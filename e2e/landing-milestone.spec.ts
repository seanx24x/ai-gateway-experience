import { test, expect } from '@playwright/test';

test('landing composition keeps its working action visible across widths and themes', async ({ page }, info) => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.addInitScript(theme => { localStorage.setItem('gateway-theme', theme); localStorage.removeItem('sean-gateway-demo-v2'); }, theme);
      await page.goto('/');
      await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const action = page.getByRole('button', { name: 'Run a demo request', exact: true });
      const bounds = await action.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(width < 768 ? 800 : 900);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect((await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(64);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/landing-milestone/${info.project.name}/landing-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
});

test('@hosted landing retains selected model and client into setup, with keyboard preview and focus return', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('combobox', { name: 'Try a model', exact: true }).selectOption('openai/gpt-5.4');
  const sdk = page.getByRole('tab', { name: 'AI SDK', exact: true });
  await sdk.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'OpenAI SDK', exact: true })).toBeFocused();
  await expect(page.locator('#landing-integration-preview')).toContainText('openai/gpt-5.4');
  await expect(page.locator('#landing-integration-preview')).toContainText('AI_GATEWAY_API_KEY');
  await page.getByRole('link', { name: 'Prepare my integration', exact: true }).click();
  await expect(page).toHaveURL(/\/connect/);
  await expect(page.locator('.se-context')).toContainText('GPT-5.4');
  await expect(page.locator('.setup-experience')).toContainText('OpenAI');
  await page.reload();
  await expect(page.locator('.setup-experience')).toContainText('OpenAI');
  await expect(page.locator('.se-context')).toContainText('GPT-5.4');
});

test('@hosted landing recovery keeps failed evidence, cancellation and reduced motion understandable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.locator('.discovery-answer-state')).toContainText('Received');
  await page.getByRole('button', { name: 'What if a provider fails?', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.locator('.discovery-status')).toContainText('recovered');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(drawer.locator('.rt-attempt--failed')).toHaveCount(1);
  await expect(drawer.locator('.rt-attempt--success')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Inspect request', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.locator('.discovery-status')).toContainText('Final usage is unknown');
});

test('landing remains usable at 200 percent zoom and exposes manual clipboard recovery', async ({ page, context }) => {
  await context.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Clipboard unavailable')) } }); });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Run a demo request', exact: true })).toBeVisible();
  await page.locator('#landing-integration-preview').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy: manual copy required', exact: true })).toBeVisible();
  await page.locator('#landing-integration-preview pre').focus();
  await expect(page.locator('#landing-integration-preview pre')).toBeFocused();
});
