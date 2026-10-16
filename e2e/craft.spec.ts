import { navigateStage, openRouteSettings, showRequestTable, openRequestConditions, closeRouteSettings } from './focused-workspace-helper';
import { expect, test, type Page } from '@playwright/test';

const workspace = (page: Page) => page.getByTestId('evolving-workspace');

async function recover(page: Page) {
  await page.goto('/playground');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
  await openRequestConditions(page);
  await workspace(page).getByRole('checkbox', { name: 'Make preferred provider unavailable', exact: true }).check();
  await workspace(page).getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(workspace(page).locator('.ew-response-receipt')).toContainText('Recovered');
}

test('@hosted captured workload remains available in Routing across focused pages', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await recover(page);
  await navigateStage(page, 'Shape');
  const source = page.getByTestId('working-source');
  const identity = await source.locator('summary code').innerText();
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 1000 });
    for (const stage of ['Try', 'Connect', 'Observe', 'Shape'] as const) {
      await navigateStage(page, stage);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!).sourceId)).toBe(identity);
    }
    const inspect = source.getByRole('button', { name: 'Inspect source', exact: true });
    const bounds = await inspect.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await source.locator('summary').click();
    await expect(source.locator('.ew-source-workload')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(source.locator('summary')).toBeFocused();
  }
});

test('@hosted a recovery foregrounds recorded intervals and its generation endpoint', async ({ page }, testInfo) => {
  await recover(page);
  const trace = workspace(page).locator('.ew-observatory-slot .rt-root');
  await expect(trace.locator('.rt-attempt--failed')).toHaveCount(1);
  await expect(trace.locator('.rt-attempt--success')).toHaveCount(1);
  await expect(trace.locator('.rt-attempts li')).toHaveCount(2);
  await expect(trace.locator('.rt-output')).toBeVisible();
  const cursor = await trace.locator('.rt-output .rt-cursor').boundingBox();
  const generation = await trace.locator('.rt-output .rt-bar').boundingBox();
  expect(Math.abs(cursor!.x - generation!.x - generation!.width)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('focused-recovery.png'), animations: 'disabled' });
  const failed = trace.getByRole('button', { name: /Inspect attempt 1: Anthropic/ });
  await failed.click();
  await expect(failed).toHaveAttribute('aria-pressed', 'true');
  await expect(trace.getByRole('region', { name: 'Selected attempt evidence' })).toContainText('unavailable');
  await expect(trace.locator('.rt-attempt--success')).toHaveCount(0);
  await expect(workspace(page).locator('.ew-observatory')).toHaveAttribute('data-mode', 'replay');
});

test('focused navigation preserves native type scale and reduced motion stops reorder feedback', async ({ page }) => {
  await page.goto('/playground');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  for (const stage of ['Shape', 'Try', 'Shape'] as const) {
    await navigateStage(page, stage);
    const matrix = await workspace(page).locator('.ew-route-slot').evaluate(element => { const value = new DOMMatrixReadOnly(getComputedStyle(element).transform); return { x: value.m11, y: value.m22 }; });
    expect(matrix).toEqual({ x: 1, y: 1 });
  }
  await workspace(page).getByRole('button', { name: 'Move Amazon Bedrock earlier', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => workspace(page).locator('.ew-route-slot').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await expect(workspace(page).locator('.po-row').first()).toContainText('Amazon Bedrock');
});
