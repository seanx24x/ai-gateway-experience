import { openRouteSettings } from './focused-workspace-helper';
import { test, expect } from '@playwright/test';
import { navigateWorkspace } from './workspace-helper';
import { reviewSetup } from './setup-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

test('@hosted credential metadata, its budget, and provider connection stay distinct across refresh', async ({ page }) => {
  await page.goto('/keys');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  const creation = page.getByRole('region', { name: 'Create demo key metadata', exact: true });
  await creation.getByRole('textbox', { name: 'Key name', exact: true }).fill('Studio CI');
  await creation.getByRole('button', { name: 'Create demo metadata', exact: true }).click();
  const key = page.locator('.ops-key-row').filter({ hasText: 'Studio CI' });
  await expect(key).toContainText('No enabled demo cap');
  const inspector = page.getByRole('region', { name: 'API key inspector', exact: true });
  await expect(inspector).toBeVisible();
  await expect(key.getByRole('button', { name: 'Inspect key Studio CI', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await inspector.getByRole('button', { name: 'Add budget', exact: true }).click();
  const budget = page.getByRole('region', { name: 'Create demo budget', exact: true });
  await expect(budget.getByRole('combobox', { name: 'Demo API key', exact: true })).toHaveValue(/demo_key_/);
  await budget.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true }).fill('12');
  await budget.getByRole('group', { name: 'Refresh period', exact: true }).getByRole('radio', { name: 'Weekly', exact: true }).check();
  await budget.getByRole('button', { name: 'Save demo budget', exact: true }).click();
  await expect(key).toContainText('$12.00 / weekly');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review demo key revocation', exact: true }).getByRole('button', { name: 'Revoke demo key', exact: true }).click();
  await expect(key).toContainText('Revoked in demo');
  await page.reload();
  await expect(key).toContainText('$12.00 / weekly');
  await key.getByRole('button', { name: 'Inspect key Studio CI', exact: true }).click();
  await inspector.getByRole('button', { name: 'Restore demo metadata', exact: true }).click();
  await expect(key).toContainText('Active in demo');
  if (await inspector.isVisible()) await page.keyboard.press('Escape');
  await navigateWorkspace(page, 'Bring Your Own Key');
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  const connection = page.getByRole('dialog', { name: 'Add demo provider connection', exact: true });
  await connection.getByRole('textbox').fill('Studio provider');
  await connection.getByRole('button', { name: /Add demo/ }).click();
  await expect(page.locator('.ops-lane-evidence')).toContainText('Credentials are not validated');
  await expect(page.getByRole('complementary', { name: 'Provider billing path', exact: true })).toContainText('Not performed');
  const requestsBeforeToggle = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!).requests));
  await page.getByRole('switch', { name: 'Disable Studio provider', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Enable Studio provider', exact: true })).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!).requests))).toBe(requestsBeforeToggle);
  await expect(page.getByRole('textbox', { name: /secret|credential|api key/i })).toHaveCount(0);
});

