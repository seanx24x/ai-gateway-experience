import { navigateStage, openRouteSettings, showRequestTable, openRequestConditions, closeRouteSettings } from './focused-workspace-helper';
import { expect, test, type Page } from '@playwright/test';
import type { RequestRecord, RoutingConfig } from '../src/lib/gateway';
import { chooseSetup, reviewSetup } from './setup-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

interface PersistedDemo {
  active: RoutingConfig;
  draft: RoutingConfig;
  pending: RoutingConfig | null;
  requests: RequestRecord[];
  sourceId: string | null;
  ui: { integration: string; auth: string; setupIntent: string; setupEnvironment: string };
}

async function savedState(page: Page): Promise<PersistedDemo> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('sean-gateway-demo-v2');
    if (!serialized) throw new Error('The demo state has not been persisted.');
    return JSON.parse(serialized);
  });
}

const workspace = (page: Page) => page.getByTestId('evolving-workspace');
const workingSource = (page: Page) => page.getByTestId('working-source');

async function openWorkspace(page: Page, path = '/playground') {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(workspace(page)).toBeVisible();
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
}

async function stage(page: Page, next: 'Try' | 'Shape' | 'Connect' | 'Observe') {
  await navigateStage(page, next);
  await expect(workspace(page)).toHaveAttribute('data-workspace-stage', next.toLowerCase());
}

async function runRequest(page: Page) {
  const previousCount = (await savedState(page)).requests.length;
  await workspace(page).getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect.poll(async () => (await savedState(page)).requests.length).toBe(previousCount + 1);
  return (await savedState(page)).requests[0];
}

async function recoveredSource(page: Page, prompt = '  Explain Gateway recovery for our support workload.\n') {
  await workspace(page).locator('.ew-request-editor textarea').fill(prompt);
  await openRequestConditions(page);
  await workspace(page).getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
  const receipt = await runRequest(page);
  expect(receipt.status).toBe('recovered');
  expect(receipt.attempts[0]).toMatchObject({ provider: 'anthropic', status: 'failed' });
  await stage(page, 'Shape');
  await expect(workingSource(page)).toContainText(receipt.id);
  return receipt;
}

async function compareDraft(page: Page) {
  await workspace(page).getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  const comparison = workspace(page).getByRole('region', { name: 'Controlled route comparison', exact: true });
  await expect(comparison).toBeVisible();
  const ids = await comparison.locator('.comparison-id').allTextContents();
  expect(ids).toHaveLength(2);
  const records = (await savedState(page)).requests;
  const baseline = records.find(record => record.id === ids[0]);
  const draft = records.find(record => record.id === ids[1]);
  expect(baseline).toBeDefined();
  expect(draft).toBeDefined();
  return { comparison, baseline: baseline!, draft: draft! };
}

test('@hosted one captured source survives shaping and a same-input comparison without rewriting its evidence', async ({ page }, testInfo) => {
  await openWorkspace(page);
  const source = await recoveredSource(page);
  await workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).draft.order[0]).toBe('bedrock');
  await expect(workingSource(page)).toContainText(source.id);
  await page.screenshot({ path: testInfo.outputPath('route-edit.png'), animations: 'disabled' });
  const { comparison, baseline, draft } = await compareDraft(page);
  await expect(workspace(page).getByRole('button', { name: 'Review changes', exact: true })).toHaveClass(/\bprimary\b/);
  await expect(workspace(page).getByRole('button', { name: 'Test draft', exact: true })).toHaveClass(/\bsecondary\b/);
  await page.screenshot({ path: testInfo.outputPath('controlled-comparison.png'), animations: 'disabled' });

  expect(baseline.id).not.toBe(draft.id);
  expect(baseline.sourceId).toBe(source.id);
  expect(draft.sourceId).toBe(source.id);
  expect(baseline.prompt).toBe(source.prompt);
  expect(draft.prompt).toBe(source.prompt);
  expect(baseline.auth).toBe(source.auth);
  expect(draft.auth).toBe(source.auth);
  expect(baseline.fixtureId).toBe(draft.fixtureId);
  expect(baseline.fixtureId).toBeTruthy();
  expect(baseline.configSnapshot?.order).toEqual(source.configSnapshot?.order);
  expect(draft.configSnapshot?.order[0]).toBe('bedrock');
  expect(baseline.attempts[0]).toMatchObject({ provider: 'anthropic', status: 'failed' });
  expect(draft.status).toBe('success');
  expect(draft.attempts.map(attempt => attempt.provider)).toEqual(['bedrock']);
  const original = (await savedState(page)).requests.find(record => record.id === source.id);
  expect(original).toEqual(source);
  await expect(comparison).toContainText('Simulated comparison');

  await workspace(page).getByRole('button', { name: 'Edit route', exact: true }).click();
  await workspace(page).getByRole('button', { name: 'Move Google Vertex AI earlier', exact: true }).click();
  await expect(workspace(page).getByRole('button', { name: 'Test draft', exact: true })).toHaveClass(/\bprimary\b/);
  await expect(workspace(page).getByRole('button', { name: 'Review changes', exact: true })).toHaveClass(/\bsecondary\b/);
  await expect(workspace(page).getByRole('button', { name: 'Review changes', exact: true })).toBeDisabled();
  await expect(page.locator('.ew-route-status')).toContainText('changed since this test');
  await expect(workingSource(page)).toContainText(source.id);
  await stage(page, 'Connect');
  expect((await savedState(page)).sourceId).toBe(source.id);
  await stage(page, 'Observe');
  expect((await savedState(page)).sourceId).toBe(source.id);
  expect((await savedState(page)).requests.find(record => record.id === source.id)).toEqual(source);
});

