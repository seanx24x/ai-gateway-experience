import { navigateStage, openRouteSettings, closeRouteSettings, showRequestTable } from './focused-workspace-helper';
import { navigateWorkspace } from './workspace-helper';
import { chooseSetup, reviewSetup } from './setup-helper';
import { test, expect, type Locator, type Page } from '@playwright/test';

const SONNET = 'anthropic/claude-sonnet-4.6';
const GPT = 'openai/gpt-5.4';
const FIXED_TIME = new Date('2026-10-04T18:00:00Z');
const runtimeErrors = new WeakMap<Page, string[]>();
test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

async function expectMetadata(dialog: Locator, name: string, value: string | RegExp) {
  const usage = dialog.getByRole('tab', { name: 'Usage', exact: true });
  if (await usage.getAttribute('aria-selected') !== 'true') await usage.click();
  await expect(dialog.getByText(name, { exact: true }).locator('..').locator('dd')).toHaveText(value);
  await dialog.getByRole('tab', { name: 'Evidence', exact: true }).click();
}
async function metadataText(dialog: Locator, name: string) {
  await dialog.getByRole('tab', { name: 'Usage', exact: true }).click();
  const value = await dialog.getByText(name, { exact: true }).locator('..').locator('dd').innerText();
  await dialog.getByRole('tab', { name: 'Evidence', exact: true }).click();
  return value;
}
async function openWorkload(page: Page) {
  await openSettings(page);
  const details = page.locator('.workload-context');
  if (await details.getAttribute('open') === null) await details.locator('> summary').click();
}
async function openSettings(page: Page) {
  const edit = page.getByRole('button', { name: 'Edit route', exact: true });
  if (await edit.isVisible()) await edit.click();
  await openRouteSettings(page);
}
async function openSetting(page: Page, name: string) {
  await openSettings(page);
  const disclosure = page.locator('.ew-route-inspector summary').filter({ hasText: new RegExp(`^${name === 'Request metadata' ? 'Alias and request metadata' : name}$`) }).locator('..');
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('> summary').click();
}
async function openRouteCode(page: Page) {
  await closeRouteSettings(page);
  const edit = page.getByRole('button', { name: 'Edit route', exact: true });
  if (await edit.isVisible()) await edit.click();
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
}
async function openRoute(page: Page) { await closeRouteSettings(page); await page.getByRole('tab', { name: 'Route', exact: true }).click(); }
const receipt = (page: Page) => page.locator('.ew-response-receipt');
const response = (page: Page) => page.locator('.ew-response-output');
const routeCode = (page: Page) => page.locator('#working-route-panel-code:visible pre');
async function expectRouteCode(page: Page, pattern: RegExp) {
  await expect.poll(async () => (await routeCode(page).locator('.code-line > span:last-child').allTextContents()).join('\n')).toMatch(pattern);
}
async function openConditions(page: Page) {
  const conditions = page.locator('.ew-fixture details');
  if (await conditions.getAttribute('open') === null) await conditions.locator('> summary').click();
}
async function selectScenario(page: Page, scenario: string) {
  await openConditions(page);
  await page.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption(scenario);
}

async function start(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1')).toBeVisible();
  await page.clock.install({ time: FIXED_TIME });
}

async function run(page: Page, scenario = 'healthy') {
  await selectScenario(page, scenario);
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(receipt(page)).toBeVisible();
}

async function openReceiptSection(dialog: Locator, selector: string) {
  const section = dialog.locator(selector);
  if (await section.getAttribute('open') === null) await section.locator('> summary').click();
}
async function requestId(dialog: Locator) {
  await dialog.getByRole('tab', { name: 'Evidence', exact: true }).click();
  const metadata = dialog.locator('summary').filter({ hasText: /^Request metadata$/ }).locator('..');
  if (await metadata.getAttribute('open') === null) await metadata.locator('> summary').click();
  return dialog.locator('.request-id code').innerText();
}
async function inspect(page: Page) {
  await page.getByRole('button', { name: 'Inspect request' }).click();
  const dialog = page.getByRole('region', { name: 'Request details' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(7000);
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'No uncaught browser runtime errors').toEqual([]);
});

