import { expect, test, type Locator, type Page } from '@playwright/test';
import type { RequestRecord } from '../src/lib/gateway';
import { getAttemptSpans, getReplayDuration } from '../src/lib/replay';
import { projectRequestField } from '../src/lib/request-field';
import { openRequestConditions } from './focused-workspace-helper';

const storageKey = 'sean-gateway-demo-v2';
const field = (page: Page) => page.getByTestId('request-field');
const preview = (page: Page) => page.getByTestId('request-field-preview');
const plot = (page: Page) => page.getByTestId('request-field-plot');
const trace = (page: Page) => page.getByTestId('evolving-workspace').locator('.ew-observatory-slot .rt-root');

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
}

async function records(page: Page): Promise<RequestRecord[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).requests, storageKey);
}

async function theme(page: Page, next: string) {
  if (await page.locator('html').getAttribute('data-theme') !== next) {
    await page.getByRole('button', { name: `Switch to ${next} theme`, exact: true }).click();
  }
}

async function geometryFits(page: Page, surface: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const width = page.viewportSize()!.width;
  await expect.poll(async () => {
    const bounds = await surface.boundingBox();
    return !!bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1;
  }).toBe(true);
}

async function exactReceipt(page: Page, identity: string) {
  const drawer = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', identity);
  await expect(drawer.locator('.rt-root')).toHaveAttribute('data-request-id', identity);
  return drawer;
}

async function recover(page: Page) {
  await ready(page, '/playground');
  await page.clock.install({ time: new Date('2026-10-15T18:00:00Z') });
  const before = (await records(page)).length;
  await openRequestConditions(page);
  await page.getByTestId('evolving-workspace').getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect.poll(async () => (await records(page)).length).toBe(before + 1);
  const receipt = (await records(page))[0];
  expect(receipt.status).toBe('recovered');
  await expect(trace(page)).toHaveAttribute('data-request-id', receipt.id);
  return receipt;
}

