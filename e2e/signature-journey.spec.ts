import { test, expect, type Page } from '@playwright/test';
import type { RequestRecord, RoutingConfig } from '../src/lib/gateway';
import { getReplayDuration } from '../src/lib/replay';
import { reviewSetup } from './setup-helper';

async function saved(page: Page): Promise<{ requests: RequestRecord[]; sourceId: string | null; draft: RoutingConfig; ui: {handoffConfig: RoutingConfig} }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!));
}
async function recovery(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
  await page.clock.install();
  const initial = (await saved(page)).requests.length;
  await page.getByRole('button', {name:'Run a demo request', exact:true}).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', {name:'What if a provider fails?', exact:true}).click();
  // Neither the second provider nor its eventual success is exposed early.
  await page.clock.runFor(200);
  await expect(page.locator('.discovery-live-evidence .rt-attempt--success')).toHaveCount(0);
  await page.clock.runFor(10000);
  await expect.poll(async () => (await saved(page)).requests.length).toBe(initial + 2);
  return (await saved(page)).requests[0];
}

test('@hosted signature journey keeps source, fixture and handoff intact; comparison controls create no requests', async ({page}, info) => {
  const source = await recovery(page);
  await expect(page.locator('.discovery-receipt')).toContainText('Same model. Another provider.');
  await page.locator('.discovery-live-evidence .rt-attempt--failed').click();
  await expect(page.locator('.discovery-live-evidence .rt-selection')).toContainText('Anthropic');
  await expect(page.locator('.discovery-live-evidence .rt-attempt--success')).toHaveCount(1);
  await expect(page.locator('.discovery-answer-state')).toContainText('Received');
  await page.getByRole('button', {name:'Inspect request', exact:true}).click();
  await expect(page.getByRole('region', {name:'Request details'}).locator('[data-request-identity]')).toHaveAttribute('data-request-identity', source.id);
  await page.screenshot({path:`artifacts/signature-journey/${info.project.name}/request-inspection.png`, animations:'disabled'});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name:'Inspect request', exact:true})).toBeFocused();
  await page.getByRole('button', {name:'Adjust this route', exact:true}).click();
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  await page.getByRole('button', {name:'Move Amazon Bedrock earlier', exact:true}).click();
  await page.screenshot({path:`artifacts/signature-journey/${info.project.name}/route-edit.png`, fullPage:true, animations:'disabled'});
  const count = (await saved(page)).requests.length;
  await page.getByRole('button', {name:'Test draft', exact:true}).click();
  await page.clock.runFor(1000);
  await expect.poll(async () => (await saved(page)).requests.length).toBe(count + 2);
  const state = await saved(page);
  expect(state.requests).toHaveLength(count + 2);
  const [draft, original] = state.requests;
  expect(draft.fixtureId).toBe(original.fixtureId);
  expect(draft.prompt).toBe(source.prompt);
  expect(draft.sourceId).toBe(source.id);
  const lens = page.getByRole('group', {name:'Compare recorded route'});
  await expect(lens.getByRole('button', {name:'Draft',exact:true})).toHaveAttribute('aria-pressed', 'true');
  const interval = page.locator('.comparison-difference .recorded-interval');
  const scale = String(Math.max(getReplayDuration(original), getReplayDuration(draft)));
  await expect(interval).toHaveAttribute('data-axis-ms', scale);
  await lens.getByRole('button', {name:'Original',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(interval).toHaveAttribute('data-request-id', original.id);
  await expect(interval).toHaveAttribute('data-axis-ms', scale);
  await expect(interval.locator('.ri-row--failed')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(lens.getByRole('button', {name:'Draft',exact:true})).toBeFocused();
  await expect(interval).toHaveAttribute('data-request-id', draft.id);
  await expect(interval.locator('.ri-row--failed')).toHaveCount(0);
  expect((await saved(page)).requests).toHaveLength(count + 2);
  expect((await saved(page)).requests.find(record => record.id === source.id)).toEqual(source);
  await page.getByText('Full comparison', {exact:true}).click();
  await expect(page.locator('.comparison-full .comparison-record')).toHaveCount(2);
  await page.getByRole('button', {name:'Use this route in your app',exact:true}).filter({visible:true}).click();
  await expect(page).toHaveURL(/\/connect/);
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  await reviewSetup(page);
  expect((await saved(page)).ui.handoffConfig.order[0]).toBe('bedrock');
  await page.screenshot({path:`artifacts/signature-journey/${info.project.name}/connect-review.png`, fullPage:true, animations:'disabled'});
  await page.reload();
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  expect((await saved(page)).requests.find(record => record.id === source.id)).toEqual(source);
});

test('signature recovery and difference view remain readable at every required width and theme', async ({page}, info) => {
  const source = await recovery(page);
  for (const theme of ['light','dark']) {
    for (const width of [360,390,768,1440,1920]) {
      await page.setViewportSize({width,height:width < 768 ? 800 : 1000});
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', {name:`Switch to ${theme} theme`}).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.discovery-live-evidence .rt-attempt--failed')).toHaveCount(1);
      await expect(page.locator('.discovery-receipt [data-request-identity]')).toHaveAttribute('data-request-identity', source.id);
      await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
      await page.screenshot({path:`artifacts/signature-journey/${info.project.name}/recovery-${theme}-${width}.png`, fullPage:true, animations:'disabled'});
    }
  }
  await page.getByRole('button', {name:'Adjust this route',exact:true}).click();
  await page.getByRole('button', {name:'Move Amazon Bedrock earlier',exact:true}).click();
  await page.getByRole('button', {name:'Test draft',exact:true}).click();
  await page.clock.runFor(1000);
  for (const theme of ['light','dark']) {
    for (const width of [360,390,768,1440,1920]) {
      await page.setViewportSize({width,height:width < 768 ? 800 : 1000});
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', {name:`Switch to ${theme} theme`}).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.comparison-difference')).toBeVisible();
      const bounds = await page.getByRole('button', {name:'Test draft',exact:true}).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
      await page.screenshot({path:`artifacts/signature-journey/${info.project.name}/comparison-${theme}-${width}.png`, fullPage:true, animations:'disabled'});
    }
  }
});