test('@hosted request identity follows success, provider recovery, model fallback, and model selection', async ({ page }) => {
  await start(page, '/playground');
  await openConditions(page);
  await page.getByRole('combobox', { name: 'Identity', exact: true }).selectOption('oidc');
  await run(page);
  let dialog = await inspect(page);
  await expectMetadata(dialog, 'Identity', 'Project OIDC');
  await expectMetadata(dialog, 'Requested model', SONNET);
  await expectMetadata(dialog, 'Served model', SONNET);
  await expect(dialog.locator('.status-badge')).toHaveText('Success');
  await page.keyboard.press('Escape');

  await openConditions(page);
  await page.getByRole('combobox', { name: 'Identity', exact: true }).selectOption('api-key');
  await run(page, 'provider-failure');
  dialog = await inspect(page);
  await expectMetadata(dialog, 'Identity', 'API key');
  await expect(dialog.locator('.status-badge')).toHaveText('Recovered');
  await expect(dialog.locator('.drawer-trace .rt-attempt--failed')).toHaveCount(1);
  await expect(dialog.locator('.drawer-trace .rt-attempt--success')).toContainText('Amazon Bedrock');
  await expectMetadata(dialog, 'Served model', SONNET);
  await page.keyboard.press('Escape');

  await run(page, 'model-fallback');
  dialog = await inspect(page);
  await expectMetadata(dialog, 'Requested model', SONNET);
  await expectMetadata(dialog, 'Served model', GPT);
  await expect(dialog.locator('.drawer-trace .rt-attempt--failed')).toHaveCount(3);
  await expect(dialog.locator('.drawer-trace .rt-attempt--success')).toContainText('OpenAI');
  await page.keyboard.press('Escape');

  await page.locator('.ew-request-editor .ew-surface-heading button').click();
  await page.locator('.model-catalog button').filter({ hasText: 'GPT-5.4' }).click();
  await expect(receipt(page)).toHaveCount(0);
  await expect(page.locator('.ew-observatory-slot:visible .ew-observatory')).toHaveAttribute('data-mode', 'preview');
  await expect(page.locator('.ew-observatory-slot:visible .rt-root')).toHaveCount(0);
  await expect(response(page)).toContainText('Your response starts here.');
  await expect(page.locator('.ew-output-state')).toHaveText('Ready');
  await run(page);
  dialog = await inspect(page);
  await expectMetadata(dialog, 'Requested model', GPT);
  await expect(dialog.locator('.drawer-trace .rt-attempt')).toHaveCount(1);
  await expect(dialog.locator('.drawer-trace .rt-root')).not.toContainText('Anthropic');
});

