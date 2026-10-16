import { test, expect, type Page } from '@playwright/test';
import { openRequestConditions, showRequestTable, openRouteSettings, closeRouteSettings } from './focused-workspace-helper';
import { reviewSetup } from './setup-helper';
import { DISCOVERY_RESPONSE, DISCOVERY_PROMPT } from '../src/lib/discovery';

const key = 'sean-gateway-demo-v2';
async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
}

test('@hosted authentication and budget investigations return to the exact receipt after refresh', async ({ page }) => {
  await ready(page, '/playground');
  await page.clock.install();
  for (const [scenario, action, destination] of [['invalid-key', 'Review API key setup', 'connect'], ['budget', 'Review budget guidance', 'budgets']] as const) {
    await ready(page, '/playground');
    await openRequestConditions(page);
    await page.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption(scenario);
    await page.getByRole('button', { name: 'Run request', exact: true }).click();
    await page.clock.runFor(10000);
    await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
    const receipt = page.getByRole('region', { name: 'Request details', exact: true });
    const id = await receipt.locator('[data-request-identity]').getAttribute('data-request-identity');
    const sourceHref = new URL(page.url()).pathname + new URL(page.url()).search;
    const before = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).requests, key);
    await receipt.getByRole('button', { name: action, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${destination}`));
    const origin = page.getByRole('navigation', { name: 'Investigation context' });
    await expect(origin).toContainText(id!);
    await page.reload();
    await expect(origin).toContainText(id!);
    await origin.getByRole('button', { name: 'Back to request', exact: true }).click();
    await expect(receipt).toBeVisible();
    await expect(receipt.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', id!);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(sourceHref);
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).requests, key)).toEqual(before);
  }
});

test('@hosted Logs continuation is scoped to visible requests and has no stale global recovery link', async ({ page }) => {
  await ready(page, '/monitor');
  await showRequestTable(page);
  const guidance = page.getByRole('complementary', { name: 'Contextual guidance', exact: true });
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('success');
  await expect(guidance).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('recovered');
  const first = await page.locator('tbody .request-link').first().getAttribute('title');
  await guidance.getByRole('button', { name: 'Inspect a recovered request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Request details', exact: true }).locator('[data-request-identity]')).toHaveAttribute('data-request-identity', first!);
});

test('@hosted copied editor work reveals real verification instructions and a separate demo continuation', async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }));
  await ready(page, '/connect');
  await reviewSetup(page);
  const verification = page.getByRole('region', { name: 'Verify in your own environment', exact: true });
  await expect(verification).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
  await expect(verification).toContainText('Prepared. Ready to verify in your app.');
  await expect(verification).toContainText('do not verify a connection');
  await verification.getByRole('button', { name: 'Try this workload in the demo', exact: true }).click();
  await expect(page).toHaveURL(/\/playground$/);
  await expect(page.getByRole('button', { name: 'Stop request', exact: true })).toBeVisible();
});

test('selected continuations retain target size and reduced-motion behavior across themes and widths', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [360,390,768,1440,1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const theme of ['light','dark']) {
      for (const path of ['/models?model=anthropic%2Fclaude-sonnet-4.6', '/virtual-models?alias=support-agent', '/leaderboards']) {
        await ready(page, path);
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        const next = page.getByRole('region', { name: 'Continue your work', exact: true }).first();
        await expect(next).toBeVisible();
        const button = next.getByRole('button').first();
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await next.evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
        await page.screenshot({ path: `artifacts/connected-quality/${info.project.name}/${path.split('?')[0].slice(1)}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
    }
  }
});


test('@hosted failed drafts require correction and changed code exposes the exact preference change', async ({ page }) => {
  await ready(page, '/routes');
  await page.clock.install();
  await openRouteSettings(page);
  await page.locator('.restriction-editor > summary').click();
  await page.locator('.provider-chips').getByRole('button', { name: 'Anthropic', exact: true }).click();
  await page.locator('.fallback-editor > summary').click();
  await page.getByRole('checkbox', { name: 'Enable fallback model', exact: true }).uncheck();
  await closeRouteSettings(page);
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  const changes = page.locator('#working-route-panel-code [data-code-change]');
  await expect(changes).not.toHaveCount(0);
  await expect(changes).toContainText(['"only"']);
  await page.getByRole('button', { name: 'Test draft', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.ew-route-status')).toContainText('did not complete');
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use this route in your app', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit route', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Route', exact: true })).toHaveAttribute('aria-selected', 'true');
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  expect(saved.pending).toBeNull();
  expect(saved.active.revision).toBe(1);
});

test('recovery keeps keyboard focus on the interruptible request control', async ({ page }) => {
  await ready(page, '/playground');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Test recovery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop request', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Stop request', exact: true }).press('Enter');
  await page.clock.runFor(10000);
  await expect(page.getByRole('region', { name: 'Continue your work', exact: true })).toContainText('receipt keeps the evidence');
});


test('@hosted the prepared support task keeps its exact answer through recovery', async ({ page }) => {
  await ready(page, '/playground');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.locator('.ew-response-output')).toHaveText(DISCOVERY_RESPONSE);
  await page.getByRole('button', { name: 'Test recovery', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.locator('.ew-response-output')).toHaveText(DISCOVERY_RESPONSE);
  const result = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).requests[0], key);
  expect(result.status).toBe('recovered');
  expect(result.prompt).toBe(DISCOVERY_PROMPT);
  expect(result.response).toBe(DISCOVERY_RESPONSE);
});