test('@hosted preferences change the actual overview and preserve exact request drill-in', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Workspace display name', exact: true }).fill('Studio workspace');
  await expect(page.getByRole('complementary', { name: 'Live workspace preference preview', exact: true })).toContainText('Studio workspace');
  await page.getByRole('radio', { name: 'Compact', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Show workload preview in selected receipt', exact: true }).check();
  await expect(page.locator('.ops-preference-preview .ops-activity-list')).toHaveClass(/compact/);
  await expect(page.locator('.ops-preference-preview .ops-activity-main > small').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toHaveCount(0);
  await navigateWorkspace(page, 'Overview');
  await expect(page.locator('.team-name')).toHaveText('Studio workspace');
  await expect(page.getByTestId('request-field')).toHaveAttribute('data-activity-density', 'compact');
  await expect(page.getByTestId('request-field').locator('.rqf-workload-preview')).toBeVisible();
  const requestId = (await page.getByTestId('request-field-preview').locator('.rqf-preview-top code').textContent())!.trim();
  await page.getByTestId('request-field-preview').getByRole('button', { name: 'Inspect request', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?request=/);
  await expect(page.getByRole('region', { name: 'Request details', exact: true }).locator('.request-id')).toContainText(requestId);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.team-name')).toHaveText('Studio workspace');
});


test('@hosted selecting a budget exposes the documented coverage without invented utilization', async ({ page }) => {
  await page.goto('/budgets');
  const inspector = page.getByRole('region', { name: 'Budget scope inspector', exact: true });
  const coverage = page.getByRole('region', { name: 'Gateway budget coverage', exact: true });
  await expect(inspector).toBeHidden();
  await page.getByRole('button', { name: 'How coverage works', exact: true }).click();
  await expect(coverage.locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'member');
  await expect(coverage.locator('.credential-scope-chain')).toContainText('API key budget');
  await expect(coverage.locator('.credential-scope-chain')).toContainText('User budget');
  await expect(coverage.locator('.credential-scope-chain')).toContainText('Team budget');
  await coverage.getByRole('button', { name: 'OIDC', exact: true }).click();
  await expect(coverage.locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'oidc');
  await expect(coverage.locator('.credential-scope-chain')).toContainText('Project budget');
  await expect(coverage.locator('.credential-scope-chain')).not.toContainText('API key budget');
  await coverage.getByRole('button', { name: 'BYOK', exact: true }).click();
  await expect(coverage).toContainText('Own-credential spend is outside Gateway budgets');
  await expect(coverage).toContainText('If own credentials fail');
  await expect(coverage).toContainText('Gateway credits');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const origin = page.getByRole('button', { name: 'Inspect budget for Coding agent', exact: true });
  await origin.click();
  await expect(origin).toHaveAttribute('aria-expanded', 'true');
  await expect(inspector.locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'team');
  await expect(inspector).toContainText('API key budget');
  await expect(inspector).toContainText('Team budget');
  await expect(inspector).not.toContainText('User budget');
  await inspector.getByRole('button', { name: 'Edit budget', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Edit demo budget', exact: true });
  await editor.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true }).fill('48');
  await editor.getByRole('button', { name: 'Save demo budget', exact: true }).click();
  await expect(page.locator('.ops-budget-row')).toContainText('$48.00');
  await expect(page.locator('.ops-budget-row.is-selected .ops-selected-cap')).toContainText('$48.00');
  await expect(origin).toBeFocused();
  await page.reload();
  await expect(page.locator('.ops-budget-row')).toContainText('$48.00');
  await expect(inspector).toBeHidden();
  await expect(page.locator('.ops-ledger-footnote')).toContainText('Individual key spend is not recorded');
});

test('sentence flow opens choices in place and uses different questions for existing apps and agents', async ({ page }, testInfo) => {
  await page.goto('/connect');
  const phrase = page.locator('.se-phrase');
  await phrase.focus();
  await page.keyboard.press('Enter');
  await expect(phrase).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: testInfo.outputPath('quick-start-choices.png'), animations: 'disabled', fullPage: true });
  await page.locator('.se-decision').getByRole('button', { name: 'an existing app', exact: true }).click();
  await expect(page.locator('.se-artifact')).toContainText('Connection change');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.se-sentence')).toContainText('My app already uses');
  await phrase.click();
  await page.locator('.se-decision').getByRole('button', { name: 'Anthropic SDK', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await phrase.click();
  await page.locator('.se-decision').getByRole('button', { name: 'on another server', exact: true }).click();
  await reviewSetup(page);
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(brief).toHaveValue(/Anthropic SDK; Another platform; API key/);
  await page.locator('.se-history').getByRole('button', { name: /^Edit intent:/ }).click();
  await page.locator('.se-decision').getByRole('button', { name: 'my coding agent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect an agent', exact: true })).toBeVisible();
  await expect(page.locator('.se-artifact')).toContainText('ai-gateway setup --dry-run');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.se-sentence')).toContainText('I’ll continue in');
  await expect(page.locator('.se-history')).not.toContainText('Anthropic SDK');
  await reviewSetup(page);
  await expect(brief).toHaveValue(/ai-gateway setup --dry-run/);
  await expect(page.getByRole('tab', { name: 'Server Code', exact: true })).toHaveCount(0);
});

test('every new workspace area fits all required widths and both themes', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  for (const width of [360,390,768,1440,1920]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
    for (const theme of ['light','dark']) {
      for (const path of ['/dashboard','/budgets','/keys','/byok','/virtual-models','/settings','/models','/leaderboards','/documentation']) {
        await page.goto(path);
        await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
        await expect(page.locator('main h1')).toBeVisible();
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        const dimensions = await page.evaluate(() => ({ width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth }));
        expect.soft(dimensions.scroll, `${path} ${theme} ${width}`).toBeLessThanOrEqual(dimensions.width + 1);
        await page.screenshot({ path:testInfo.outputPath(`${path.slice(1)}-${theme}-${width}.png`), animations:'disabled', fullPage:true });
        if (['/dashboard','/budgets','/keys','/byok','/settings'].includes(path)) {
          const surface = path === '/dashboard' ? page.getByTestId('request-field') : page.locator(path === '/settings' ? '.ops-settings-layout' : '.ops-instrument');
          const bounds = await surface.boundingBox();
          expect.soft(bounds?.x, `${path} left gutter ${width}`).toBeGreaterThanOrEqual(width <= 390 ? 19 : 31);
          expect.soft(bounds ? bounds.x + bounds.width : 0, `${path} right edge ${width}`).toBeLessThanOrEqual(width - (width <= 390 ? 19 : 31));
          await page.screenshot({ path: `artifacts/visual-workspaces/${testInfo.project.name}/operations-${path.slice(1)}-${theme}-${width}.png`, animations:'disabled', fullPage:true });
        }
      }
    }
  }
});

test('@hosted a stable Virtual Model keeps its identity through routing, setup, playground and its log receipt', async ({ page }) => {
  await page.goto('/virtual-models');
  await page.getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  const form = page.locator('.mw-create-plane form');
  await form.getByRole('textbox', { name: 'Slug', exact: true }).fill('studio-support');
  await form.getByRole('combobox', { name: 'Underlying model', exact: true }).selectOption('anthropic/claude-haiku-4.5');
  await form.getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect routing', exact: true }).click();
  await expect(page).toHaveURL(/routes\?vmc=studio-support/);
  await openRouteSettings(page);
  await page.getByText('Alias and request metadata', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Virtual Model slug', exact: true })).toHaveAttribute('readonly');
  await expect(page.locator('.ew-alias')).toHaveText('vmc/studio-support');
  await expect(page.locator('.rf-model-button').first()).toContainText('Claude Haiku 4.5');
  await page.reload();
  await expect(page.locator('.ew-alias')).toHaveText('vmc/studio-support');
  await navigateWorkspace(page, 'Virtual Models');
  await page.getByRole('button', { name: 'vmc/studio-support details', exact: true }).click();
  await page.getByRole('button', { name: 'Use in Connect', exact: true }).click();
  await expect(page.locator('.ew-alias')).toHaveText('vmc/studio-support');
  await expect(page.locator('.se-context')).toContainText('vmc/studio-support');
  await reviewSetup(page);
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(brief).toHaveValue(/vmc\/studio-support/);
  await expect(brief).toHaveValue(/Requested primary model: "anthropic\/claude-haiku-4.5"/);
  await expect(brief).toHaveValue(/Do not add inline request routing overrides/);
  await navigateWorkspace(page, 'Virtual Models');
  await page.getByRole('button', { name: 'vmc/studio-support details', exact: true }).click();
  await page.getByRole('button', { name: 'Try in Playground', exact: true }).click();
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
  await expect(page.locator('.ew-alias')).toHaveText('vmc/studio-support');
  await expect(page.locator('.ew-model-picker')).toContainText('Claude Haiku 4.5');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await dialog.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(dialog.locator('.request-metadata')).toContainText('vmc/studio-support');
  await expect(dialog.locator('.request-metadata')).toContainText('anthropic/claude-haiku-4.5');
  await dialog.getByRole('button', { name: 'Back to Playground', exact: true }).click();
  await page.locator('.ew-model-picker').click();
  await page.locator('.model-catalog button').filter({ hasText: 'Claude Haiku 4.5' }).click();
  await expect(page.locator('.ew-alias')).toHaveCount(0);
});

test('a setup draft stays the working Playground route after another request and refresh', async ({ page }) => {
  await page.goto('/routes');
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Use this route in your app', exact: true }).click();
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
  await page.getByRole('button', { name: 'Try a simulated request first', exact: true }).click();
  await page.clock.runFor(10_000);
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!).requests[0].configSnapshot.order[0]);
  await expect.poll(snapshot).toBe('bedrock');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect.poll(snapshot).toBe('bedrock');
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect.poll(snapshot).toBe('bedrock');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!).active.order[0])).toBe('anthropic');
});