test('restriction, authentication, eligibility, budgets, and upstream rate limits expose truthful failures', async ({ page }) => {
  await start(page, '/playground');
  for (const scenario of ['restricted', 'invalid-key', 'expired-oidc', 'model-unavailable', 'budget', 'rate-limit']) {
    await run(page, scenario);
    await expect(receipt(page).locator('.status-badge')).toHaveText('Failed');
    const dialog = await inspect(page);
    await expect(dialog.locator('.status-badge')).toHaveText('Failed');
    await expectMetadata(dialog, 'Served model', '—');
    await expectMetadata(dialog, 'Inference cost', '$0.0000');
    await expect(dialog.locator('.drawer-trace .rt-attempt--success')).toHaveCount(0);
    if (scenario === 'restricted') {
      await expect(dialog.locator('.drawer-trace .rt-attempt--failed')).toHaveCount(1);
      await expect(dialog.locator('.drawer-trace .rt-exclusions li')).toHaveCount(4);
    } else if (scenario === 'rate-limit') {
      await expect(dialog.locator('.drawer-trace .rt-attempt--failed')).toHaveCount(5);
      await dialog.locator('.drawer-trace .rt-attempt--failed').first().click();
      await expect(dialog.locator('.drawer-trace .rt-attempt-reason')).toContainText('429');
    } else {
      await expect(dialog.locator('.drawer-trace .rt-attempt')).toHaveCount(0);
      await expect(dialog.locator('.drawer-trace .rt-empty')).toContainText('No provider attempt recorded');
    }
    if (scenario === 'invalid-key') await expectMetadata(dialog, 'Identity', 'API key');
    if (scenario === 'expired-oidc' || scenario === 'budget') await openReceiptSection(dialog, '.drawer-response');
    if (scenario === 'expired-oidc') {
      await expectMetadata(dialog, 'Identity', 'Project OIDC');
      await expect(dialog.locator('.drawer-response')).toContainText('12 hours');
    }
    if (scenario === 'budget') await expect(dialog.locator('.drawer-response')).toContainText('402');
    await page.keyboard.press('Escape');
  }
});

test('cancellation preserves partial output and treats final usage as unknown', async ({ page }) => {
  await start(page, '/playground');
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000));
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(800);
  await expect(response(page)).not.toBeEmpty();
  await expect(response(page)).not.toContainText('Waiting for the first output');
  await expect(page.getByRole('button', { name: 'Stop request', exact: true })).toBeVisible();
  const partial = await response(page).innerText();
  await page.getByRole('button', { name: 'Stop request', exact: true }).click();
  await expect(receipt(page).locator('.status-badge')).toHaveText('Cancelled');
  const preserved = await response(page).innerText();
  expect(preserved).toContain(partial);
  await expect(page.locator('.ew-response')).toContainText('Cancelled');
  const dialog = await inspect(page);
  await expect(dialog.locator('.status-badge')).toHaveText('Cancelled');
  await openReceiptSection(dialog, '.drawer-response');
  await expect(dialog.locator('.drawer-response p')).toHaveText(preserved);
  await expectMetadata(dialog, 'Inference cost', 'Unknown after cancellation');
  await expectMetadata(dialog, 'Input / output tokens', 'Unknown after cancellation');
  await page.keyboard.press('Escape');
  await navigateStage(page, 'Observe');
  await showRequestTable(page);
  await expect(page.locator('.metric-grid')).toContainText('Known inference cost');
  await expect(page.locator('.metric-grid')).toContainText('1 unknown usage');
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('cancelled');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Unknown');
});

