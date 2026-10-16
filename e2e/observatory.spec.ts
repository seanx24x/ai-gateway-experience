import { navigateStage, openRouteSettings, showRequestTable, openRequestConditions, closeRouteSettings } from './focused-workspace-helper';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { RequestRecord } from '../src/lib/gateway';
import { getAttemptSpans, getReplayDuration } from '../src/lib/replay';
import { projectRequestField, type RequestFieldPoint, type RequestFieldScale } from '../src/lib/request-field';
import { reviewSetup } from './setup-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

const FIXED_TIME = new Date('2026-10-05T18:00:00Z');
const GPT = 'openai/gpt-5.4';
const workspace = (page: Page) => page.getByTestId('evolving-workspace');
const observatory = (page: Page) => workspace(page).locator('.ew-observatory-slot .rt-root');
const inferenceRequests = new WeakMap<Page, string[]>();

async function receipts(page: Page): Promise<RequestRecord[]> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('sean-gateway-demo-v2');
    if (!serialized) throw new Error('The simulated workspace has not been persisted.');
    return JSON.parse(serialized).requests;
  });
}

async function openWorkspace(page: Page, path = '/playground') {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(workspace(page)).toBeVisible();
  await page.clock.install({ time: FIXED_TIME });
  // Keep evidence fixed while assertions and user interactions are evaluated.
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000));
}

async function stage(page: Page, next: 'Try' | 'Shape' | 'Connect' | 'Observe') {
  await navigateStage(page, next);
  await expect(workspace(page)).toHaveAttribute('data-workspace-stage', next.toLowerCase());
}

async function startRecovery(page: Page) {
  await openRequestConditions(page);
  await workspace(page).getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
  await workspace(page).getByRole('button', { name: 'Run request', exact: true }).click();
}

async function finishRequest(page: Page, previousCount: number) {
  await page.clock.runFor(10_000);
  await expect.poll(async () => (await receipts(page)).length).toBe(previousCount + 1);
  const record = (await receipts(page))[0];
  await expect(observatory(page)).toHaveAttribute('data-request-id', record.id);
  return record;
}

async function expectInterval(lane: Locator, start: number, end: number, axis: number) {
  const geometry = await lane.evaluate(element => {
    const track = element.querySelector<HTMLElement>('.rt-track');
    const bar = element.querySelector<HTMLElement>('.rt-bar');
    if (!track || !bar) throw new Error('An observed interval has no elapsed-time track.');
    const trackBounds = track.getBoundingClientRect();
    const barBounds = bar.getBoundingClientRect();
    return {
      leftPercent: Number.parseFloat(bar.style.left),
      widthPercent: Number.parseFloat(bar.style.width),
      leftPx: barBounds.left - trackBounds.left,
      widthPx: barBounds.width,
      trackWidth: track.clientWidth,
    };
  });
  const expectedLeft = start / axis * 100;
  const expectedWidth = (end - start) / axis * 100;
  // CSSOM serializes percentages to about six significant digits. Keep pixel
  // bounds strict while allowing that browser serialization rounding.
  expect(geometry.leftPercent).toBeCloseTo(expectedLeft, 4);
  expect(geometry.widthPercent).toBeCloseTo(expectedWidth, 4);
  expect(Math.abs(geometry.leftPx - start / axis * geometry.trackWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.widthPx - (end - start) / axis * geometry.trackWidth)).toBeLessThanOrEqual(1);
  return geometry;
}

async function expectReceiptIntervals(timeline: Locator, record: RequestRecord) {
  await expect(timeline).toHaveAttribute('data-request-id', record.id);
  const axis = Number(await timeline.getAttribute('data-axis-ms'));
  expect(axis).toBeGreaterThanOrEqual(getReplayDuration(record));
  const sent = getAttemptSpans(record).filter(span => record.attempts[span.index].status !== 'excluded');
  await expect(timeline.locator('.rt-attempt')).toHaveCount(sent.length);
  for (const span of sent) {
    const lane = timeline.locator(`.rt-attempt[data-attempt-index="${span.index}"]`);
    await expect(lane).toHaveClass(new RegExp(`\\brt-attempt--${record.attempts[span.index].status}\\b`));
    await expectInterval(lane, span.start, span.end, axis);
  }
  const output = timeline.locator('.rt-output');
  await expect(output).toHaveCount(record.ttftMs > 0 && record.response ? 1 : 0);
  if (record.ttftMs > 0 && record.response) await expectInterval(output, record.ttftMs, getReplayDuration(record), axis);
  return axis;
}