test('catalog details and creation preserve context through URLs, refresh and a second alias', async ({ page }) => {
  await page.goto('/models');
  await page.getByRole('button', { name: 'GPT-5.4 details', exact: true }).click();
  await expect(page).toHaveURL(/model=openai%2Fgpt-5.4/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'GPT-5.4 details', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.mw-model-more > summary').click();
  await page.getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('knowledge-agent');
  await page.locator('.mw-create-plane form').getByRole('button', { name: 'Create Virtual Model', exact: true }).click();
  await expect(page).toHaveURL(/virtual-models\?alias=knowledge-agent/);
  await expect(page.getByRole('button', { name: 'vmc/knowledge-agent details', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Inspect routing', exact: true }).click();
  await openRouteSettings(page);
  await page.getByRole('button', { name: 'Prefer this order', exact: true }).click();
  await page.getByRole('button', { name: 'Move Azure earlier', exact: true }).click();
  await navigateWorkspace(page, 'Virtual Models');
  await page.getByRole('button', { name: 'vmc/support-agent details', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect routing', exact: true }).click();
  await navigateWorkspace(page, 'Virtual Models');
  await page.getByRole('button', { name: 'vmc/knowledge-agent details', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect routing', exact: true }).click();
  await expect(page.locator('.draft-label')).toHaveText('Unsaved changes');
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('#working-route-panel-code')).toContainText('"azure",');
});