test('recorded-hour filtering drills into six recovered requests and preserves URL filters, focus, and request identity', async ({ page }) => {
  await start(page, '/monitor');
  await showRequestTable(page);
  const recordedHours = page.getByRole('combobox', { name: 'Recorded hour', exact: true });
  const hourOptions = await recordedHours.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  await recordedHours.selectOption(hourOptions[6]);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('tbody .status-badge.recovered')).toHaveCount(6);
  await expect(page).toHaveURL(/hour=/);
  const trigger = page.locator('tbody .request-link').first();
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('region', { name: 'Request details' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.drawer-trace .rt-attempt--failed')).toHaveCount(1);
  const close = dialog.getByRole('button', { name: 'Back to Logs', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('tab', { name: 'Evidence', exact: true })).toBeFocused();
  await expect(dialog.locator('..')).toHaveAttribute('id', 'main');
  await expect(page.getByRole('dialog', { name: 'Request details', exact: true })).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Configuration', exact: true }).click();
  await expect(dialog.locator('.snapshot-details')).toContainText('Recorded demo snapshot');
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('tab', { name: 'Configuration', exact: true })).toBeFocused();
  const openedRequestId = await requestId(dialog);
  await expect(page).toHaveURL(new RegExp(`request=${openedRequestId}`));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/hour=/);
  await expect(page).not.toHaveURL(/request=/);
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('recovered');
  await page.getByRole('combobox', { name: 'Authentication', exact: true }).selectOption('api-key');
  await page.getByRole('textbox', { name: 'Search requests' }).fill('seed');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/q=seed/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Request status', exact: true })).toHaveValue('recovered');
  await expect(page.getByRole('combobox', { name: 'Authentication', exact: true })).toHaveValue('api-key');
  await expect(page.getByRole('textbox', { name: 'Search requests' })).toHaveValue('seed');
  await showRequestTable(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody .request-link').first().click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Request details' })).toBeVisible();
  const sourceId = await requestId(page.getByRole('region', { name: 'Request details' }));
  await page.getByRole('button', { name: 'Test an adjustment' }).click();
  await expect(page).toHaveURL(/\/routes(?:\?|$)/);
  await openSetting(page, 'Request metadata');
  await expect(page.getByRole('textbox', { name: 'Request tag', exact: true })).toHaveValue('feature:search');
  await expect(page.getByRole('combobox', { name: 'Primary model', exact: true })).toHaveValue(SONNET);
  await openWorkload(page);
  await expect(page.getByRole('textbox', { name: 'Workload prompt', exact: true })).toHaveValue('Suggest a useful support response for demo customer 33.');
  await expect(page.getByRole('textbox', { name: 'Workload prompt', exact: true })).toHaveAttribute('readonly', '');
  await page.reload();
  await openWorkload(page);
  await expect(page.locator('.ew-source-identity')).toContainText(sourceId);
  await openSetting(page, 'Request metadata');
  await expect(page.getByRole('textbox', { name: 'Request tag', exact: true })).toHaveValue('feature:search');
  await openRouteCode(page);
  await expectRouteCode(page, /"tags":\s*\[\s*"feature:search"\s*\]/);
});

test('@hosted a tested restricted draft saves pending, survives refresh, and activates a new request revision', async ({ page }) => {
  await start(page, '/routes');
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await expect(page.locator('.po-row').first()).toContainText('Amazon Bedrock');
  await openSetting(page, 'Provider restrictions');
  await page.locator('.provider-chips').getByRole('button', { name: 'Amazon Bedrock', exact: true }).click();
  await openSetting(page, 'Provider restrictions');
  await page.locator('.provider-chips').getByRole('button', { name: 'Anthropic', exact: true }).click();
  await openSetting(page, 'Request metadata');
  await page.getByRole('textbox', { name: 'Request tag', exact: true }).fill('feature:rehearsal');
  await openRouteCode(page);
  await expectRouteCode(page, /"only":\s*\[\s*"bedrock",\s*"anthropic"\s*\]/);
  await expect(page.locator('#working-route-panel-code:visible .code-block')).toContainText('const result = await generateText');
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(10_000);
  const records = page.locator('.rehearsal-comparison .comparison-record');
  await expect(records.nth(0).locator('.status-badge')).toHaveText('Recovered');
  await expect(records.nth(0).locator('.rt-attempt--failed')).toContainText('Anthropic');
  await expect(records.nth(1).locator('.status-badge')).toHaveText('Success');
  await expect(records.nth(1).locator('.rt-attempt--failed')).toHaveCount(0);
  await expect(records.nth(1).locator('.rt-attempt--success')).toContainText('Amazon Bedrock');
  await expect(page.locator('.rehearsal-comparison')).toContainText('Answer quality and production performance need separate evaluation.');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review your route' })).toContainText('Only: Amazon Bedrock, Anthropic');
  await page.getByRole('button', { name: 'Save demo revision', exact: true }).click();
  await expect(page.locator('.activation-banner')).toContainText('Waiting to activate');
  await page.reload();
  await expect(page.locator('.activation-banner')).toContainText('Waiting to activate');
  await page.getByRole('button', { name: 'Simulate activation', exact: true }).click();
  await expect(page.locator('.activation-banner')).toHaveCount(0);
  await navigateWorkspace(page, 'Playground');
  await run(page);
  const dialog = await inspect(page);
  await expectMetadata(dialog, 'Demo revision', 'r2');
  await expectMetadata(dialog, 'Tag', 'feature:rehearsal');
  await expect(dialog.locator('.receipt-cause')).toContainText('Amazon Bedrock');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Reset this demo?' }).getByRole('button', { name: 'Reset demo', exact: true }).click();
  await navigateWorkspace(page, 'Logs');
  await showRequestTable(page);
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.request-pagination')).toContainText('1–12 of 48 requests');
  await page.goto('/routes');
  await openSetting(page, 'Demo revisions');
  await expect(page.locator('.revision-history > div')).toHaveCount(1);
});

