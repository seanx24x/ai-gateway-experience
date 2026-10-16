import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { reviewSetup } from './setup-helper';
import { openRequestConditions, showRequestTable } from './focused-workspace-helper';

async function capture(page: Page, info: TestInfo, state: string) {
  for (const width of [360,390,768,1440,1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/connected-quality/${info.project.name}/${state}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
}

test('review result-to-recovery and scoped investigation compositions', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/playground');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Test recovery', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.getByRole('region', { name: 'Continue your work' })).toContainText('another route');
  await capture(page, info, 'recovery-continuation');
  await openRequestConditions(page);
  await page.getByRole('combobox', { name: 'Simulate a scenario', exact: true }).selectOption('budget');
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
  await page.getByRole('button', { name: 'View this request in Monitoring', exact: true }).click();
  await showRequestTable(page);
  await page.getByRole('combobox', { name: 'Request status', exact: true }).selectOption('failed');
  await page.locator('tbody .request-link').click();
  const exact = page.url();
  await page.getByRole('button', { name: 'Review budget guidance', exact: true }).click();
  await page.getByText('Why this step?', { exact: true }).click();
  await capture(page, info, 'budget-investigation');
  await page.reload();
  await page.getByRole('button', { name: 'Back to request', exact: true }).click();
  await expect(page).toHaveURL(exact);
  await expect(page.getByRole('region', { name: 'Request details', exact: true })).toBeVisible();
});

test('review prepared verification without an inferred successful connection', async ({ page, context }, info) => {
  test.setTimeout(90000);
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }));
  await page.goto('/connect');
  await reviewSetup(page);
  await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Verify in your own environment', exact: true })).toBeVisible();
  await capture(page, info, 'prepared-verification');
});