test('comparison explains an unchanged or unsuccessful draft without claiming a speed improvement', async ({page}) => {
  await recovery(page);
  await page.getByRole('button', {name:'Adjust this route',exact:true}).click();
  await page.getByRole('button', {name:'Test draft',exact:true}).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.comparison-difference')).toContainText('No routing policy change');
  await expect(page.locator('.comparison-heading')).toContainText('Same time to the first token');
  await page.getByRole('button', {name:'Edit route',exact:true}).click();
  const {openRouteSettings} = await import('./focused-workspace-helper');
  await openRouteSettings(page);
  await page.locator('.restriction-editor > summary').click();
  await page.locator('.provider-chips').getByRole('button', {name:'Anthropic',exact:true}).click();
  await page.getByRole('button', {name:'Test draft',exact:true}).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.comparison-heading')).toContainText('This draft could not serve the request');
  await expect(page.locator('.comparison-difference .ri-row--failed')).toHaveCount(1);
  await expect(page.locator('.comparison-difference .ri-generation')).toHaveCount(0);
  await expect(page.locator('.comparison-change-list')).toContainText('Eligible providers');
});

test('field inspection anchors the selected point, survives interrupted motion and restores keyboard focus', async ({page}) => {
  await page.goto('/monitor');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready','true');
  const plot = page.getByTestId('request-field-plot');
  await plot.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const identity = await page.locator('.rqf-preview-top code').innerText();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('region', {name:'Request details',exact:true});
  await expect(drawer.locator('[data-request-identity]')).toHaveAttribute('data-request-identity', identity);
  await expect(page.locator('.rqf-point.is-active')).toHaveAttribute('data-point-request', identity);
  await page.keyboard.press('Escape');
  await expect(plot).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await page.setViewportSize({width:390,height:800});
  await page.keyboard.press('Escape');
  await expect(plot).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready','true');
  await expect(drawer).not.toBeVisible();
  expect(JSON.stringify(await saved(page))).not.toContain('anchorId');
});