test('@hosted reviewed save and activation preserve the old source while a subsequent receipt proves the used revision', async ({ page }) => {
  await openWorkspace(page);
  const source = await recoveredSource(page);
  await workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await compareDraft(page);
  await workspace(page).getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review your route', exact: true }).getByRole('button', { name: 'Save demo revision', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).pending?.revision).toBe(source.revision + 1);
  expect((await savedState(page)).active.revision).toBe(source.revision);
  expect((await savedState(page)).requests.find(record => record.id === source.id)).toEqual(source);
  await expect(workingSource(page)).toContainText(source.id);

  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(workingSource(page)).toContainText(source.id);
  await workspace(page).getByRole('button', { name: 'Simulate activation', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).active.revision).toBe(source.revision + 1);
  await stage(page, 'Try');
  await page.clock.runFor(1000);
  const next = await runRequest(page);
  expect(next.id).not.toBe(source.id);
  expect(next.revision).toBe(source.revision + 1);
  expect(next.configSnapshot?.revision).toBe(next.revision);
  expect(next.configSnapshot?.order[0]).toBe('bedrock');
  expect((await savedState(page)).pending).toBeNull();
  expect((await savedState(page)).requests.find(record => record.id === source.id)).toEqual(source);
});

test('@hosted explicit connection choices survive stage changes, refresh, and the following request', async ({ page }) => {
  await openWorkspace(page);
  const source = await recoveredSource(page);
  await stage(page, 'Connect');
  await chooseSetup(page, 'Connecting', 'Existing app');
  await chooseSetup(page, 'Client', 'Anthropic SDK');
  await chooseSetup(page, 'Runs', 'Another platform');
  const brief = page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true });
  await expect(brief).toHaveValue(/Anthropic SDK; Another platform; API key/);
  const expectedContext = { integration: 'anthropic', auth: 'api-key', setupIntent: 'existing', setupEnvironment: 'elsewhere' };
  await expect.poll(async () => (await savedState(page)).ui).toMatchObject(expectedContext);

  await stage(page, 'Try');
  await stage(page, 'Connect');
  await reviewSetup(page);
  await expect(brief).toHaveValue(/Anthropic SDK; Another platform; API key/);
  expect((await savedState(page)).sourceId).toBe(source.id);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await stage(page, 'Connect');
  await reviewSetup(page);
  await expect(brief).toHaveValue(/Anthropic SDK; Another platform; API key/);
  expect((await savedState(page)).ui).toMatchObject(expectedContext);
  await stage(page, 'Try');
  await page.clock.runFor(1000);
  const next = await runRequest(page);
  expect(next.auth).toBe('api-key');
  expect((await savedState(page)).requests.find(record => record.id === source.id)).toEqual(source);
});

test('@hosted replay records no extra request and cancellation cannot later complete the stopped run', async ({ page }) => {
  await openWorkspace(page);
  const source = await recoveredSource(page);
  await stage(page, 'Try');
  const beforeReplay = await savedState(page);
  await workspace(page).getByText('Replay recorded attempts', { exact: true }).click();
  const replay = workspace(page).getByRole('region', { name: 'Request replay', exact: true });
  await replay.getByRole('slider', { name: 'Replay position', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(replay.getByRole('slider', { name: 'Replay position', exact: true })).toHaveValue('0');
  await replay.getByRole('button', { name: 'Play replay', exact: true }).click();
  await page.clock.runFor(10_000);
  await replay.getByRole('button', { name: 'Return to completed request', exact: true }).click();
  expect((await savedState(page)).requests).toEqual(beforeReplay.requests);

  await openRequestConditions(page);
  await workspace(page).getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).uncheck();
  await workspace(page).getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(1200);
  await workspace(page).getByRole('button', { name: 'Stop request', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).requests[0].status).toBe('cancelled');
  const cancelledState = await savedState(page);
  const cancelled = cancelledState.requests[0];
  expect(cancelled.id).not.toBe(source.id);
  expect(cancelled.usageKnown).toBe(false);
  expect(cancelled.response.length).toBeGreaterThan(0);
  expect(cancelled.observedDurationMs).toBeGreaterThan(0);
  expect(cancelledState.requests.length).toBe(beforeReplay.requests.length + 1);
  await page.clock.runFor(10_000);
  expect((await savedState(page)).requests).toEqual(cancelledState.requests);
  expect((await savedState(page)).requests.find(record => record.id === source.id)).toEqual(source);
  expect((await savedState(page)).sourceId).toBe(source.id);
});

test('@hosted Documentation carries its selected SDK into connection review', async ({ page }) => {
  await page.goto('/documentation');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.getByRole('tab', { name: 'Anthropic SDK', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare a first request', exact: true }).click();
  await expect(workspace(page)).toHaveAttribute('data-workspace-stage', 'connect');
  await reviewSetup(page);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/Anthropic SDK/);
  expect((await savedState(page)).ui.integration).toBe('anthropic');
});
