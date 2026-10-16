import { test, expect } from '@playwright/test';

test('focused Playground reference remains readable and actionable across sizes and themes', async ({ page }, info) => {
  for (const theme of ['light', 'dark']) for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    await page.addInitScript(theme => localStorage.setItem('gateway-theme', theme), theme);
    await page.goto('/playground');
    await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
    await expect(page.locator('main h1')).toHaveText('Playground');
    await expect(page.getByRole('navigation', { name: 'Connection workspace' })).toHaveCount(0);
    const run = await page.getByRole('button', { name: 'Run request', exact: true }).boundingBox();
    expect(run!.height).toBeGreaterThanOrEqual(44);
    expect(run!.y + run!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect(page.locator('.ew-fixture details[open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const promptFont = await page.locator('#workspace-prompt').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(promptFont).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: `artifacts/visual-workspaces/${info.project.name}/playground/idle-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
  }
});

test('recovery and inspection expose evidence before optional commentary', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/playground');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install();
  await page.getByRole('button', { name: 'Run request', exact: true }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Test recovery', exact: true }).click();
  await page.clock.runFor(10000);
  await expect(page.locator('.ew-response-receipt')).toContainText('Recovered');
  await expect(page.locator('.ew-observatory .rt-attempt--failed')).toHaveCount(1);
  await expect(page.locator('.ew-observatory .rt-attempt--success')).toHaveCount(1);
  await page.screenshot({ path: `artifacts/visual-workspaces/${info.project.name}/playground/recovery-desktop.png`, fullPage: true, animations: 'disabled' });
  const inspect = page.getByRole('button', { name: 'Inspect request', exact: true });
  await inspect.click();
  const drawer = page.getByRole('region', { name: 'Request details', exact: true });
  await expect(drawer.locator('.receipt-headline')).toContainText('Recovered');
  await expect(drawer.locator('.drawer-trace')).toBeVisible();
  await expect(drawer.locator('.drawer-workload')).not.toHaveAttribute('open');
  await expect(drawer.locator('.drawer-response')).not.toHaveAttribute('open');
  const positions = await drawer.evaluate(el => ({ trace: el.querySelector('.drawer-trace')!.getBoundingClientRect().top, guidance: el.querySelector('.request-guidance')!.getBoundingClientRect().top }));
  expect(positions.trace).toBeLessThan(positions.guidance);
  await page.screenshot({ path: `artifacts/visual-workspaces/${info.project.name}/playground/recovery-drawer.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(inspect).toBeFocused();
});
