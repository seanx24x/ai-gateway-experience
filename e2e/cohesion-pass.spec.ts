import { test, expect, type Page } from '@playwright/test';
import { getReplayDuration } from '../src/lib/replay';
import { openRequestConditions, showRequestTable } from './focused-workspace-helper';

const storageKey = 'sean-gateway-demo-v2';
const detail = (page: Page) => page.getByRole('region', { name: 'Request details', exact: true });
const recordStore = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).requests, storageKey);

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
}

async function expectInPageReceipt(page: Page, identity: string) {
  const receipt = detail(page);
  await expect(receipt).toBeVisible();
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', identity);
  const evidenceTab = receipt.getByRole('tab', { name: 'Evidence', exact: true });
  if (await evidenceTab.getAttribute('aria-selected') !== 'true') await evidenceTab.click();
  await expect(receipt.locator('.rt-root')).toHaveAttribute('data-request-id', identity);
  await expect(page.getByRole('dialog', { name: 'Request details', exact: true })).toHaveCount(0);
  const placement = await receipt.evaluate(element => ({ insideMain: Boolean(element.closest('#main')), position: getComputedStyle(element).position }));
  expect(placement.insideMain).toBe(true);
  expect(['fixed', 'absolute']).not.toContain(placement.position);
  const edges = await receipt.evaluate(element => {
    const box = element.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const body = document.body.getBoundingClientRect();
    const gutter = viewport < 768 ? 20 : 32;
    const width = Math.min(1240, body.width - gutter * 2);
    const expectedLeft = body.left + (body.width - width) / 2;
    return { left: box.left, right: box.right, expectedLeft, expectedRight: expectedLeft + width, overflow: document.documentElement.scrollWidth > viewport };
  });
  expect(Math.abs(edges.left - edges.expectedLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(edges.right - edges.expectedRight)).toBeLessThanOrEqual(1);
  expect(edges.overflow).toBe(false);
  return receipt;
}

test('@hosted in-page request inspection preserves filters, exact identity, Back/Forward, focus and scroll', async ({ page }) => {
  await ready(page, '/monitor');
  await showRequestTable(page);
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('recovered');
  const trigger = page.locator('tbody .request-link').nth(2);
  const identity = await trigger.getAttribute('title');
  expect(identity).toBeTruthy();
  const snapshot = await recordStore(page);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const before = await page.evaluate(() => scrollY);
  await trigger.press('Enter');
  const receipt = await expectInPageReceipt(page, identity!);
  const back = receipt.getByRole('button', { name: 'Back to Logs', exact: true });
  await expect(back).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(receipt.getByRole('tab', { name: 'Evidence', exact: true })).toBeFocused();
  await receipt.getByRole('tab', { name: 'Usage', exact: true }).click();
  await page.goBack();
  await expect(receipt).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('combobox', { name: 'Request status', exact: true })).toHaveValue('recovered');
  await expect(page).toHaveURL(/status=recovered/);
  await expect(page).not.toHaveURL(/request=/);
  await page.goForward();
  await expectInPageReceipt(page, identity!);
  await expect(page).toHaveURL(new RegExp(`request=${identity}`));
  await back.click();
  await expect(receipt).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(2);
  expect(await recordStore(page)).toEqual(snapshot);
});

test('@hosted a direct receipt link survives refresh and returns to its page without leaving the app', async ({ page }) => {
  await ready(page, '/monitor');
  const snapshot = await recordStore(page);
  const selected = snapshot.find((record: { status: string }) => record.status === 'recovered');
  await page.goto(`/monitor?status=recovered&request=${encodeURIComponent(selected.id)}`);
  const receipt = await expectInPageReceipt(page, selected.id);
  await expect(receipt.getByRole('button', { name: 'Back to Logs', exact: true })).toBeFocused();
  await page.reload();
  await expectInPageReceipt(page, selected.id);
  await receipt.locator('button:visible').last().evaluate(element => (element as HTMLElement).focus({ preventScroll: true }));
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(receipt).toBeHidden();
  await expect(page).toHaveURL(/\/monitor\?status=recovered$/);
  await expect(page.locator('main h1:visible')).toHaveText('Logs');
  await expect(page.locator('main h1:visible')).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  expect(await recordStore(page)).toEqual(snapshot);
});

