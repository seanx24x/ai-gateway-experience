import { expect, test } from '@playwright/test';
import { navigateStage } from './focused-workspace-helper';

test.use({ baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317' });

for (const width of [390, 1440]) {
  test(`@hosted route settings stay in page and return focus to their opener at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/routes');
    await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
    const context = page.getByRole('region', { name: 'Route settings', exact: true });
    const settings = page.getByRole('button', { name: 'Route settings', exact: true });
    const route = page.locator('.ew-route-slot');
    await expect(page.getByRole('button', { name: 'Test draft', exact: true })).toBeInViewport();
    await expect(context).toBeHidden();

    const provider = page.locator('.rf-provider-button').first();
    await provider.focus();
    await page.keyboard.press('Enter');
    await expect(context).toBeVisible();
    await expect(context).toBeFocused();
    await expect(context).toContainText('Anthropic');
    const geometry = await page.locator('.ew-inspector-slot').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const routeBounds = document.querySelector('.ew-route-slot')!.getBoundingClientRect();
      return { left: bounds.left, width: bounds.width, top: bounds.top, routeLeft: routeBounds.left, routeWidth: routeBounds.width, routeBottom: routeBounds.bottom, position: getComputedStyle(element).position };
    });
    expect(geometry.left).toBeCloseTo(geometry.routeLeft, 0);
    expect(geometry.width).toBeCloseTo(geometry.routeWidth, 0);
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.routeBottom);
    expect(geometry.position).toBe('static');
    await expect(page.getByRole('dialog', { name: 'Route settings', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(context).toBeHidden();
    await expect(provider).toBeFocused();

    const model = route.locator('.rf-model-button').first();
    await model.click();
    await expect(context).toBeVisible();
    await expect(context).toContainText('Claude Sonnet 4.6');
    await page.getByRole('button', { name: 'Close route settings', exact: true }).click();
    await expect(model).toBeFocused();

    await settings.click();
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: testInfo.outputPath(`route-context-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Close route settings', exact: true }).click();
    await expect(settings).toBeFocused();
    await settings.click();
    await navigateStage(page, 'Connect');
    await navigateStage(page, 'Shape');
    await expect(settings).toHaveAttribute('aria-expanded', 'false');
    await expect(context).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