async function recoveredSpike(page: Page): Promise<RequestFieldPoint> {
  const scale = await page.getByTestId('request-field').getAttribute('data-horizontal-scale') as RequestFieldScale;
  const points = projectRequestField(await receipts(page), scale).points;
  const spike = points.filter(point => point.record.status === 'recovered' && point.x > 0 && point.x < 1)
    .sort((a, b) => b.record.ttftMs - a.record.ttftMs)[0];
  expect(spike, 'The recorded demo data contains a recovered latency spike').toBeDefined();
  return spike;
}

async function spikeCoordinates(page: Page, spike: RequestFieldPoint) {
  const plot = page.getByTestId('request-field-plot');
  await plot.scrollIntoViewIfNeeded();
  const bounds = await plot.boundingBox();
  if (!bounds) throw new Error('The recorded request field is not rendered.');
  return { x: bounds.x + bounds.width * spike.x, y: bounds.y + bounds.height * spike.y };
}

async function expectExactDrawer(page: Page, record: RequestRecord) {
  const drawer = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(drawer).toBeVisible();
  await drawer.locator('.receipt-disclosure').filter({ has: page.getByText('Request metadata', { exact: true }) }).locator('summary').click();
  await expect(drawer.locator('.request-id code')).toHaveText(record.id);
  await expect(drawer.locator('.drawer-trace .rt-root')).toHaveAttribute('data-request-id', record.id);
  return drawer;
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(7000);
  const outbound: string[] = [];
  inferenceRequests.set(page, outbound);
  page.on('request', request => {
    if (new URL(request.url()).hostname === 'ai-gateway.vercel.sh') outbound.push(request.url());
  });
});

test.afterEach(async ({ page }) => {
  expect(inferenceRequests.get(page), 'Observatory and setup interactions make no external inference requests').toEqual([]);
});

test('@hosted live observation at 200 ms contains only the active attempt and withholds future outcomes', async ({ page }) => {
  await openWorkspace(page);
  const previousCount = (await receipts(page)).length;
  await startRecovery(page);
  await page.clock.runFor(200);
  const timeline = observatory(page);
  await expect(timeline).toHaveAttribute('data-position-ms', '200');
  await expect(timeline.locator('.rt-current')).toHaveText('200 ms elapsed');
  await expect(timeline.locator('.rt-attempt')).toHaveCount(1);
  await expect(timeline.locator('.rt-attempt--active')).toHaveCount(1);
  await expect(timeline.locator('.rt-attempt--failed, .rt-attempt--success, .rt-output, .rt-outcome')).toHaveCount(0);
  await expect(timeline).not.toContainText('Amazon Bedrock');
  await timeline.locator('.rt-attempt--active').click();
  await expect(timeline.locator('.rt-attempt-reason')).toHaveText('The attempt is still being observed. Its outcome is not yet available.');
  const observedText = await timeline.innerText();
  const record = await finishRequest(page, previousCount);
  expect(record.status).toBe('recovered');
  expect(record.attempts[0].status).toBe('failed');
  expect(observedText).not.toContain(record.attempts[0].reason);
  expect(observedText).not.toMatch(/Response complete|total elapsed time|total\b/);
  expect((await receipts(page)).filter(receipt => receipt.id === record.id)).toHaveLength(1);
});

