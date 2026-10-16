import { openRouteSettings, closeRouteSettings, showRequestTable } from './focused-workspace-helper';
import { navigateWorkspace } from './workspace-helper';
import { reviewSetup } from './setup-helper';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

test.beforeEach(({ page }) => { page.setDefaultTimeout(7000); });

test('browser history closes mobile route settings before returning to Playground', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/playground');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await navigateWorkspace(page, 'Routing');
  await openRouteSettings(page);
  const context = page.getByRole('region', { name: 'Route settings', exact: true });
  await expect(context).toBeVisible();
  await page.goBack();
  await expect(page.locator('main h1')).toHaveText('Playground');
  await expect(context).not.toBeVisible();
  await expect(page.getByTestId('evolving-workspace')).toHaveAttribute('data-inspector-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Run request', exact: true })).toBeEnabled();
});

async function selectScenario(page: Page, scenario: string) {
  const conditions = page.locator('.ew-fixture details');
  if (await conditions.getAttribute('open') === null) await conditions.locator('> summary').click();
  await page.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption(scenario);
}

async function start(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1')).toBeVisible();
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
}

test('@hosted editable setup drafts reach the intended editor and clipboard without a connection claim', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { document.documentElement.dataset.clipboardTest = text; return Promise.resolve(); } },
    });
  });
  await start(page, '/connect');
  await reviewSetup(page);
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  const edited = `${await brief.inputValue()}\n\nKeep the support interface compact. Literal characters: & + # ? / “quoted”.`;
  await brief.fill(edited);
  await expect(page.getByRole('button', { name: 'Open in Cursor', exact: true })).toBeVisible();
  const cursorHref = await page.locator('.se-handoff-actions a').getAttribute('href');
  await page.getByRole('group', { name: 'Handoff editor', exact: true }).getByRole('button', { name: 'VS Code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open in VS Code', exact: true })).toBeVisible();
  const vscodeHref = await page.locator('.se-handoff-actions a').getAttribute('href');
  const cursor = new URL(cursorHref!);
  const vscode = new URL(vscodeHref!);
  expect(cursor.origin + cursor.pathname).toBe('https://cursor.com/link/prompt');
  expect(cursor.searchParams.get('text')).toBe(edited);
  expect(vscode.protocol).toBe('vscode:');
  expect(vscode.hostname + vscode.pathname).toBe('agents/new');
  expect(vscode.searchParams.get('prompt')).toBe(edited);
  await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-clipboard-test', edited);
  await expect(page.locator('.se-handoff-status')).toContainText('draft for review');
  await expect(page.getByRole('textbox', { name: /key|credential/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset Brief', exact: true }).click();
  await expect(brief).not.toHaveValue(edited);
  await expect(brief).toHaveValue(/Do not silently create keys, deploy, or make billable requests/);
});

test('request pagination preserves identities and returns filters to the first relevant page', async ({ page }) => {
  await start(page, '/monitor');
  await showRequestTable(page);
  const pagination = page.locator('.request-pagination');
  await expect(pagination).toContainText('1–12 of 48 requests');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  const firstIds = await page.locator('tbody .request-link').evaluateAll(buttons => buttons.map(button => button.getAttribute('title')));
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pagination).toContainText('13–24 of 48 requests');
  const secondIds = await page.locator('tbody .request-link').evaluateAll(buttons => buttons.map(button => button.getAttribute('title')));
  expect(firstIds.filter(id => secondIds.includes(id))).toEqual([]);
  await pagination.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(pagination).toContainText('1–12 of 48 requests');
  expect(await page.locator('tbody .request-link').evaluateAll(buttons => buttons.map(button => button.getAttribute('title')))).toEqual(firstIds);
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('recovered');
  await expect(pagination).toContainText('1–6 of 6 requests');
  await expect(pagination.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(pagination.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(page.locator('tbody .status-badge.recovered')).toHaveCount(6);
  await page.getByRole('textbox', { name: 'Search requests', exact: true }).fill('not-a-demo-request');
  await expect(pagination).toContainText('0 requests');
  await expect(page.locator('.table-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(pagination).toContainText('1–12 of 48 requests');
});

test('@hosted an unsaved route reaches the setup brief and server code without becoming an active policy', async ({ page }) => {
  await start(page, '/routes');
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Use this route in your app', exact: true }).click();
  await expect(page).toHaveURL(/\/connect/);
  await reviewSetup(page);
  await expect(page.locator('main h1').locator('..')).toContainText('Prepared from your route draft');
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(brief).toHaveValue(/"order": \[\s*"bedrock",\s*"anthropic",\s*"vertex"/);
  await expect(brief).toHaveValue(/not a saved Virtual Model or an activated production revision/);
  await page.reload();
  await expect(brief).toHaveValue(/"order": \[\s*"bedrock",\s*"anthropic",\s*"vertex"/);
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  await expect(page.locator('.se-editor [role="tabpanel"]:visible pre')).toContainText('"bedrock",');
  await page.getByRole('button', { name: 'Use active route instead', exact: true }).click();
  await page.getByRole('tab', { name: 'Agent Brief', exact: true }).click();
  await expect(brief).toHaveValue(/"order": \[\s*"anthropic",\s*"bedrock",\s*"vertex"/);
  await page.goto('/routes');
  await openRouteSettings(page);
  await expect(page.locator('.ew-route-inspector .revision-pill')).toHaveText('r1 active');
});

test('@hosted direct request actions and contextual route guidance preserve evidence through activation and verification', async ({ page }) => {
  await start(page, '/playground?tour=1');
  const guidance = page.locator('.ew-route-status');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Test recovery', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(dialog.locator('.status-badge')).toHaveText('Recovered');
  await dialog.getByText('Request metadata', { exact: true }).click();
  const sourceId = await dialog.locator('.request-id code').innerText();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Shape this route', exact: true }).click();
  await expect(page).toHaveURL(/\/routes/);
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await expect(guidance).toContainText('You changed the route');
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('#working-route-tab-comparison')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Same workload comparison', exact: true })).toBeVisible();
  await expect(page.locator('.ew-source-identity')).toContainText(sourceId);
  await expect(page.locator('.comparison-record').first()).toContainText('Source policy · r1');
  await expect(guidance).toContainText('You can see the consequence');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save demo revision', exact: true }).click();
  await expect(guidance).toContainText('Your revision is saved');
  const activation = page.locator('.ew-primary-action').getByRole('button', { name: 'Simulate activation', exact: true });
  await expect(activation).toBeVisible();
  const activationBounds = await activation.boundingBox();
  expect(activationBounds!.y + activationBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await activation.click();
  await page.locator('.ew-primary-action').getByRole('button', { name: 'Send a verification request', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(dialog.getByText('Demo revision', { exact: true }).locator('..').locator('dd')).toHaveText('r2');
  await dialog.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await dialog.getByText('Request metadata', { exact: true }).click();
  expect(await dialog.locator('.request-id code').innerText()).not.toBe(sourceId);
});

test('routing and request tabs support arrow navigation and keep phone settings optional', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, '/routes');
  const settings = page.getByRole('region', { name: 'Route settings', exact: true });
  await expect(settings).not.toBeVisible();
  const route = page.getByRole('tab', { name: 'Route', exact: true });
  await route.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#working-route-panel-code:visible')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(route).toBeFocused();
  await expect(route).toHaveAttribute('aria-selected', 'true');
  await openRouteSettings(page);
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('combobox', { name: 'Primary model', exact: true })).toBeVisible();
  await expect(settings.locator('.restriction-editor')).not.toHaveAttribute('open');
  await closeRouteSettings(page);
  await navigateWorkspace(page, 'Playground');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await dialog.getByRole('tab', { name: 'Evidence', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Usage', exact: true })).toBeFocused();
  await expect(dialog.locator('.request-metadata')).toContainText('Project OIDC');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Configuration', exact: true })).toBeFocused();
  await expect(dialog.locator('.snapshot-details')).toContainText('Recorded demo snapshot');
  await page.keyboard.press('Home');
  await expect(dialog.getByRole('tab', { name: 'Evidence', exact: true })).toBeFocused();
  await expect(dialog.locator('.drawer-workload > summary')).toBeVisible();
  await expect(dialog.locator('.drawer-workload')).not.toHaveAttribute('open');
  await dialog.locator('.drawer-workload > summary').click();
  await expect(dialog.locator('.drawer-workload p')).toBeVisible();
});

async function retainState(page: Page, testInfo: TestInfo, state: string) {
  await page.screenshot({ path: testInfo.outputPath(`${state}.png`), animations: 'disabled', fullPage: true });
}

test('retain inspectable success, recovery, fallback, exclusions, access, cancellation, replay, and empty eligibility states', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await start(page, '/playground');
  async function runScenario(scenario: string) {
    await selectScenario(page, scenario);
    await page.getByRole('button', { name: 'Run request', exact: true }).click();
    await page.clock.runFor(10_000);
    await expect(page.locator('.ew-response-receipt')).toBeVisible();
  }
  await runScenario('healthy');
  await expect(page.locator('.ew-response-output')).not.toBeEmpty();
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--success')).toHaveCount(1);
  await retainState(page, testInfo, 'success');
  await runScenario('provider-failure');
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--failed')).toHaveCount(1);
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--success')).toContainText('Amazon Bedrock');
  await retainState(page, testInfo, 'provider-recovery');
  await runScenario('model-fallback');
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--success')).toContainText('OpenAI');
  await expect(page.locator('.ew-observatory-slot .rt-attempt--success .rt-label-copy')).toContainText('GPT-5.4');
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--failed')).toHaveCount(3);
  await retainState(page, testInfo, 'model-fallback');
  await runScenario('restricted');
  await page.locator('.ew-observatory-slot .rt-exclusions > summary').click();
  await expect(page.locator('.ew-observatory-slot .rt-exclusions li')).toHaveCount(4);
  await retainState(page, testInfo, 'exclusions');
  await runScenario('invalid-key');
  await expect(page.locator('.ew-observatory-slot .rt-empty')).toContainText('No provider attempt recorded');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(dialog.locator('.request-guidance')).toContainText('Check the Gateway API key');
  await retainState(page, testInfo, 'authentication-failure');
  await page.keyboard.press('Escape');
  await page.clock.pauseAt(new Date('2026-10-05T18:05:00Z'));
  await selectScenario(page, 'healthy');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(800);
  await expect(page.locator('.ew-response-output')).not.toBeEmpty();
  await expect(page.locator('.ew-response-output')).not.toContainText('Waiting for the first output');
  await expect(page.getByRole('button', { name: 'Stop request', exact: true })).toBeVisible();
  const partial = await page.locator('.ew-response-output').innerText();
  await page.getByRole('button', { name: 'Stop request', exact: true }).click();
  await expect(page.locator('.ew-response-receipt .status-badge')).toHaveText('Cancelled');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(dialog.locator('.request-metadata')).toContainText('Unknown after cancellation');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ew-response-output')).toHaveText(partial);
  await retainState(page, testInfo, 'cancellation');
  await runScenario('provider-failure');
  const identity = await page.locator('.ew-source-identity code').innerText();
  await page.locator('.ew-observatory-slot:visible').getByRole('button', { name: /Inspect attempt 1: Anthropic/ }).click();
  await expect(page.locator('.ew-observatory')).toHaveAttribute('data-mode', 'replay');
  await expect(page.locator('.ew-response-output')).toContainText('Output has not started at this recorded position.');
  await expect(page.locator('.ew-output-state')).toHaveText('Replay');
  await expect(page.locator('.ew-source-identity code')).toHaveText(identity);
  await retainState(page, testInfo, 'replay-after-failed-attempt');
  await page.goto('/routes');
  await openRouteSettings(page);
  const settings = page.locator('.ew-route-inspector');
  await settings.locator('.restriction-editor > summary').click();
  await settings.locator('.provider-chips').getByRole('button', { name: 'OpenAI', exact: true }).click();
  await settings.locator('.fallback-editor > summary').click();
  await settings.getByRole('checkbox', { name: 'Enable fallback model', exact: true }).uncheck();
  await expect(page.locator('.rf-empty')).toContainText('No eligible provider for this model');
  await expect(settings.getByLabel('Model chain eligibility')).toContainText('The primary model has no allowed provider');
  await retainState(page, testInfo, 'empty-eligibility');
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  const emptyDraft = page.locator('.comparison-record').nth(1);
  await expect(emptyDraft.locator('.status-badge')).toHaveText('Failed');
  await expect(emptyDraft.locator('.rt-attempt--success')).toHaveCount(0);
});

test('720 CSS px provides reflow evidence equivalent to a 1440px viewport at 200 percent zoom', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 720, height: 500 });
  for (const [path, name] of [['/', 'home'], ['/connect', 'connect'], ['/playground', 'playground'], ['/routes', 'routing'], ['/monitor', 'monitor']] as const) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(widths.content, `${name}: reflow at 720 CSS px`).toBeLessThanOrEqual(widths.viewport + 1);
    if (path === '/') await expect(page.getByRole('button', { name: 'Run a demo request', exact: true })).toBeVisible();
    if (path === '/playground') await expect(page.getByRole('button', { name: 'Run request', exact: true })).toBeVisible();
    if (path === '/routes') await expect(page.getByRole('button', { name: 'Test draft', exact: true })).toBeVisible();
    await retainState(page, testInfo, `zoom-equivalent-720css-${name}`);
  }
});

test.describe('coarse pointer direct provider controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('provider selection and reorder controls expose 44px targets and accept emulated taps', async ({ page }, testInfo) => {
    await start(page, '/routes');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const controls = page.locator('.ew-route-slot:visible .rf-provider-button:not(.rf-provider-button--static), .ew-route-slot:visible .po-handle, .ew-route-slot:visible .po-arrow, .ew-route-slot:visible .rf-add-preference');
    const targets = await controls.evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('aria-label'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
    expect(targets.length).toBeGreaterThan(3);
    for (const target of targets) {
      expect(target.width, `${target.label}: target width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label}: target height`).toBeGreaterThanOrEqual(44);
    }
    const bedrockEarlier = page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true });
    await bedrockEarlier.scrollIntoViewIfNeeded();
    const arrow = await bedrockEarlier.boundingBox();
    await page.touchscreen.tap(arrow!.x + arrow!.width / 2, arrow!.y + arrow!.height / 2);
    await expect(page.locator('.po-row').first()).toContainText('Amazon Bedrock');
    const provider = page.locator('.ew-route-slot:visible').getByRole('button', { name: /^Inspect Amazon Bedrock for Claude Sonnet 4\.6/ });
    await provider.scrollIntoViewIfNeeded();
    const row = await provider.boundingBox();
    await page.touchscreen.tap(row!.x + row!.width / 2, row!.y + row!.height / 2);
    await expect(page.getByRole('region', { name: 'Route settings', exact: true })).toBeVisible();
    await expect(page.locator('.ew-route-inspector h2')).toHaveText('Amazon Bedrock');
    await retainState(page, testInfo, 'coarse-pointer-provider-inspector');
  });
});