test('@hosted full-width receipt tabs remain keyboard accessible at phone width and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '/dashboard');
  const trigger = page.getByTestId('request-field-preview').getByRole('button', { name: 'Inspect request', exact: true });
  const identity = await page.getByTestId('request-field-preview').locator('.rqf-preview-top code').innerText();
  await trigger.click();
  const receipt = await expectInPageReceipt(page, identity);
  await receipt.getByRole('tab', { name: 'Evidence', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(receipt.getByRole('tab', { name: 'Configuration', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(receipt.locator('.snapshot-details')).toContainText('Recorded demo snapshot');
  await page.keyboard.press('Home');
  await expect(receipt.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await receipt.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(receipt).toBeHidden();
});

test('request details use the full shared canvas across five widths and both themes', async ({ page }, info) => {
  test.setTimeout(90_000);
  await ready(page, '/monitor');
  const snapshot = await recordStore(page);
  const selected = snapshot.find((record: { status: string }) => record.status === 'recovered');
  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 1000 });
    for (const theme of ['light', 'dark']) {
      await page.goto(`/monitor?request=${encodeURIComponent(selected.id)}`);
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      const receipt = await expectInPageReceipt(page, selected.id);
      const back = receipt.getByRole('button', { name: 'Back to Logs', exact: true });
      const target = await back.boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => document.fonts.ready);
      // Capture the settled theme, including WebKit's color transition frame.
      await page.waitForTimeout(250);
      await page.screenshot({ path: `artifacts/cohesion-pass/${info.project.name}/request-details-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
      await back.click();
      await expect(receipt).toBeHidden();
    }
  }
  expect(await recordStore(page)).toEqual(snapshot);
});

test('@hosted a request moves from Overview evidence into its exact filtered log row without reopening an inspection loop', async ({ page }) => {
  await ready(page, '/dashboard');
  const snapshot = await recordStore(page);
  const preview = page.getByTestId('request-field-preview');
  const identity = await preview.locator('.rqf-preview-top code').innerText();
  await preview.getByRole('button', { name: 'Inspect request', exact: true }).click();
  const receipt = await expectInPageReceipt(page, identity);
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?request=${identity}$`));
  await receipt.getByRole('button', { name: 'View this request in Monitoring', exact: true }).click();
  await expect(receipt).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/monitor\\?q=${identity}$`));
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const row = page.locator('tbody .request-link');
  await expect(row).toHaveAttribute('title', identity);
  await row.click();
  await expectInPageReceipt(page, identity);
  await expect(receipt.getByRole('button', { name: 'View this request in Monitoring', exact: true })).toHaveCount(0);
  await receipt.getByRole('button', { name: 'Back to Logs', exact: true }).click();
  await expect(row).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/monitor\\?q=${identity}$`));
  expect(await recordStore(page)).toEqual(snapshot);
});

test('@hosted cancelled receipts show their observed duration and no-attempt failures show only recorded evidence', async ({ page }) => {
  await ready(page, '/playground');
  await page.clock.install({ time: new Date('2026-10-15T18:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-15T18:00:01Z'));
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(800);
  await page.getByRole('button', { name: 'Stop request', exact: true }).click();
  const cancelled = (await recordStore(page))[0];
  expect(cancelled.status).toBe('cancelled');
  const observedDuration = getReplayDuration(cancelled);
  expect(observedDuration).toBe(800);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  let receipt = await expectInPageReceipt(page, cancelled.id);
  await expect(receipt.locator('.receipt-values > div').filter({ has: page.getByText('Observed', { exact: true }) }).locator('strong')).toHaveText(`${observedDuration} ms`);
  await expect(receipt.locator('.rt-root')).toHaveAttribute('data-position-ms', String(observedDuration));
  await receipt.getByRole('button', { name: 'Back to Playground', exact: true }).click();
  await openRequestConditions(page);
  await page.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption('invalid-key');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  const failed = (await recordStore(page))[0];
  expect(failed.status).toBe('failed');
  expect(failed.attempts).toEqual([]);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  receipt = detail(page);
  await expect(receipt).toBeVisible();
  await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', failed.id);
  await expect(receipt.locator('.rt-root')).toHaveAttribute('data-request-id', failed.id);
  await expect(receipt.getByRole('group', { name: 'Timing colors', exact: true })).toHaveCount(0);
  await expect(receipt.locator('.rt-axis')).toBeHidden();
  const escaped = failed.response.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(receipt.locator('p:visible').filter({ hasText: new RegExp(`^${escaped}$`) })).toHaveCount(1);
});