test('@hosted recovered attempts and output generation occupy their recorded elapsed-time intervals', async ({ page }) => {
  await openWorkspace(page);
  const previousCount = (await receipts(page)).length;
  await startRecovery(page);
  const record = await finishRequest(page, previousCount);
  expect(record.status).toBe('recovered');
  expect(record.attempts.map(attempt => attempt.status)).toEqual(['failed', 'success']);
  const timeline = observatory(page);
  await expectReceiptIntervals(timeline, record);
  await expect(timeline).toHaveAttribute('data-position-ms', String(getReplayDuration(record)));
  await expect(workspace(page).locator('.ew-response-receipt')).toContainText('Recovered');
  await expect(timeline.locator('.rt-outcome')).toHaveCount(0);
  const failureIndex = record.attempts.findIndex(attempt => attempt.status === 'failed');
  await timeline.locator(`.rt-attempt[data-attempt-index="${failureIndex}"]`).click();
  // Selecting completed evidence seeks the receipt to this observed outcome.
  await expect(timeline.locator('.rt-attempt-reason')).toHaveText(record.attempts[failureIndex].reason);
  await expect(timeline.locator('.rt-attempt--success, .rt-output, .rt-outcome')).toHaveCount(0);
  expect((await receipts(page)).find(receipt => receipt.id === record.id)).toEqual(record);
});

