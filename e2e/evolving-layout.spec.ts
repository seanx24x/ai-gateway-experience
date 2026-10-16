import { navigateStage, openRouteSettings, showRequestTable, openRequestConditions, closeRouteSettings } from './focused-workspace-helper';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const WIDTHS = [360, 390, 768, 1440, 1920] as const;
const THEMES = ['light', 'dark'] as const;
const workspace = (page: Page) => page.getByTestId('evolving-workspace');
const PRIMARY = '.ew-primary-action button:visible, .ew-primary-action a:visible';
const FONT_SELECTORS = '.ew-stage-button, .ew-request-editor .field-label, .ew-response-output, .ew-source-identity, .se-option, .se-sentence, .rt-tick, .rt-value, .rt-qualification, .rqf-navigation-note, .rqf-time-tick';
type Geometry = { state: string; document: { width: number; scrollWidth: number }; workspace: null | { x: number; width: number; right: number }; fonts: Array<{ label: string; size: number }>; scrollContainers: Array<{ label: string; left: number; right: number; overflow: string; contained: boolean }> };

async function ready(page: Page) {
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}

async function theme(page: Page, next: 'light' | 'dark') {
  if (await page.locator('html').getAttribute('data-theme') !== next) {
    await page.getByRole('button', { name: `Switch to ${next} theme`, exact: true }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
}

async function top(page: Page) { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); }

async function routeSettled(page: Page) {
  // Playwright's timer clock and the native animation timeline advance separately.
  // Measure the final layout, rather than the transient FLIP transform.
  await workspace(page).locator('.ew-route-slot').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
}

async function stage(page: Page, next: 'Try' | 'Shape' | 'Connect' | 'Observe') {
  await navigateStage(page, next);
  await expect(workspace(page)).toHaveAttribute('data-workspace-stage', next.toLowerCase());
  await page.clock.runFor(350);
  await routeSettled(page);
  await top(page);
}

async function inInitialViewport(page: Page, control: Locator, name: string) {
  await top(page);
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds, `${name}: action has geometry`).not.toBeNull();
  const height = page.viewportSize()!.height;
  expect.soft(bounds!.y, `${name}: action starts inside initial viewport`).toBeGreaterThanOrEqual(0);
  expect.soft(bounds!.y + bounds!.height, `${name}: action ends inside initial viewport`).toBeLessThanOrEqual(height + 1);
}

async function geometry(page: Page, name: string): Promise<Geometry> {
  return page.evaluate(({ name, fontSelectors }) => {
    const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const main = document.querySelector('[data-testid="evolving-workspace"]');
    const rect = main?.getBoundingClientRect();
    const fonts = Array.from(document.querySelectorAll(fontSelectors)).filter(visible).map(element => ({ label: element.textContent?.trim().slice(0, 90) ?? element.tagName, size: parseFloat(getComputedStyle(element).fontSize) }));
    const scrollContainers = Array.from(document.querySelectorAll('pre, table')).filter(visible).filter(element => element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().width > document.documentElement.clientWidth).map(element => {
      let candidate: Element | null = element;
      while (candidate && !['auto', 'scroll'].includes(getComputedStyle(candidate).overflowX)) candidate = candidate.parentElement;
      const box = candidate?.getBoundingClientRect();
      return { label: element.tagName + ' ' + element.className, left: box?.left ?? -1, right: box?.right ?? Infinity, overflow: candidate ? getComputedStyle(candidate).overflowX : 'uncontained', contained: Boolean(candidate) };
    });
    return { state: name, document: { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }, workspace: rect ? { x: rect.x, width: rect.width, right: rect.right } : null, fonts, scrollContainers };
  }, { name, fontSelectors: FONT_SELECTORS });
}

async function capture(page: Page, testInfo: TestInfo, name: string, evidence: Geometry[], fullPage = true) {
  await top(page);
  const measured = await geometry(page, name);
  evidence.push(measured);
  expect.soft(measured.document.scrollWidth, `${name}: no document horizontal overflow`).toBeLessThanOrEqual(measured.document.width + 1);
  if (measured.workspace) {
    expect.soft(measured.workspace.x, `${name}: workspace fits left edge`).toBeGreaterThanOrEqual(-1);
    expect.soft(measured.workspace.right, `${name}: workspace fits right edge`).toBeLessThanOrEqual(measured.document.width + 1);
  }
  for (const font of measured.fonts) expect.soft(font.size, `${name}: readable ${font.label}`).toBeGreaterThanOrEqual(12);
  for (const container of measured.scrollContainers) {
    expect.soft(container.contained, `${name}: ${container.label} has deliberate local scrolling`).toBe(true);
    expect.soft(container.left, `${name}: scroll container fits left edge`).toBeGreaterThanOrEqual(-1);
    expect.soft(container.right, `${name}: scroll container fits right edge`).toBeLessThanOrEqual(measured.document.width + 1);
  }
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage, animations: 'disabled' });
}

