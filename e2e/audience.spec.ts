import { navigateWorkspace } from './workspace-helper';
import { chooseSetup, reviewSetup } from './setup-helper';
import { test, expect, type Page } from '@playwright/test';

const GPT = 'openai/gpt-5.4';
test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

async function start(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
}

async function runFault(page: Page, scenario: string) {
  const conditions = page.locator('.ew-fixture details');
  if (await conditions.getAttribute('open') === null) await conditions.locator('summary').click();
  await conditions.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption(scenario);
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  return page.getByRole('region', { name: 'Request details', exact: true });
}

test('@hosted the prepared answer teaches recovery and retains its exact request evidence', async ({ page }) => {
  await start(page, '/');
  await expect(page.locator('.gateway-definition')).toContainText('one API');
  await expect(page.locator('.discovery-mechanics')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.clock.runFor(10_000);
  const answer = await page.locator('.discovery-answer-text').innerText();
  expect(answer).toContain('order number');
  await expect(page.locator('.discovery-receipt')).toContainText('Claude Sonnet 4.6');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  let dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await dialog.locator('.drawer-workload > summary').click();
  await expect(dialog.locator('.drawer-workload p')).toBeVisible();
  await expect(dialog.locator('.drawer-workload')).toContainText('charged twice');
  await dialog.locator('.drawer-response > summary').click();
  await dialog.getByText('Request metadata', { exact: true }).click();
  await expect(dialog.locator('.drawer-response p')).toHaveText(answer);
  const firstId = await dialog.locator('.request-id code').innerText();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'What if a provider fails?', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(page.locator('.discovery-answer-text')).toHaveText(answer);
  await expect(page.locator('.discovery-status')).toContainText('recovered');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await dialog.getByText('Request metadata', { exact: true }).click();
  const recoveryId = await dialog.locator('.request-id code').innerText();
  expect(recoveryId).toMatch(/^demo_/);
  expect(recoveryId).not.toBe(firstId);
  await expect(dialog.locator('.rt-attempt--failed')).toHaveCount(1);
  await expect(dialog.locator('.rt-attempt--success')).toContainText('Amazon Bedrock');
  await dialog.locator('.drawer-response > summary').click();
  await expect(dialog.locator('.drawer-response p')).toHaveText(answer);
  await page.keyboard.press('Escape');
  await page.locator('.discovery-live-evidence .ew-replay-disclosure > summary').click();
  await expect(page.getByRole('region', { name: 'Request replay', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Replay position', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.discovery-answer-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to completed request', exact: true }).click();
  await expect(page.locator('.discovery-answer-text')).toHaveText(answer);
});

test('existing clients get migration changes and environment-led authentication that persists', async ({ page }) => {
  await start(page, '/connect');
  await chooseSetup(page, 'Connecting', 'Existing app');
  await chooseSetup(page, 'Client', 'OpenAI SDK');
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/First inspect its framework/);
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  const code = page.locator('.se-editor [role="tabpanel"]:visible pre');
  await expect(code).toContainText('https://ai-gateway.vercel.sh/v1');
  await expect(code).not.toContainText('pnpm add');
  await chooseSetup(page, 'Runs', 'Another platform');
  await expect(page.locator('.se-context')).toContainText('API key');
  await expect(code).toContainText('process.env.AI_GATEWAY_API_KEY');
  await expect(code).not.toContainText('getVercelOidcToken');
  await chooseSetup(page, 'Model', 'GPT-5.4');
  await expect(page.locator('.se-context')).toContainText('GPT-5.4');
  await page.reload();
  await expect(page.locator('.se-history')).toContainText('an existing app');
  await expect(page.locator('.setup-experience')).toContainText('on another server');
  await expect(page.locator('.se-context')).toContainText('GPT-5.4');
  await expect(page.locator('.se-context')).toContainText('GPT-5.4');
  await expect(page.locator('.se-context')).toContainText('API key');
  await page.getByRole('button', { name: 'Edit choices', exact: true }).click();
  await page.getByRole('button', { name: 'Try a simulated request first', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await dialog.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(dialog.locator('.request-metadata')).toContainText('API key');
  await expect(dialog.locator('.request-metadata')).toContainText(GPT);
});

test('authentication, budget, and model availability failures lead to their relevant actions', async ({ page }) => {
  await start(page, '/playground');
  let dialog = await runFault(page, 'invalid-key');
  await expect(dialog.getByRole('button', { name: 'Test an adjustment', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Review API key setup', exact: true }).click();
  await expect(page).toHaveURL(/\/connect/);
  await expect(page.getByRole('navigation', { name: 'Investigation context' })).toContainText('Check the Gateway API key');
  await reviewSetup(page);
  await expect(page.locator('.setup-experience')).toContainText('on another server');
  await chooseSetup(page, 'Connecting', 'Coding agent');
  await navigateWorkspace(page, 'Playground');
  dialog = await runFault(page, 'expired-oidc');
  await dialog.getByRole('button', { name: 'Review OIDC setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Investigation context' }).getByText('Why this step?', { exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Investigation context' })).toContainText('vercel env pull');
  await reviewSetup(page);
  await expect(page.locator('.se-history')).toContainText('on my machine');
  await expect(page.locator('.se-history')).toContainText('an existing app');
  await expect(page.locator('.se-context')).toContainText('OIDC');
  await navigateWorkspace(page, 'Playground');
  dialog = await runFault(page, 'budget');
  await expect(dialog.getByRole('button', { name: 'Test an adjustment', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Review budget guidance', exact: true }).click();
  await expect(page).toHaveURL(/\/budgets/);
  await expect(page.locator('main')).toContainText('API-key');
  await page.goto('/playground');
  dialog = await runFault(page, 'model-unavailable');
  await dialog.getByRole('button', { name: 'Review model availability', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a model', exact: true })).toBeVisible();
});

test('recovery, comparison roles, policy revisions, and dates stay distinct in monitoring', async ({ page }) => {
  await start(page, '/monitor');
  await page.getByRole('button', { name: 'Recovered', exact: true }).click();
  await page.getByRole('tab', { name: 'Table', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByRole('combobox', { name: 'Request status', exact: true })).toHaveValue('recovered');
  await expect(page).toHaveURL(/status=recovered/);
  await page.locator('tbody .request-link').first().click();
  await page.getByRole('button', { name: 'Test an adjustment', exact: true }).click();
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.comparison-record').first()).toContainText('Source policy');
  await expect(page.locator('.comparison-record').first()).toContainText('r1');
  await page.locator('.ew-primary-action').getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save demo revision', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Controlled route comparison', exact: true })).toBeVisible();
  await page.locator('.ew-primary-action').getByRole('button', { name: 'Simulate activation', exact: true }).click();
  await expect(page.locator('.rehearsal-comparison')).toContainText('r2');
  await expect(page.locator('.comparison-record').first()).toContainText('r1');
  await navigateWorkspace(page, 'Logs');
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('all');
  const identities = await page.locator('tbody .request-link').evaluateAll(buttons => buttons.map(button => button.textContent));
  expect(new Set(identities).size).toBe(identities.length);
  await expect(page.locator('tbody')).toContainText('2026-10-04');
  await expect(page.locator('tbody')).toContainText('2026-10-05');
  const hourOptions = page.getByRole('combobox', { name: 'Recorded hour', exact: true }).locator('option');
  await expect(hourOptions.first()).toHaveText('All recorded hours');
  expect((await hourOptions.allTextContents()).join(' ')).toContain('2026-10-04');
  expect((await hourOptions.allTextContents()).join(' ')).toContain('2026-10-05');
  await page.getByRole('textbox', { name: 'Search requests', exact: true }).fill('demo_draft_');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody .request-link')).toContainText('draft_');
});

test('the first example action remains visible on small screens with the optional tour', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page, '/');
  let currentTheme = 'light';
  for (const [width, height, path] of [[360, 800, '/'], [390, 844, '/?tour=1']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', currentTheme);
    for (const theme of ['light', 'dark']) {
      if (currentTheme !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      currentTheme = theme;
      const action = await page.getByRole('button', { name: 'Run a demo request', exact: true }).boundingBox();
      expect(action).not.toBeNull();
      expect(action!.y + action!.height).toBeLessThanOrEqual(height);
      const widthCheck = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(widthCheck.content).toBeLessThanOrEqual(widthCheck.viewport + 1);
    }
  }
});