test('provider controls synchronize exact options and compare the same workload under fixed conditions', async ({ page }) => {
  await start(page, '/routes');
  const vertexHandle = page.getByRole('button', { name: 'Drag Google Vertex AI to reorder', exact: true });
  await vertexHandle.focus();
  await vertexHandle.press('ArrowUp');
  await expect(vertexHandle).toBeFocused();
  await expect(page.locator('.po-row').nth(1)).toContainText('Google Vertex AI');
  await openRouteCode(page);
  await expectRouteCode(page, /"order":\s*\[\s*"anthropic",\s*"vertex",\s*"bedrock"\s*\]/);
  await openRoute(page);
  await page.clock.runFor(350);
  const bedrockHandle = page.getByRole('button', { name: 'Drag Amazon Bedrock to reorder', exact: true });
  const origin = await bedrockHandle.boundingBox();
  const destination = await page.locator('.po-row').first().boundingBox();
  expect(origin).not.toBeNull();
  expect(destination).not.toBeNull();
  await page.mouse.move(origin!.x + origin!.width / 2, origin!.y + origin!.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin!.x + origin!.width / 2, destination!.y + destination!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(bedrockHandle).toBeFocused();
  await expect(page.locator('.po-row').first()).toContainText('Amazon Bedrock');
  await openRouteCode(page);
  await expectRouteCode(page, /"order":\s*\[\s*"bedrock",\s*"anthropic",\s*"vertex"\s*\]/);
  await openRoute(page);
  const prompt = 'Explain a practical gateway fallback for our support team.';
  await openWorkload(page);
  await page.getByRole('textbox', { name: 'Workload prompt', exact: true }).fill(prompt);
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByText('Full comparison', {exact:true}).click();
  const baseline = page.locator('.comparison-record').nth(0);
  const draft = page.locator('.comparison-record').nth(1);
  await expect(baseline.locator('.status-badge')).toHaveText('Recovered');
  await expect(draft.locator('.status-badge')).toHaveText('Success');
  await expect(baseline.locator('.rt-attempt--failed')).toContainText('Anthropic');
  await expect(draft.locator('.rt-attempt--failed')).toHaveCount(0);
  await expect(draft.locator('.rt-attempt--success')).toContainText('Amazon Bedrock');
  const baselineBedrock = await baseline.locator('.rt-attempt--success .rt-attempt-duration').innerText();
  await expect(draft.locator('.rt-attempt--success .rt-attempt-duration')).toHaveText(baselineBedrock);
  await baseline.getByText('Receipt', { exact: true }).click();
  await draft.getByText('Receipt', { exact: true }).click();
  const baselineId = await baseline.locator('.comparison-id').innerText();
  const draftId = await draft.locator('.comparison-id').innerText();
  expect(baselineId).toMatch(/^demo_baseline_/);
  expect(draftId).toMatch(/^demo_draft_/);
  expect(baselineId).not.toBe(draftId);
  await page.getByText('Inspect the fixed provider conditions', { exact: true }).click();
  await expect(page.locator('.fixture-provider-list > div').filter({ hasText: 'Anthropic' })).toContainText('Unavailable');
  await expect(page.locator('.fixture-provider-list > div').filter({ hasText: 'Amazon Bedrock' })).toContainText('Available');
  await page.getByRole('button', { name: 'Inspect baseline request', exact: true }).click();
  let dialog = page.getByRole('region', { name: 'Request details' });
  await openReceiptSection(dialog, '.drawer-workload');
  await expect(dialog.locator('.drawer-workload p')).toHaveText(prompt);
  const tokens = await metadataText(dialog, 'Input / output tokens');
  await openReceiptSection(dialog, '.drawer-response');
  const response = await dialog.locator('.drawer-response p').innerText();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Inspect draft request', exact: true }).click();
  dialog = page.getByRole('region', { name: 'Request details' });
  await openReceiptSection(dialog, '.drawer-workload');
  await expect(dialog.locator('.drawer-workload p')).toHaveText(prompt);
  await expectMetadata(dialog, 'Input / output tokens', tokens);
  await openReceiptSection(dialog, '.drawer-response');
  await expect(dialog.locator('.drawer-response p')).toHaveText(response);
  await page.keyboard.press('Escape');

  // The allowlist applies to the complete model chain, including the backup.
  await openRouteCode(page);
  await openSetting(page, 'Provider restrictions');
  await page.locator('.provider-chips').getByRole('button', { name: 'Anthropic', exact: true }).click();
  await expect(page.getByLabel('Model chain eligibility')).toContainText('This fallback has no allowed provider');
  await expectRouteCode(page, /"only":\s*\[\s*"anthropic"\s*\]/);
  await expect(page.locator('.draft-label')).toHaveText('Unsaved changes');
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(draft.locator('.status-badge')).toHaveText('Failed');
  await expect(draft.locator('.rt-attempt--failed')).toContainText('Anthropic');
  await expect(draft.locator('.rt-attempt--success')).toHaveCount(0);
  await expect(draft.locator('.rt-exclusions li')).toHaveCount(4);
  await openSetting(page, 'Provider restrictions');
  await page.locator('.provider-chips').getByRole('button', { name: 'OpenAI', exact: true }).click();
  await expect(page.getByLabel('Model chain eligibility')).toContainText('1 eligible providers');
  await closeRouteSettings(page);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(draft.locator('.status-badge')).toHaveText('Recovered');
  await expect(draft.locator('.comparison-model')).toContainText('GPT-5.4 via OpenAI');
  await navigateWorkspace(page, 'Logs');
  await showRequestTable(page);
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.request-pagination')).toContainText('1–12 of 54 requests');
});

test('replay seeks the observed timeline without creating requests and preserves evidence for an adjustment', async ({ page }) => {
  await start(page, '/playground');
  const prompt = '  Explain gateway routing for a small support assistant.  ';
  await page.getByRole('textbox', { name: 'Your workload', exact: true }).fill(prompt);
  await openConditions(page);
  await page.getByRole('combobox', { name: 'Identity', exact: true }).selectOption('api-key');
  await run(page, 'provider-failure');
  const requestId = await page.locator('.ew-source-identity code').innerText();
  const fullResponse = await response(page).innerText();
  const replay = page.getByRole('region', { name: 'Request replay', exact: true });
  await page.getByText('Replay recorded attempts', { exact: true }).click();
  await expect(replay).toContainText('Seeking sends no new request.');
  const instrument = page.locator('.ew-observatory-slot:visible .ew-observatory');
  await expect(instrument).toHaveAttribute('data-mode', 'receipt');
  await instrument.getByRole('button', { name: /Inspect attempt 1: Anthropic, Claude Sonnet 4\.6\./ }).click();
  await expect(instrument).toHaveAttribute('data-mode', 'replay');
  await expect(instrument.locator('.rt-attempt--failed')).toHaveCount(1);
  await expect(instrument.locator('.rt-attempt-reason')).toContainText('Simulated provider unavailable');
  await expect(response(page)).toContainText('Output has not started at this recorded position.');
  await expect(page.locator('.ew-output-state')).toHaveText('Replay');
  await expect(page.locator('.ew-source-identity code')).toHaveText(requestId);
  await replay.getByRole('button', { name: 'Return to completed request', exact: true }).click();
  await instrument.getByRole('button', { name: /Inspect attempt 2: Amazon Bedrock, Claude Sonnet 4\.6\./ }).click();
  await expect(instrument.locator('.rt-attempt--success')).toHaveCount(1);
  const firstOutput = await response(page).innerText();
  expect(firstOutput.length).toBeGreaterThan(0);
  expect(firstOutput.length).toBeLessThan(fullResponse.length);
  await replay.getByRole('slider', { name: 'Replay position', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(replay.getByRole('slider', { name: 'Replay position', exact: true })).toHaveValue('0');
  await expect(instrument.locator('.rt-attempt--failed, .rt-attempt--success')).toHaveCount(0);
  await expect(instrument.locator('.rt-attempt-reason')).toHaveCount(0);
  await expect(instrument.locator('.rt-output')).toHaveCount(0);
  await replay.getByRole('button', { name: 'Return to completed request', exact: true }).click();
  await expect(response(page)).toHaveText(fullResponse);
  await expect(instrument).toHaveAttribute('data-mode', 'receipt');
  await expect(page.locator('.ew-source-identity code')).toHaveText(requestId);
  await navigateStage(page, 'Observe');
  await showRequestTable(page);
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.request-pagination')).toContainText('1–12 of 49 requests');
  await page.getByRole('textbox', { name: 'Search requests' }).fill(requestId);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody .request-link').click();
  const dialog = page.getByRole('region', { name: 'Request details' });
  await openReceiptSection(dialog, '.drawer-workload');
  await expect(dialog.locator('.drawer-workload p')).toHaveText(prompt);
  await expectMetadata(dialog, 'Identity', 'API key');
  await page.getByRole('button', { name: 'Test an adjustment', exact: true }).click();
  await openWorkload(page);
  await expect(page.locator('.ew-source-identity')).toContainText(requestId);
  await expect(page.getByRole('textbox', { name: 'Workload prompt', exact: true })).toHaveValue(prompt);
  await expect(page.getByRole('textbox', { name: 'Workload prompt', exact: true })).toHaveAttribute('readonly', '');
  await openSetting(page, 'Request metadata');
  await page.getByRole('textbox', { name: 'Request tag', exact: true }).fill('feature:replay-review');
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.reload();
  await openWorkload(page);
  await expect(page.locator('.ew-source-identity')).toContainText(requestId);
  await expect(page.getByRole('textbox', { name: 'Workload prompt', exact: true })).toHaveValue(prompt);
  await openSetting(page, 'Request metadata');
  await expect(page.getByRole('textbox', { name: 'Request tag', exact: true })).toHaveValue('feature:replay-review');
  await openRouteCode(page);
  await expectRouteCode(page, /"order":\s*\[\s*"bedrock",\s*"anthropic",\s*"vertex"\s*\]/);
  await page.getByRole('button', { name: 'Inspect source', exact: true }).click();
  await expectMetadata(page.getByRole('region', { name: 'Request details' }), 'Tag', 'feature:support');
});



test('setup adapts client packages, authentication, endpoints, and preserved model selection', async ({ page }) => {
  await start(page, '/connect');
  await reviewSetup(page);
  if (await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
  const code = page.locator('.se-editor [role="tabpanel"]:visible pre');
  const terminal = page.locator('.se-terminal pre');
  await expect(terminal).toContainText('pnpm add ai@latest');
  await chooseSetup(page, 'Model', 'GPT-5.4');
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  await expect(code).toContainText(GPT);
  await chooseSetup(page, 'Client', 'OpenAI SDK');
  if (await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
  await expect(terminal).toContainText('openai@latest @vercel/oidc@latest');
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  await expect(code).toContainText('https://ai-gateway.vercel.sh/v1');
  await expect(code).toContainText('getVercelOidcToken()');
  await chooseSetup(page, 'Auth', 'API key');
  if (await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
  await expect(terminal).toContainText('AI_GATEWAY_API_KEY');
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  await expect(code).toContainText('process.env.AI_GATEWAY_API_KEY');
  await expect(code).not.toContainText('getVercelOidcToken');
  await chooseSetup(page, 'Client', 'Anthropic SDK');
  if (await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
  await expect(terminal).toContainText('@anthropic-ai/sdk@latest');
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  await expect(code).toContainText("baseURL: 'https://ai-gateway.vercel.sh'");
  await expect(code).not.toContainText("baseURL: 'https://ai-gateway.vercel.sh/v1'");
  await chooseSetup(page, 'Connecting', 'Coding agent');
  if (await page.locator('.se-terminal').getAttribute('open') === null) await page.locator('.se-terminal > summary').click();
  await expect(terminal).toContainText('npx vercel@latest ai-gateway setup --dry-run');
  await page.getByRole('tab', { name: 'Agent Brief', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/key budget/);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(new RegExp(GPT));
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/does not verify a real connection/);
});

test('clipboard rejection offers a manual recovery without reporting false success', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Clipboard denied in test')) },
    });
  });
  await start(page, '/connect');
  await reviewSetup(page);
  await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
  await expect(page.locator('.se-handoff-status')).toContainText('Clipboard unavailable');
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0);
  const prompt = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(prompt).toBeFocused();
  const selected = await prompt.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart);
  expect(selected).toBe((await prompt.inputValue()).length);
});