async function writeEvidence(testInfo: TestInfo, evidence: Geometry[]) {
  const path = testInfo.outputPath('layout-geometry.json');
  await writeFile(path, JSON.stringify({ test: testInfo.title, browser: testInfo.project.name, evidence }, null, 2));
  await testInfo.attach('layout-geometry', { path, contentType: 'application/json' });
}

async function startWorkspace(page: Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto('/playground');
  await ready(page);
  await expect(workspace(page)).toBeVisible();
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
}

async function recover(page: Page) {
  await openRequestConditions(page);
  await workspace(page).getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
  await workspace(page).getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(workspace(page).locator('.ew-response-receipt')).toContainText('Recovered');
  await expect(workspace(page).locator('.ew-observatory-slot .rt-attempt--failed')).toHaveCount(1);
  await expect(workspace(page).locator('.ew-observatory-slot .rt-attempt--success')).toContainText('Amazon Bedrock');
}

async function moveEarlierWithKeyboard(page: Page) {
  const earlier = workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true });
  await earlier.focus();
  await page.keyboard.press('Enter');
  await page.clock.runFor(350);
  await routeSettled(page);
  await expect(workspace(page).locator('.po-row').first()).toContainText('Amazon Bedrock');
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, disabled: document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled, label: document.activeElement?.getAttribute('aria-label'), visible: Boolean(document.activeElement?.getClientRects().length) }));
  expect(focus.tag, 'keyboard move retains native control focus').toBe('BUTTON');
  expect(focus.disabled, 'keyboard move never leaves focus on a disabled arrow').toBe(false);
  expect(focus.visible).toBe(true);
  expect(focus.label, 'focus stays with the moved provider').toContain('Amazon Bedrock');
}

for (const width of WIDTHS) for (const selectedTheme of THEMES) {
  test(`workspace layout ${width}px ${selectedTheme}: nine evolving states`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence: Geometry[] = [];
    const errors: string[] = [];
    const inferenceRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/ai-gateway\.vercel\.sh\//.test(request.url())) inferenceRequests.push(request.url()); });
    const height = width === 360 ? 800 : width === 390 ? 844 : 1000;
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await ready(page);
    await theme(page, selectedTheme);
    await inInitialViewport(page, page.getByRole('button', { name: 'Run a demo request', exact: true }), 'Home Run');
    await capture(page, testInfo, 'home', evidence);
    await page.goto('/playground');
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
    await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
    const route = await workspace(page).locator('.ew-route-slot').elementHandle();
    await expect(workspace(page).locator('.ew-route-slot')).toBeHidden();
    await expect(workspace(page).locator('.ew-observatory-slot')).toBeVisible();
    await inInitialViewport(page, workspace(page).getByRole('button', { name: 'Run request', exact: true }), 'Try Run');
    await capture(page, testInfo, 'try-initial', evidence);
    await recover(page);
    await capture(page, testInfo, 'try-provider-recovery', evidence);
    await stage(page, 'Shape');
    expect(await route!.evaluate(element => element === document.querySelector('.ew-route-slot')), 'one route wrapper survives stage changes').toBe(true);
    if (width >= 1024) {
      const shaped = await workspace(page).locator('.ew-route-slot').boundingBox();
      expect(shaped!.width, 'the editor receives a generous main surface').toBeGreaterThan(600);
    }
    await inInitialViewport(page, workspace(page).getByRole('button', { name: 'Test draft', exact: true }), 'Shape Test');
    await moveEarlierWithKeyboard(page);
    await capture(page, testInfo, 'shape-edit', evidence);
    await workspace(page).getByRole('button', { name: 'Test draft', exact: true }).click();
    await page.clock.runFor(1000);
    await expect(workspace(page).getByRole('region', { name: 'Controlled route comparison', exact: true })).toBeVisible();
    await expect(workspace(page).locator('.ew-route-slot')).toBeHidden();
    await capture(page, testInfo, 'shape-comparison', evidence);
    await stage(page, 'Connect');
    await expect(workspace(page).locator('.se-sentence')).toBeVisible();
    await inInitialViewport(page, workspace(page).locator(PRIMARY).first(), 'Connect Continue');
    await capture(page, testInfo, 'connect-sentence', evidence);
    await workspace(page).locator('.se-phrase').click();
    await expect(workspace(page).locator('.se-decision')).toBeVisible();
    await capture(page, testInfo, 'connect-choices', evidence);
    await page.keyboard.press('Escape');
    await workspace(page).getByRole('button', { name: 'Skip to review', exact: true }).click();
    await expect(workspace(page).getByRole('textbox', { name: 'Prepared agent prompt', exact: true })).toBeVisible();
    await inInitialViewport(page, workspace(page).locator(PRIMARY).first(), 'Connect reviewed handoff');
    await capture(page, testInfo, 'connect-review', evidence);
    await stage(page, 'Observe');
    await showRequestTable(page);
    await expect(workspace(page).locator('.request-table-section .table-scroll table')).toBeVisible();
    await capture(page, testInfo, 'observe', evidence);
    expect(errors, 'no browser runtime errors during the complete local flow').toEqual([]);
    expect(inferenceRequests, 'verification never makes billable inference requests').toEqual([]);
    await writeEvidence(testInfo, evidence);
  });
}

