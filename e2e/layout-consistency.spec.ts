import { test, expect, type Page } from '@playwright/test';

const destinations = [
  { path: '/', section: null, surface: '.discovery-container', title: 'Home' },
  { path: '/connect', section: 'Connect', surface: '.ew-identity', title: 'Connect' },
  { path: '/playground', section: 'Playground', surface: '.ew-identity', title: 'Playground' },
  { path: '/routes', section: 'Routing', surface: '.ew-identity', title: 'Routing' },
  { path: '/monitor', section: 'Logs', surface: '.ew-identity', title: 'Logs' },
  { path: '/dashboard', section: 'Overview', surface: '.ops-heading', title: 'Overview' },
  { path: '/models', section: 'Models', surface: '.mw-heading', title: 'Models' },
  { path: '/virtual-models', section: 'Virtual Models', surface: '.mw-heading', title: 'Virtual Models' },
  { path: '/budgets', section: 'Budgets & Spend', surface: '.ops-heading', title: 'Budgets' },
  { path: '/keys', section: 'API Keys', surface: '.ops-heading', title: 'Keys' },
  { path: '/byok', section: 'Bring Your Own Key', surface: '.ops-heading', title: 'BYOK' },
  { path: '/settings', section: 'Settings', surface: '.ops-heading', title: 'Settings' },
  { path: '/leaderboards', section: 'Leaderboards', surface: '.mw-heading', title: 'Leaderboards' },
  { path: '/documentation', section: 'Documentation', surface: '.mw-heading', title: 'Documentation' },
] as const;

const widths = [360, 390, 768, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const tolerance = 1;

async function checkCanvasAlignment(page: Page, surfaceSelector: string) {
  const frame = page.locator('.overview-opening, main [data-testid="evolving-workspace"], main .workspace-page').first();
  await expect(frame).toBeVisible();
  const geometry = await page.evaluate(() => {
    const bounds = document.body.getBoundingClientRect();
    return { left: bounds.left, width: bounds.width, viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  const gutter = geometry.viewport <= 767 ? 20 : 32;
  const usableWidth = Math.min(1240, geometry.width - gutter * 2);
  const expectedLeft = geometry.left + (geometry.width - usableWidth) / 2;
  const expectedRight = expectedLeft + usableWidth;
  const surface = await frame.locator(surfaceSelector).first().boundingBox();
  expect(surface, 'The dominant working surface must render.').not.toBeNull();
  expect(Math.abs(surface!.x - expectedLeft), 'Working surface should start at the shared content edge.').toBeLessThanOrEqual(tolerance);
  expect(Math.abs(surface!.x + surface!.width - expectedRight), 'Working surface should fill the shared content width.').toBeLessThanOrEqual(tolerance);

  const brand = await page.locator('.app-header .brand-link').boundingBox();
  const footerGroups = page.locator('.app-footer > span, .app-footer > div > span');
  const footerStart = await footerGroups.first().boundingBox();
  const footerEnd = await footerGroups.last().boundingBox();
  expect(brand).not.toBeNull();
  expect(footerStart).not.toBeNull();
  expect(footerEnd).not.toBeNull();
  expect(Math.abs(brand!.x - expectedLeft), 'The header brand aligns with the working surface.').toBeLessThanOrEqual(tolerance);
  expect(Math.abs(footerStart!.x - expectedLeft), 'The footer starts on the shared content edge.').toBeLessThanOrEqual(tolerance);
  // On narrow screens footer groups can stack; each remains inside the shared canvas.
  expect(footerEnd!.x).toBeGreaterThanOrEqual(expectedLeft - tolerance);
  expect(footerEnd!.x + footerEnd!.width).toBeLessThanOrEqual(expectedRight + tolerance);
  if (geometry.viewport >= 768) {
    expect(Math.abs(footerEnd!.x + footerEnd!.width - expectedRight), 'Desktop footer ends on the shared content edge.').toBeLessThanOrEqual(tolerance);
  }
  expect(geometry.scrollWidth, 'The page must not overflow horizontally.').toBeLessThanOrEqual(geometry.viewport);
  await expect(page.locator('main h1:visible')).toHaveCount(1);
}


for (const theme of themes) {
  for (const width of widths) {
    test(`shared layout ${theme} ${width}px across public and product destinations`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: width < 768 ? 800 : 1000 });
      await page.addInitScript(selectedTheme => {
        localStorage.setItem('gateway-theme', selectedTheme);
        localStorage.removeItem('sean-gateway-demo-v2');
      }, theme);

      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const destination of destinations) {
        await test.step(destination.title, async () => {
          await page.goto(destination.path);
          await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.evaluate(() => document.fonts.ready);
          // Let the theme and its CSS transitions settle before visual capture.
          await page.waitForTimeout(250);
          await checkCanvasAlignment(page, destination.surface);
          await expect(page.getByRole('dialog')).toHaveCount(0);

          if (destination.section) {
            const toggle = page.getByRole('button', { name: 'Choose Gateway section', exact: true });
            const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true });
            await expect(toggle).toBeVisible();
            await expect(toggle).toContainText(destination.path === '/routes' ? 'Routing' : destination.section);
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await expect(navigation).toBeHidden();
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await expect(navigation).toBeVisible();
            const current = navigation.locator('[aria-current="page"]');
            await expect(current).toHaveCount(1);
            await expect(current).toHaveText(destination.section);
            await expect(current).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            // Closing the directory restores the working surface without changing location.
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await expect(navigation).toBeHidden();
            await expect(page).toHaveURL(new RegExp(`${destination.path.replaceAll('/', '\\/')}(?:\\?.*)?$`));
          }

          await page.screenshot({
            path: `artifacts/cohesion-pass/${info.project.name}/${destination.path === '/' ? 'home' : destination.path.slice(1)}-${theme}-${width}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        });
      }
      expect(errors, 'All destinations render without runtime errors.').toEqual([]);
    });
  }
}

test('workspace directory is keyboard operable and returns to the working task', async ({ page, browserName }) => {
  await page.goto('/models');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  const toggle = page.getByRole('button', { name: 'Choose Gateway section', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  // WebKit's default macOS preference uses Option-Tab to include links.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main h1')).toHaveText('Overview');
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeHidden();
});


test('shared edges survive the former tablet gutter boundary', async ({ page }) => {
  for (const width of [600, 601, 767, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const destination of destinations.filter(item => ['/', '/connect', '/models'].includes(item.path))) {
      await page.goto(destination.path);
      await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
      await checkCanvasAlignment(page, destination.surface);
    }
  }
});

test('landing guidance follows the working request and support stays optional', async ({ page }, info) => {
  await page.goto('/?tour=1');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  const request = await page.locator('.discovery-demo').boundingBox();
  const guidance = await page.getByRole('complementary', { name: 'Contextual guidance', exact: true }).boundingBox();
  expect(guidance!.y).toBeGreaterThanOrEqual(request!.y + request!.height);
  await expect(page.locator('.discovery-support details[open]')).toHaveCount(0);
  const learn = page.locator('.discovery-definitions summary');
  await learn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.discovery-definitions')).toHaveAttribute('open', '');
  await expect(page.locator('.discovery-definitions')).toContainText('The service that runs that model');
  await page.keyboard.press('Enter');
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.screenshot({ path: `artifacts/layout-refinement/${info.project.name}/home-viewport-light-1440.png`, fullPage: false, animations: 'disabled' });
});
