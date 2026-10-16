import { test, expect, type Page } from '@playwright/test';
import type { RequestRecord, RoutingConfig } from '../src/lib/gateway';
import { showRequestTable } from './focused-workspace-helper';
import { reviewSetup } from './setup-helper';

const normalKey = 'sean-gateway-demo-v2';
const reviewKey = 'sean-gateway-review-v1';
type Chapter = 'understand' | 'trust' | 'control' | 'adopt' | 'operate';
type ReviewState = {
  draft: RoutingConfig;
  ui: { handoffConfig: RoutingConfig | null };
  requests: RequestRecord[];
  sourceId: string | null;
  reviewer: {
    progress: { chapter: Chapter; visited: Chapter[]; demonstrated: Chapter[]; skipped: Chapter[]; finished: boolean };
    preparedChapter: Chapter | null;
    resumePath: string;
    comparison?: { baselineId: string; draftId: string; testedDraft: string | null };
  };
};

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
}
async function reviewState(page: Page): Promise<ReviewState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reviewKey);
}
async function demonstrated(page: Page, chapter: Chapter) {
  await expect.poll(async () => (await reviewState(page)).reviewer.progress.demonstrated).toContain(chapter);
}
async function start(page: Page) {
  await ready(page, '/review');
  await page.getByRole('button', { name: 'Start the walkthrough', exact: true }).click();
  await expect(page).toHaveURL(/review=understand/);
}
async function runFirstRequest(page: Page) {
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.clock.runFor(10000);
  await demonstrated(page, 'understand');
}
async function completeTrust(page: Page) {
  await page.getByRole('button', { name: /^Continue to / }).click();
  await expect(page).toHaveURL(/review=trust/);
  await page.getByRole('button', { name: 'What if a provider fails?', exact: true }).click();
  await page.clock.runFor(10000);
  expect((await reviewState(page)).reviewer.progress.demonstrated).not.toContain('trust');
  const record = (await reviewState(page)).requests[0];
  expect(record.status).toBe('recovered');
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Request details', exact: true }).locator('[data-request-identity]')).toHaveAttribute('data-request-identity', record.id);
  await demonstrated(page, 'trust');
  await page.keyboard.press('Escape');
  return record;
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = [];
  errors.set(page, captured);
  page.on('pageerror', error => captured.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'No uncaught browser runtime errors').toEqual([]);
});

