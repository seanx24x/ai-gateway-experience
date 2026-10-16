import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { chooseSetup, reviewSetup } from './setup-helper';
import { navigateWorkspace } from './workspace-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

async function captureSelectedState(page: Page, testInfo: TestInfo, state: string) {
  for (const { width, height, theme } of [{ width: 1440, height: 1000, theme: 'light' }, { width: 390, height: 844, theme: 'dark' }] as const) {
    await page.setViewportSize({ width, height });
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/other-pages-refinement/${testInfo.project.name}/discovery-${state}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
}

async function expectReviewedHandoff(page: Page, identifier: string) {
  await expect(page).toHaveURL(/\/connect/);
  await reviewSetup(page);
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(brief).toHaveValue(new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const prompt = await brief.inputValue();
  const href = await page.locator('a[href^="https://cursor.com/link/prompt?"]').getAttribute('href');
  expect(href).not.toBeNull();
  expect(new URL(href!).searchParams.get('text')).toBe(prompt);
  expect(prompt).toContain(identifier);
}

test('a discovered model keeps its identity from keyboard code review through a manual-safe editor draft', async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Clipboard unavailable')) },
    });
  });
  await page.goto('/models?model=openai%2Fgpt-5.4');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(page.getByRole('button', { name: 'GPT-5.4 details', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const detail = page.getByRole('region', { name: 'GPT-5.4 information', exact: true });
  await expect(detail.getByRole('complementary', { name: 'GPT-5.4 connection', exact: true })).toContainText('Candidate serving providers');
  await expect(detail.getByRole('complementary', { name: 'GPT-5.4 connection', exact: true })).toContainText('Azure');
  await captureSelectedState(page, testInfo, 'model-request');
  await detail.getByRole('tab', { name: 'Request', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const codeTab = detail.getByRole('tab', { name: 'Code', exact: true });
  await expect(codeTab).toBeFocused();
  await expect(codeTab).toHaveAttribute('aria-selected', 'true');
  const code = detail.getByLabel('Server-side code example', { exact: true });
  await expect(code).toContainText("model: 'openai/gpt-5.4'");
  await captureSelectedState(page, testInfo, 'model-code');
  await detail.getByRole('button', { name: 'Copy server-side example', exact: true }).click();
  await expect(detail.getByRole('status')).toHaveText('Clipboard access is unavailable. Select and copy the code above.');
  await expect(code).toBeVisible();
  await detail.getByRole('button', { name: 'Connect this model', exact: true }).click();
  await expectReviewedHandoff(page, 'openai/gpt-5.4');
});

test('a Virtual Model carries the stable alias from its route into code and the reviewed handoff', async ({ page }, testInfo) => {
  const alias = 'vmc/visual-context-route';
  await page.goto('/connect');
  await chooseSetup(page, 'Connecting', 'Coding agent');
  await expect(page.locator('main h1')).toHaveText('Connect an agent');
  await navigateWorkspace(page, 'Virtual Models');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  const form = page.locator('.mw-create-plane form');
  await form.getByRole('textbox', { name: 'Slug', exact: true }).fill('visual-context-route');
  await form.getByRole('combobox', { name: 'Underlying model', exact: true }).selectOption('anthropic/claude-haiku-4.5');
  await form.getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  await expect(page).toHaveURL(/\/virtual-models\?alias=visual-context-route/);
  const detail = page.getByRole('region', { name: `${alias} configuration`, exact: true });
  await expect(detail.getByRole('tab', { name: 'Route', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(detail.locator('.mw-alias-route')).toContainText(alias);
  await expect(detail.locator('.mw-alias-route')).toContainText('Claude Haiku 4.5');
  await detail.getByRole('tab', { name: 'Route', exact: true }).focus();
  await page.keyboard.press('End');
  const codeTab = detail.getByRole('tab', { name: 'Code', exact: true });
  await expect(codeTab).toBeFocused();
  await expect(codeTab).toHaveAttribute('aria-selected', 'true');
  const code = detail.getByLabel('Server-side code example', { exact: true });
  await expect(code).toContainText(`model: '${alias}'`);
  await expect(code).not.toContainText('anthropic/claude-haiku-4.5');
  await page.keyboard.press('Home');
  await expect(detail.getByRole('tab', { name: 'Route', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(codeTab).toHaveAttribute('aria-selected', 'true');
  await captureSelectedState(page, testInfo, 'virtual-model-code');
  await detail.getByRole('button', { name: 'Use in Connect', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Connect');
  await expectReviewedHandoff(page, alias);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/Requested primary model: "anthropic\/claude-haiku-4.5"/);
});


test('reference clients keep their request shape and the cost estimator explains a zero-token request', async ({ page }, testInfo) => {
  await page.goto('/documentation');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('tab', { name: 'AI SDK', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'OpenAI SDK', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Server-side code example', { exact: true })).toContainText('https://ai-gateway.vercel.sh/v1');
  await expect(page.getByLabel('Server-side code example', { exact: true })).toContainText('process.env.AI_GATEWAY_API_KEY');
  await captureSelectedState(page, testInfo, 'documentation-code');

  await page.goto('/leaderboards');
  await page.getByRole('tab', { name: 'Official discovery', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Request cost estimator', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('slider', { name: /^Input tokens/ }).focus();
  await page.keyboard.press('Home');
  await page.getByRole('slider', { name: /^Output tokens/ }).focus();
  await page.keyboard.press('Home');
  for (const model of ['Claude Sonnet 4.6', 'Claude Haiku 4.5', 'GPT-5.4']) await expect(page.getByLabel(`${model} estimated request cost`, { exact: true })).toHaveText('$0.0000');
  await captureSelectedState(page, testInfo, 'estimator-zero');
  await page.getByText('Rates and estimate scope', { exact: true }).click();
  await expect(page.locator('.mw-estimator-footnote')).toContainText('No API request is made.');
  await expect(page.locator('.mw-estimator-footnote')).toContainText('Oct 4, 2026');
  await page.getByRole('slider', { name: /^Input tokens/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Claude Sonnet 4.6 estimated request cost', { exact: true })).not.toHaveText('$0.0000');
});