test('@hosted baseline and draft share one scale while identical provider durations retain identical bar widths', async ({ page }) => {
  await openWorkspace(page);
  const previousCount = (await receipts(page)).length;
  await startRecovery(page);
  await finishRequest(page, previousCount);
  await stage(page, 'Shape');
  await workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await workspace(page).getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  const comparison = workspace(page).getByRole('region', { name: 'Controlled route comparison', exact: true });
  await expect(comparison).toBeVisible();
  await comparison.getByText('Full comparison', {exact:true}).click();
  const timelines = comparison.locator('.rt-root');
  await expect(timelines).toHaveCount(2);
  const records = await receipts(page);
  const ids = await timelines.evaluateAll(elements => elements.map(element => element.getAttribute('data-request-id')));
  const baseline = records.find(record => record.id === ids[0]);
  const draft = records.find(record => record.id === ids[1]);
  expect(baseline).toBeDefined();
  expect(draft).toBeDefined();
  const axis = Math.max(getReplayDuration(baseline!), getReplayDuration(draft!));
  for (const timeline of [timelines.nth(0), timelines.nth(1)]) await expect(timeline).toHaveAttribute('data-axis-ms', String(axis));
  await expectReceiptIntervals(timelines.nth(0), baseline!);
  await expectReceiptIntervals(timelines.nth(1), draft!);
  expect(baseline!.fixtureId).toBe(draft!.fixtureId);
  const baselineIndex = baseline!.attempts.findIndex(attempt => attempt.provider === 'bedrock' && attempt.status === 'success');
  const draftIndex = draft!.attempts.findIndex(attempt => attempt.provider === 'bedrock' && attempt.status === 'success');
  expect(baselineIndex).toBeGreaterThanOrEqual(0);
  expect(draftIndex).toBeGreaterThanOrEqual(0);
  expect(baseline!.attempts[baselineIndex].latencyMs).toBe(draft!.attempts[draftIndex].latencyMs);
  const baselineSpan = getAttemptSpans(baseline!)[baselineIndex];
  const draftSpan = getAttemptSpans(draft!)[draftIndex];
  const baselineBar = await expectInterval(timelines.nth(0).locator(`.rt-attempt[data-attempt-index="${baselineIndex}"]`), baselineSpan.start, baselineSpan.end, axis);
  const draftBar = await expectInterval(timelines.nth(1).locator(`.rt-attempt[data-attempt-index="${draftIndex}"]`), draftSpan.start, draftSpan.end, axis);
  expect(baselineBar.widthPercent).toBeCloseTo(draftBar.widthPercent, 6);
  expect(Math.abs(baselineBar.trackWidth - draftBar.trackWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(baselineBar.widthPx - draftBar.widthPx)).toBeLessThanOrEqual(1);
  expect(baselineBar.leftPercent).toBeGreaterThan(draftBar.leftPercent);
});

test('@hosted request-field keyboard and pointer exploration open the exact previewed receipt', async ({ page }) => {
  await openWorkspace(page, '/monitor');
  const points = projectRequestField(await receipts(page)).points;
  expect(points.length).toBeGreaterThan(1);
  const plot = page.getByTestId('request-field-plot');
  const previewId = page.getByTestId('request-field-preview').locator('.rqf-preview-top code');
  await plot.focus();
  await page.keyboard.press('Home');
  await expect(previewId).toHaveText(points[0].record.id);
  await page.keyboard.press('ArrowRight');
  await expect(previewId).toHaveText(points[1].record.id);
  await expect(plot).toBeFocused();
  await page.keyboard.press('Enter');
  await page.clock.runFor(40);
  await expectExactDrawer(page, points[1].record);
  await page.keyboard.press('Escape');
  await page.clock.runFor(40);
  await expect(plot).toBeFocused();
  const spike = await recoveredSpike(page);
  const coordinates = await spikeCoordinates(page, spike);
  await page.mouse.move(coordinates.x, coordinates.y);
  await expect(previewId).toHaveText(spike.record.id);
  await page.mouse.click(coordinates.x, coordinates.y);
  await page.clock.runFor(40);
  const drawer = await expectExactDrawer(page, spike.record);
  await expectReceiptIntervals(drawer.locator('.rt-root'), spike.record);
});

test('@hosted editing the new-app model updates both review artifacts and restores trigger focus', async ({ page }) => {
  await openWorkspace(page, '/connect');
  const previousCount = (await receipts(page)).length;
  const setup = page.locator('.setup-experience:visible');
  await expect(setup).toHaveAttribute('data-setup-stage', 'intent');
  const originalToken = setup.getByRole('button', { name: /^Model / });
  await originalToken.click();
  await page.clock.runFor(40);
  const choices = setup.getByRole('region', { name: 'Choose your starting model', exact: true });
  await expect(choices).toBeVisible();
  await page.keyboard.press('Escape');
  await page.clock.runFor(40);
  await expect(choices).toHaveCount(0);
  await expect(originalToken).toBeFocused();
  await originalToken.click();
  await page.clock.runFor(40);
  await choices.getByRole('button', { name: /^GPT-5\.4(?:$|\s)/ }).click();
  await page.clock.runFor(40);
  const updatedToken = setup.getByRole('button', { name: 'Model GPT-5.4', exact: true });
  await expect(updatedToken).toContainText('GPT-5.4');
  await expect(updatedToken).toBeFocused();
  await expect(setup.getByLabel('Selected server connection excerpt', { exact: true })).toContainText(`model: ${JSON.stringify(GPT)}`);
  await reviewSetup(page);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(new RegExp(GPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await page.getByRole('tab', { name: 'Server Code', exact: true }).click();
  const serverCode = setup.locator('[role="tabpanel"]:visible pre');
  await expect(serverCode).toContainText(`model: ${JSON.stringify(GPT)}`);
  expect((await receipts(page)).length).toBe(previousCount);
  await expect(setup.locator('.se-handoff-status')).toContainText('A handoff does not verify a connection.');
});

test.describe('Coarse touch observatory access', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('@hosted tapping a recorded spike opens its evidence and every observed attempt remains a 44px target', async ({ page }) => {
    await openWorkspace(page, '/monitor');
    const spike = await recoveredSpike(page);
    const coordinates = await spikeCoordinates(page, spike);
    await page.touchscreen.tap(coordinates.x, coordinates.y);
    await page.clock.runFor(40);
    const drawer = await expectExactDrawer(page, spike.record);
    const timeline = drawer.locator('.rt-root');
    const attempts = timeline.locator('.rt-attempt');
    await expect(attempts).toHaveCount(spike.record.attempts.filter(attempt => attempt.status !== 'excluded').length);
    for (const attempt of await attempts.all()) {
      await attempt.scrollIntoViewIfNeeded();
      const bounds = await attempt.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    const failedIndex = spike.record.attempts.findIndex(attempt => attempt.status === 'failed');
    await timeline.locator(`.rt-attempt[data-attempt-index="${failedIndex}"]`).tap();
    await expect(timeline.locator('.rt-attempt-reason')).toHaveText(spike.record.attempts[failedIndex].reason);
    await expect(timeline.locator(`.rt-attempt[data-attempt-index="${failedIndex}"]`)).toHaveAttribute('aria-pressed', 'true');
  });
});