test('@hosted reviewer milestones follow demonstrated behavior and retain exact source through comparison', async ({ page }) => {
  await start(page);
  await page.clock.install();
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await runFirstRequest(page);
  await expect(page.getByTestId('reviewer-reflection')).toHaveAttribute('data-demonstrated', 'true');
  const source = await completeTrust(page);
  await page.getByRole('button', { name: /^Continue to / }).click();
  await expect(page).toHaveURL(/\/routes\?.*review=control/);
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  const count = (await reviewState(page)).requests.length;
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  expect((await reviewState(page)).requests).toHaveLength(count);
  expect((await reviewState(page)).reviewer.progress.demonstrated).not.toContain('control');
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await demonstrated(page, 'control');
  const state = await reviewState(page);
  const [draft, baseline] = state.requests;
  expect(draft.fixtureId).toBe(baseline.fixtureId);
  expect(draft.prompt).toBe(source.prompt);
  expect(draft.sourceId).toBe(source.id);
  expect(state.requests.find(record => record.id === source.id)).toEqual(source);
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await page.clock.runFor(50);
  await expect(page).toHaveURL(url => url.pathname === '/review' && url.hash === '#chapters');
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Comparison', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.comparison-difference')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Comparison', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.comparison-difference')).toBeVisible();
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual(expect.arrayContaining(['understand', 'trust', 'control']));
  expect((await reviewState(page)).requests.find(record => record.id === source.id)).toEqual(source);
  // Reopening the map creates a new app instance whose initial view is Home.
  // The persisted draft must still win over its active/playground configuration.
  await ready(page, '/review');
  await page.getByRole('button', { name: 'Explore Adopt', exact: true }).click();
  await expect(page).toHaveURL(/review=adopt/);
  expect((await reviewState(page)).ui.handoffConfig).toEqual(state.draft);
  expect((await reviewState(page)).sourceId).toBe(source.id);
  expect((await reviewState(page)).reviewer.progress.demonstrated).not.toContain('adopt');
  await reviewSetup(page);
  await expect(page.getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toHaveValue(/anthropic\/claude-sonnet-4\.6/);
  await demonstrated(page, 'adopt');
  await expect(page.getByRole('region', { name: 'Verify in your own environment', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to operate', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?.*review=operate/);
  expect((await reviewState(page)).reviewer.progress.demonstrated).not.toContain('operate');
  const plot = page.getByTestId('request-field-plot');
  const point = page.locator(`[data-point-request="${source.id}"]`);
  const plotBox = (await plot.boundingBox())!;
  const pointBox = (await point.boundingBox())!;
  await plot.click({ position: { x: pointBox.x + pointBox.width / 2 - plotBox.x, y: pointBox.y + pointBox.height / 2 - plotBox.y } });
  const receipt = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', source.id);
  await demonstrated(page, 'operate');
  await receipt.getByRole('button', { name: 'View this request in Monitoring', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/monitor' && url.searchParams.get('q') === source.id && url.searchParams.get('review') === 'operate');
  await page.getByRole('button', { name: `Inspect ${source.id}`, exact: true }).click();
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', source.id);
  await page.getByRole('button', { name: 'Reflect on the journey', exact: true }).click();
  await expect(page.getByTestId('reviewer-ending')).toContainText('5 of 5 behaviors demonstrated');
  await expect(page.getByRole('region', { name: 'What I would validate next', exact: true })).toBeVisible();
  expect((await reviewState(page)).reviewer.progress).toMatchObject({ demonstrated: ['understand', 'trust', 'control', 'adopt', 'operate'], skipped: [], finished: true });
});

test('cancelling a first request preserves its receipt without claiming the introduction was demonstrated', async ({ page }) => {
  await start(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.clock.runFor(100);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect.poll(async () => (await reviewState(page)).requests[0].status).toBe('cancelled');
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await expect(page.getByTestId('reviewer-reflection')).toHaveAttribute('data-demonstrated', 'false');
  await runFirstRequest(page);
  expect((await reviewState(page)).requests.some(record => record.status === 'cancelled')).toBe(true);
});

test('@hosted ordinary state remains byte-for-byte isolated while starting, restarting and exiting the walkthrough', async ({ page }) => {
  await ready(page, '/playground');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), normalKey)).not.toBeNull();
  const original = await page.evaluate(key => localStorage.getItem(key), normalKey);
  const normalFlow = JSON.stringify({ stage: 'review', editor: 'vscode' });
  await page.evaluate(value => sessionStorage.setItem('gateway-sentence-flow-v1', value), normalFlow);
  await start(page);
  await page.clock.install();
  await runFirstRequest(page);
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBe(original);
  await ready(page, '/connect?review=adopt');
  await reviewSetup(page);
  expect(await page.evaluate(() => sessionStorage.getItem('gateway-sentence-flow-v1'))).toBe(normalFlow);
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await expect(page.getByTestId('reviewer-chapter-map')).toBeVisible();
  await page.getByRole('button', { name: 'Restart walkthrough', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start the walkthrough', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start the walkthrough', exact: true }).click();
  await expect(page).toHaveURL(/review=understand/);
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBe(original);
  await page.getByRole('button', { name: 'Exit walkthrough', exact: true }).click();
  await expect(page).not.toHaveURL(/review=/);
  await expect(page.getByTestId('reviewer-mission')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBe(original);
  expect(await page.evaluate(() => sessionStorage.getItem('gateway-sentence-flow-v1'))).toBe(normalFlow);
});

test('direct Understand entry opens the product immediately and keeps Run Request within a short initial viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '/?review=understand');
  await expect(page.getByTestId('reviewer-mission')).toBeVisible();
  await expect(page.getByTestId('reviewer-introduction')).toHaveCount(0);
  const run = page.getByRole('button', { name: 'Run a demo request', exact: true });
  await expect(run).toBeVisible();
  const bounds = (await run.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: `artifacts/reviewer/${info.project.name}/mission-short-height.png`, animations: 'disabled' });
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBeNull();
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await page.reload();
  await expect(run).toBeVisible();
  await expect(page.getByTestId('reviewer-mission')).toBeVisible();
});

test('@hosted direct later chapters offer an explicit example and navigation never claims demonstration', async ({ page }) => {
  await ready(page, '/routes?review=control');
  const before = await reviewState(page);
  expect(before.reviewer.progress.visited).toContain('control');
  expect(before.reviewer.progress.demonstrated).toEqual([]);
  await expect(page.getByTestId('working-source')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Prepare this example', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare this example', exact: true }).click();
  await expect(page.getByTestId('working-source')).toBeVisible();
  expect((await reviewState(page)).requests).toHaveLength(before.requests.length);
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await page.getByRole('button', { name: 'Skip this chapter', exact: true }).click();
  await expect(page).toHaveURL(/review=adopt/);
  const state = await reviewState(page);
  expect(state.reviewer.progress.skipped).toContain('control');
  expect(state.reviewer.progress.demonstrated).toEqual([]);
  await reviewSetup(page);
  await demonstrated(page, 'adopt');
  await expect(page.getByTestId('reviewer-reflection')).not.toContainText(/installation complete|app connected|connection verified/i);
});