test('reduced motion keeps the same route, recovery evidence, and keyboard focus', async ({ page }, testInfo) => {
  const evidence: Geometry[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startWorkspace(page);
  await recover(page);
  const route = await workspace(page).locator('.ew-route-slot').elementHandle();
  await stage(page, 'Shape');
  await moveEarlierWithKeyboard(page);
  expect(await route!.evaluate(element => element === document.querySelector('.ew-route-slot'))).toBe(true);
  expect(await workspace(page).locator('.ew-route-slot').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await capture(page, testInfo, 'reduced-motion-shape', evidence);
  await writeEvidence(testInfo, evidence);
});

test.describe('390px coarse-pointer geometry', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('navigation and provider controls expose effective 44px targets', async ({ page }, testInfo) => {
    const evidence: Geometry[] = [];
    await startWorkspace(page, 390, 844);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const navigation = workspace(page).locator('.ew-composer-actions button');
    await expect(navigation).toHaveCount(1);
    for (const control of await navigation.all()) {
      const bounds = await control.boundingBox();
      expect.soft(bounds!.width, `${await control.innerText()}: coarse target width`).toBeGreaterThanOrEqual(44);
      expect.soft(bounds!.height, `${await control.innerText()}: coarse target height`).toBeGreaterThanOrEqual(44);
    }
    await capture(page, testInfo, 'coarse-try', evidence, false);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse emulation remains active after viewport capture').toBe(true);
    await navigateStage(page, 'Shape');
    await expect(workspace(page)).toHaveAttribute('data-workspace-stage', 'shape');
    await page.clock.runFor(350);
    await routeSettled(page);
    await top(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse emulation remains active after stage change').toBe(true);
    const controls = workspace(page).locator('.ew-route-slot .po-handle, .ew-route-slot .po-arrow, .ew-route-slot .rf-provider-button');
    for (const control of await controls.all()) {
      if (!await control.isVisible()) continue;
      const bounds = await control.boundingBox();
      expect.soft(bounds!.width, `${await control.getAttribute('aria-label')}: provider target width`).toBeGreaterThanOrEqual(44);
      expect.soft(bounds!.height, `${await control.getAttribute('aria-label')}: provider target height`).toBeGreaterThanOrEqual(44);
    }
    await workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).tap();
    await page.clock.runFor(350);
    await expect(workspace(page).locator('.po-row').first()).toContainText('Amazon Bedrock');
    await capture(page, testInfo, 'coarse-shape', evidence, false);
    await writeEvidence(testInfo, evidence);
  });
});

test('720 CSS px reflows the workspace at the equivalent of 1440px with 200 percent browser zoom', async ({ page }, testInfo) => {
  const evidence: Geometry[] = [];
  // This verifies the resulting CSS viewport, not browser-toolbar zoom or pinch scaling.
  await startWorkspace(page, 720, 500);
  await inInitialViewport(page, workspace(page).getByRole('button', { name: 'Run request', exact: true }), 'Reflow Try Run');
  await capture(page, testInfo, 'reflow-try', evidence);
  await stage(page, 'Shape');
  await inInitialViewport(page, workspace(page).getByRole('button', { name: 'Test draft', exact: true }), 'Reflow Shape Test');
  await capture(page, testInfo, 'reflow-shape', evidence);
  await stage(page, 'Connect');
  await capture(page, testInfo, 'reflow-connect', evidence);
  await workspace(page).getByRole('button', { name: 'Skip to review', exact: true }).click();
  await capture(page, testInfo, 'reflow-review', evidence);
  await stage(page, 'Observe');
  await capture(page, testInfo, 'reflow-observe', evidence);
  await writeEvidence(testInfo, evidence);
});