test('all five surfaces fit five screen widths in both themes with first-viewport actions', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
  for (const width of [360, 390, 768, 1440, 1920]) {
    const height = width === 360 ? 800 : width === 390 ? 844 : 1000;
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) {
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const path of ['/', '/connect', '/playground', '/routes', '/monitor']) {
        await page.goto(path);
        await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
        await expect(page.locator('main h1')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        expect.soft(dimensions.scroll, `${path} in ${theme} at ${width}px should not overflow the document`).toBeLessThanOrEqual(dimensions.width + 1);
        if (['/', '/connect', '/playground', '/routes'].includes(path)) {
          const label = path === '/' ? 'Run a demo request' : path === '/connect' ? 'Continue' : path === '/routes' ? 'Test draft' : 'Run request';
          const button = await page.getByRole('button', { name: label, exact: true }).boundingBox();
          expect(button, 'Run control exists in the first viewport').not.toBeNull();
          expect(button!.y).toBeGreaterThanOrEqual(0);
          expect.soft(button!.y + button!.height, `Run control in ${theme} at ${width}px`).toBeLessThanOrEqual(height);
        }
        await page.screenshot({ path: testInfo.outputPath(`${path === '/' ? 'overview' : path.slice(1)}-${theme}-${width}.png`), animations: 'disabled', fullPage: true });
      }
    }
  }
});

test('reduced motion retains request meaning with animations disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page, '/playground');
  await run(page, 'provider-failure');
  await expect(page.locator('.ew-observatory-slot:visible .rt-attempt--failed')).toContainText('Failed before output');
  const dialog = await inspect(page);
  await dialog.locator('.drawer-trace .rt-attempt--failed').click();
  await expect(dialog.locator('.drawer-trace .rt-attempt-reason')).toContainText('Simulated provider unavailable');
  await page.keyboard.press('Escape');
  const animationNames = await page.locator('.ew-response-receipt, .rt-attempt, .rt-track').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
  expect(animationNames.length).toBeGreaterThan(0);
  expect(animationNames.every(name => name === 'none')).toBe(true);
  await expect(receipt(page).locator('.status-badge')).toHaveText('Recovered');
});