test('@hosted chapter map and resume restore the exact filtered request URL and route context', async ({ page }) => {
  await ready(page, '/monitor?status=recovered&q=demo&order=asc&review=operate');
  await showRequestTable(page);
  await expect(page.getByRole('combobox', { name: 'Request status', exact: true })).toHaveValue('recovered');
  await page.locator('tbody .request-link').first().click();
  const receipt = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(receipt).toBeVisible();
  const identity = await receipt.locator('[data-request-identity]').getAttribute('data-request-identity');
  const location = new URL(page.url()).pathname + new URL(page.url()).search;
  await demonstrated(page, 'operate');
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await expect(page.getByTestId('reviewer-chapter-map')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  await expect(page).toHaveURL(url => url.pathname === '/review' && url.hash === '#chapters');
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname + url.search === location);
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', identity!);
  await page.reload();
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', identity!);
  await page.keyboard.press('Escape');
  await showRequestTable(page);
  await expect(page.getByRole('combobox', { name: 'Request status', exact: true })).toHaveValue('recovered');
  expect(new URL(page.url()).searchParams.get('q')).toBe('demo');
  expect(new URL(page.url()).searchParams.get('order')).toBe('asc');
});

test('reviewer reasoning and the complete product map are keyboard accessible without losing chapter context', async ({ page }) => {
  await start(page);
  const reasoning = page.getByRole('button', { name: 'Explore the decision', exact: true });
  await reasoning.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close the reasoning', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Close the reasoning', exact: true })).toBeFocused();
  await expect(page.getByTestId('reviewer-reflection')).toContainText('What the user needs');
  const map = page.getByRole('button', { name: 'Chapter map', exact: true });
  await map.focus();
  await page.keyboard.press('Enter');
  const chapters = page.getByTestId('reviewer-chapter-map');
  await expect(chapters).toBeVisible();
  await expect(chapters.getByRole('heading', { level: 2 })).toBeFocused();
  await chapters.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  const detail = chapters.getByRole('link', { name: /^Model detail/ });
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url => url.pathname === '/models' && url.searchParams.get('model') === 'anthropic/claude-sonnet-4.6' && url.searchParams.get('review') === 'understand');
  await expect(page.getByTestId('reviewer-mission')).toContainText('candidate serving providers');
  await page.getByRole('button', { name: 'Claude Sonnet 4.6 details', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reviewer-mission')).toContainText('Narrow model choices');
  await page.getByRole('button', { name: 'GPT-5.4 details', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reviewer-mission')).toContainText('candidate serving providers');
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/models' && url.searchParams.get('model') === 'openai/gpt-5.4' && url.searchParams.get('review') === 'understand');
  await expect(page.getByRole('region', { name: 'GPT-5.4 information', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to walkthrough', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url => url.pathname === '/' && url.searchParams.get('review') === 'understand');
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
});

test('supporting destinations explain their own purpose and do not demonstrate the current chapter by unrelated actions', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: 'Connect my app', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/connect' && url.searchParams.get('review') === 'understand');
  await expect(page.getByTestId('reviewer-mission')).toContainText('Prepare an integration appropriate');
  await reviewSetup(page);
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await page.getByRole('button', { name: 'Return to walkthrough', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/' && url.searchParams.get('review') === 'understand');
  await ready(page, '/playground?review=understand');
  await expect(page.getByTestId('reviewer-mission')).toContainText('Experiment with a prompt');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  expect((await reviewState(page)).requests[0].status).toBe('success');
  expect((await reviewState(page)).reviewer.progress.demonstrated).toEqual([]);
  await page.getByRole('button', { name: 'Return to walkthrough', exact: true }).click();
  await runFirstRequest(page);
});

test('stale review comparison survives reload as evidence and still requires a fresh test', async ({ page }) => {
  await ready(page, '/routes?review=control');
  await page.getByRole('button', { name: 'Prepare this example', exact: true }).click();
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await expect(page.locator('.comparison-difference')).toBeVisible();
  const count = (await reviewState(page)).requests.length;
  await page.getByRole('tab', { name: 'Route', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate outage for Amazon Bedrock', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Comparison', exact: true }).click();
  await expect(page.locator('.rehearsal-comparison')).toContainText(/stale|changed|test again/i);
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Comparison', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.rehearsal-comparison')).toContainText(/stale|changed|test again/i);
  await page.reload();
  await expect(page.locator('.rehearsal-comparison')).toContainText(/stale|changed|test again/i);
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeDisabled();
  expect((await reviewState(page)).requests).toHaveLength(count);
});

test('malformed reviewer storage resets invalid metadata while retaining valid source and comparison receipts', async ({ page }) => {
  await ready(page, '/routes?review=control');
  await page.getByRole('button', { name: 'Prepare this example', exact: true }).click();
  await page.getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await expect(page.locator('.comparison-difference')).toBeVisible();
  const before = await reviewState(page);
  const source = before.requests.find(record => record.id === before.sourceId)!;
  const draft = before.requests.find(record => record.id === before.reviewer.comparison!.draftId)!;
  expect(source).toBeDefined();
  expect(draft).toBeDefined();
  await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.requests = [null, 'invalid receipt', { id: 'invalid' }, ...saved.requests];
    saved.revisions = [null, { slug: 'invalid' }, ...saved.revisions];
    saved.pending = { slug: 'invalid' };
    saved.reviewer.progress = { chapter: 'unknown-chapter', visited: ['unknown-chapter'], demonstrated: ['operate'], skipped: [], destinations: [], finished: true };
    localStorage.setItem(key, JSON.stringify(saved));
  }, reviewKey);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  await expect(page.locator('.comparison-difference')).toBeVisible();
  const restored = await reviewState(page);
  expect(restored.requests).toHaveLength(before.requests.length);
  expect(restored.requests.find(record => record.id === source.id)).toEqual(source);
  expect(restored.requests.find(record => record.id === draft.id)).toEqual(draft);
  expect(restored.reviewer.progress.demonstrated).toEqual([]);
  expect(restored.reviewer.progress.finished).toBe(false);
});

test('walkthrough works with unavailable storage and legacy product tour stays independent', async ({ page, context }) => {
  await ready(page, '/?tour=1');
  await expect(page.getByTestId('reviewer-mission')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('tour')).toBe('1');
  await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { configurable: true, value: () => { throw new DOMException('Storage is unavailable', 'SecurityError'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, value: () => { throw new DOMException('Storage is unavailable', 'SecurityError'); } });
  });
  await start(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Run a demo request', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.getByTestId('reviewer-reflection')).toHaveAttribute('data-demonstrated', 'true');
  await expect(page.getByRole('button', { name: /^Continue to / })).toBeVisible();
});

test('reviewer surfaces preserve one readable frame, accessible controls and reduced motion at every width and theme', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const capture = async (state: string) => {
    for (const width of [360, 390, 768, 1440, 1920]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${state}: ${width}px ${theme} has no horizontal overflow`).toBe(true);
      await expect(page.locator(':is(.rw-entry,.rw-review-header,.rw-mission,.rw-reflection) :is(button,a,summary):visible').first()).toBeVisible();
      for (const control of await page.locator(':is(.rw-entry,.rw-review-header,.rw-mission,.rw-reflection) :is(button,a,summary):visible').all()) {
        expect((await control.boundingBox())!.height, `${state}: reviewer control is at least 44px`).toBeGreaterThanOrEqual(44);
        if (await control.evaluate(element => element.matches('.rw-brand,.rw-icon-button'))) expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator('[data-reviewer-surface]').evaluateAll(elements => elements.flatMap(element => element.getAnimations({ subtree: true })).filter(animation => animation.playState === 'running').length)).toBe(0);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: `artifacts/reviewer/${info.project.name}/${state}-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
  };
  await ready(page, '/review');
  await expect(page.getByTestId('reviewer-introduction')).toBeVisible();
  await capture('introduction');
  await page.getByRole('button', { name: 'Start the walkthrough', exact: true }).click();
  await expect(page.getByTestId('reviewer-mission')).toBeVisible();
  await capture('mission');
  await page.getByRole('button', { name: 'Explore the decision', exact: true }).click();
  await capture('reasoning');
  await page.getByRole('button', { name: 'Chapter map', exact: true }).click();
  await expect(page.getByTestId('reviewer-chapter-map')).toBeVisible();
  await capture('chapter-map');
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Skip this chapter', exact: true }).click();
  await expect(page.getByTestId('reviewer-ending')).toContainText('0 of 5 behaviors demonstrated');
  await expect(page.getByRole('region', { name: 'What I would validate next', exact: true })).toBeVisible();
  await capture('ending');
});