test('@hosted activity offers honest request-order and time scales while highlighting retains every receipt', async ({ page }) => {
  await ready(page, '/dashboard');
  const snapshot = await records(page);
  const ordered = projectRequestField(snapshot, 'requests').points;
  await expect(field(page)).toHaveAttribute('data-horizontal-scale', 'requests');
  await expect(field(page).getByRole('heading', { name: 'Request activity', exact: true })).toBeVisible();
  await expect(field(page).getByRole('button', { name: 'By request', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(field(page).locator('.rqf-point')).toHaveCount(ordered.length);
  await expect(field(page).locator('.rqf-scope')).toContainText(`${ordered.length} simulated requests`);
  for (const point of ordered) {
    const mark = field(page).locator(`[data-point-request="${point.record.id}"]`);
    const position = await mark.evaluate(element => ({ x: Number.parseFloat((element as HTMLElement).style.left), y: Number.parseFloat((element as HTMLElement).style.top) }));
    expect(position.x).toBeCloseTo(point.x * 100, 4);
    expect(position.y).toBeCloseTo(point.y * 100, 4);
  }
  for (const status of ['success', 'recovered', 'failed', 'cancelled'] as const) {
    const count = ordered.filter(point => point.record.status === status).length;
    const label = `${status[0].toUpperCase()}${status.slice(1)}`;
    const highlight = field(page).getByRole('button', { name: `Highlight ${label} requests`, exact: true });
    if (!count) {
      await expect(highlight).toBeDisabled();
      continue;
    }
    await highlight.click();
    await expect(highlight).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page)).toHaveAttribute('data-highlight', status);
    await expect(field(page).locator('.rqf-point')).toHaveCount(ordered.length);
    const activeId = await field(page).locator('.rqf-point.is-active').getAttribute('data-point-request');
    const retainedSelection = ordered.some(point => point.record.id === activeId && point.record.status !== status) ? 1 : 0;
    await expect(field(page).locator('.rqf-point.is-dimmed')).toHaveCount(ordered.length - count - retainedSelection);
    await highlight.click();
    await expect(field(page)).toHaveAttribute('data-highlight', 'all');
  }
  await plot(page).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const selected = ordered[1].record;
  await expect(preview(page).locator('.rqf-preview-top code')).toHaveText(selected.id);
  await field(page).getByRole('button', { name: 'By time', exact: true }).click();
  await expect(field(page)).toHaveAttribute('data-horizontal-scale', 'time');
  await expect(preview(page).locator('.rqf-preview-top code')).toHaveText(selected.id);
  for (const point of projectRequestField(snapshot, 'time').points) {
    expect(await field(page).locator(`[data-point-request="${point.record.id}"]`).evaluate(element => Number.parseFloat((element as HTMLElement).style.left))).toBeCloseTo(point.x * 100, 4);
  }
  await preview(page).getByRole('button', { name: 'Inspect request', exact: true }).click();
  await exactReceipt(page, selected.id);
  expect(await records(page)).toEqual(snapshot);
});

test('@hosted activity dot hover and keyboard inspection preserve the selected receipt and focus', async ({ page }) => {
  await ready(page, '/monitor');
  const snapshot = await records(page);
  await expect(field(page)).toHaveAttribute('data-horizontal-scale', 'time');
  await field(page).getByRole('button', { name: 'By request', exact: true }).click();
  const points = projectRequestField(snapshot, 'requests').points;
  const selected = points.find(point => point.record.status === 'recovered' && point.x > 0 && point.x < 1)!;
  expect(selected).toBeDefined();
  await plot(page).scrollIntoViewIfNeeded();
  const bounds = (await plot(page).boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * selected.x, bounds.y + bounds.height * selected.y);
  await expect(preview(page).locator('.rqf-preview-top code')).toHaveText(selected.record.id);
  await expect(field(page).locator('.rqf-point.is-active')).toHaveAttribute('data-point-request', selected.record.id);
  await expect(field(page).locator('.rqf-readout')).toContainText(selected.record.ttftMs.toLocaleString('en-US'));
  await expect(field(page).locator('.rqf-stem')).toBeVisible();
  await plot(page).focus();
  await page.keyboard.press('Enter');
  await exactReceipt(page, selected.record.id);
  await page.keyboard.press('Escape');
  await expect(plot(page)).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await exactReceipt(page, points[1].record.id);
  await page.keyboard.press('Escape');
  await expect(plot(page)).toBeFocused();
  expect(await records(page)).toEqual(snapshot);
});

test('@hosted an empty activity scope explains the next action without synthetic marks or metrics', async ({ page }) => {
  await ready(page, '/dashboard');
  await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.requests = [];
    saved.sourceId = null;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await expect(field(page).locator('.rqf-empty')).toContainText('No recorded requests in this scope.');
  await expect(field(page).locator('.rqf-scope')).toContainText('0 simulated requests');
  await expect(field(page).locator('.rqf-point')).toHaveCount(0);
  await expect(plot(page)).toHaveCount(0);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run a demo request', exact: true })).toBeVisible();
  expect(await records(page)).toEqual([]);
});

test('@hosted budget scope separates the editable cap from related boundaries without a progress metaphor', async ({ page }) => {
  await ready(page, '/budgets');
  const snapshot = await records(page);
  const origin = page.getByRole('button', { name: 'Inspect budget for Coding agent', exact: true });
  await origin.click();
  const inspector = page.getByRole('region', { name: 'Budget scope inspector', exact: true });
  const relationship = inspector.getByRole('group', { name: 'Applicable documented budgets: API key, Team', exact: true });
  await expect(relationship.locator('.sc-budget-local')).toContainText('API key budget');
  await expect(relationship.locator('.sc-budget-related')).toContainText('Team budget');
  await expect(relationship).not.toContainText('User budget');
  await expect(relationship.locator('.sc-budget-gate')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(inspector).toContainText('Every applicable cap must allow the request.');
  await inspector.getByRole('button', { name: 'Edit budget', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Edit demo budget', exact: true });
  await expect(editor.locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'team');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(origin).toBeFocused();
  await expect(inspector).toBeVisible();
  expect(await records(page)).toEqual(snapshot);
});

test('@hosted provider billing keeps its primary path, conditional fallback and unverified metadata distinct', async ({ page }) => {
  await ready(page, '/byok');
  const snapshot = await records(page);
  const billing = page.getByRole('complementary', { name: 'Provider billing path', exact: true });
  await expect(billing.getByRole('heading', { name: 'How provider billing works', exact: true })).toBeVisible();
  await expect(billing.locator('.byok-primary-path .byok-path-step')).toHaveCount(3);
  await expect(billing.locator('.byok-primary-path')).toContainText('Your provider credentials');
  await expect(billing.locator('.byok-primary-path')).toContainText('Your provider account');
  await expect(billing.locator('.byok-fallback')).toContainText('If own credentials fail');
  await expect(billing.locator('.byok-fallback')).toContainText('Can use purchased Gateway credits.');
  await expect(billing.locator('.byok-validation')).toContainText('Not performed');
  await billing.locator('.byok-evidence > summary').click();
  await expect(billing.locator('.byok-evidence')).toContainText('credentialType');
  await expect(billing.locator('.byok-evidence')).toContainText('These demo receipts do not record it.');
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add demo provider connection', exact: true });
  await editor.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('bedrock');
  await editor.getByRole('textbox', { name: 'Connection label', exact: true }).fill('Existing provider agreement');
  await editor.getByRole('button', { name: 'Add demo connection', exact: true }).click();
  await expect(billing.locator('.byok-primary-path .byok-path-step').nth(1)).toContainText('Amazon Bedrock');
  await expect(billing.locator('.byok-billing-heading')).toContainText('Existing provider agreement');
  await expect(billing.locator('.byok-validation')).toContainText('Not performed');
  await page.getByRole('switch', { name: 'Disable Existing provider agreement', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Enable Existing provider agreement', exact: true })).toHaveAttribute('aria-checked', 'false');
  expect(await records(page)).toEqual(snapshot);
  await expect(page.getByRole('textbox', { name: /secret|credential|api key/i })).toHaveCount(0);
});

test('@hosted timeline color explains attempt, recovery and generation without changing recorded intervals', async ({ page }) => {
  const receipt = await recover(page);
  const snapshot = await records(page);
  const spans = getAttemptSpans(receipt).filter(span => receipt.attempts[span.index].status !== 'excluded');
  for (const nextTheme of ['light', 'dark']) {
    await theme(page, nextTheme);
    await expect(trace(page).getByRole('group', { name: 'Timing colors', exact: true })).toContainText('Attempt failed');
    const axis = Number(await trace(page).getAttribute('data-axis-ms'));
    const colors: string[] = [];
    for (const span of spans) {
      const bar = trace(page).locator(`.rt-attempt[data-attempt-index="${span.index}"] .rt-bar`);
      const measured = await bar.evaluate(element => ({ left: Number.parseFloat((element as HTMLElement).style.left), width: Number.parseFloat((element as HTMLElement).style.width), color: getComputedStyle(element).borderTopColor }));
      expect(measured.left).toBeCloseTo(span.start / axis * 100, 4);
      expect(measured.width).toBeCloseTo((span.end - span.start) / axis * 100, 4);
      colors.push(measured.color);
    }
    const generation = trace(page).locator('.rt-output .rt-bar');
    const output = await generation.evaluate(element => ({ left: Number.parseFloat((element as HTMLElement).style.left), width: Number.parseFloat((element as HTMLElement).style.width), color: getComputedStyle(element).borderTopColor }));
    expect(output.left).toBeCloseTo(receipt.ttftMs / axis * 100, 4);
    expect(output.width).toBeCloseTo((getReplayDuration(receipt) - receipt.ttftMs) / axis * 100, 4);
    colors.push(output.color);
    expect(new Set(colors).size).toBe(3);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trace(page).locator('.rt-attempt').first().focus();
  expect(await trace(page).evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  expect(await records(page)).toEqual(snapshot);
});

test('@hosted connection model mark is a centered vector in every required width', async ({ page }) => {
  await ready(page, '/connect');
  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const frame = page.locator('.se-connection-path .se-model-mark');
    const icon = frame.locator('svg');
    await expect(icon).toHaveCount(1);
    const centering = await frame.evaluate(element => {
      const outer = element.getBoundingClientRect();
      const inner = element.querySelector('svg')!.getBoundingClientRect();
      return { x: Math.abs(outer.x + outer.width / 2 - inner.x - inner.width / 2), y: Math.abs(outer.y + outer.height / 2 - inner.y - inner.height / 2) };
    });
    expect(centering.x).toBeLessThanOrEqual(1);
    expect(centering.y).toBeLessThanOrEqual(1);
  }
});

test('five refined surfaces fit every required width in both themes', async ({ page }, info) => {
  test.setTimeout(240_000);
  await recover(page);
  // The captured receipt is persisted; the visual review can now resume browser time.
  await page.clock.resume();
  for (const view of ['budgets', 'dashboard', 'playground', 'connect', 'byok']) {
    await ready(page, `/${view}`);
    if (view === 'budgets') await page.getByRole('button', { name: 'Inspect budget for Coding agent', exact: true }).click();
    if (view === 'playground') {
      // Navigation retains receipts, but a working trace belongs to the current run.
      const before = (await records(page)).length;
      await openRequestConditions(page);
      await page.getByTestId('evolving-workspace').getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
      await page.getByRole('button', { name: 'Run request', exact: true }).click();
      await page.clock.runFor(10_000);
      await expect.poll(async () => (await records(page)).length).toBe(before + 1);
      const receipt = (await records(page))[0];
      expect(receipt.status).toBe('recovered');
      await expect(trace(page)).toHaveAttribute('data-request-id', receipt.id);
      // Review the completed request with its optional fixture controls collapsed.
      await page.locator('.ew-fixture > details[open] > summary').click();
    }
    for (const nextTheme of ['light', 'dark']) {
      await theme(page, nextTheme);
      for (const width of [360, 390, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
        const surface = view === 'budgets' ? page.getByRole('region', { name: 'Budget scope inspector', exact: true }) : view === 'dashboard' ? field(page) : view === 'playground' ? trace(page) : view === 'connect' ? page.locator('.se-artifact') : page.getByRole('complementary', { name: 'Provider billing path', exact: true });
        await expect(surface).toBeVisible();
        await geometryFits(page, surface);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `artifacts/five-refinements/${info.project.name}/${view}-${nextTheme}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
    }
  }
});
