import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sean-gateway-demo-v2')!));
async function ready(page: Page) {
  await page.goto('/routes');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready','true');
}
test('conditions stay pinned through reorder, reload, testing and stale comparisons', async ({ page }) => {
  await ready(page);
  const count = (await state(page)).requests.length;
  const condition = page.getByRole('region', {name:'Pinned simulation conditions'});
  await expect(condition).toContainText('Anthropic');
  await page.getByRole('button', {name:'Simulate outage for Amazon Bedrock',exact:true}).first().click();
  await expect(condition).toContainText('Amazon Bedrock');
  await page.getByRole('button', {name:'Move Amazon Bedrock earlier',exact:true}).click();
  expect((await state(page)).requests.length).toBe(count);
  await page.reload();
  await expect(condition).toContainText('Amazon Bedrock');
  await page.getByRole('button', {name:'Test draft',exact:true}).click();
  await expect.poll(async () => (await state(page)).requests.length).toBe(count + 2);
  const [draft, baseline] = (await state(page)).requests;
  expect(draft.fixtureId).toBe(baseline.fixtureId);
  expect(draft.attempts.find((a: {provider:string}) => a.provider==='bedrock').status).toBe('failed');
  await page.getByRole('tab',{name:'Route',exact:true}).click();
  await page.getByRole('button',{name:'Restore Amazon Bedrock',exact:true}).first().click();
  await page.getByRole('tab',{name:'Comparison',exact:true}).click();
  await expect(page.locator('.rehearsal-comparison')).toContainText(/stale|changed|test again/i);
  expect((await state(page)).requests.length).toBe(count+2);
});

test('routing composition stays within the shared frame at every size and theme', async ({page}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  for (const width of [360,390,768,1440,1920]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme => { document.documentElement.dataset.theme=theme; },theme);
    const run = page.getByRole('button',{name:'Test draft',exact:true});
    await expect(run).toBeVisible();
    expect((await run.boundingBox())!.y).toBeLessThan(600);
    const dimensions=await page.evaluate(() => ({full:document.documentElement.scrollWidth,width:innerWidth}));
    expect(dimensions.full).toBeLessThanOrEqual(dimensions.width+1);
    const controls = page.locator('.rf-condition:visible');
    for (let i=0;i<await controls.count();i++) {
      const box=(await controls.nth(i).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x+box.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({path:`artifacts/tactile-routing/${info.project.name}-${width}-${theme}.png`,fullPage:true});
  }
});

test('outage controls are independent of inspection and drag, with keyboard and touch targets', async ({page}) => {
  await ready(page);
  const count=(await state(page)).requests.length;
  const outage=page.getByRole('button',{name:'Simulate outage for Amazon Bedrock',exact:true}).first();
  await outage.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('region',{name:'Route settings'})).toBeHidden();
  await expect(page.getByRole('button',{name:'Restore Amazon Bedrock',exact:true}).first()).toBeFocused();
  const handle=page.getByRole('button',{name:'Drag Amazon Bedrock to reorder',exact:true});
  await handle.focus(); await page.keyboard.press('ArrowUp');
  expect((await state(page)).draft.order[0]).toBe('bedrock');
  await expect(handle).toBeFocused();
  await page.locator('.po-row').evaluateAll(rows => Promise.all(rows.flatMap(row => row.getAnimations().map(animation => animation.finished.catch(() => {})))));
  const box=(await handle.boundingBox())!;
  const target=(await page.getByRole('button',{name:'Drag Google Vertex AI to reorder',exact:true}).boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2+20,{steps:12});
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).draft.order.at(-1)).toBe('bedrock');
  await expect(page.getByRole('region',{name:'Pinned simulation conditions'})).toContainText('Amazon Bedrock');
  expect((await state(page)).requests.length).toBe(count);
  await page.getByRole('tab',{name:'Code',exact:true}).click();
  await expect(page.locator('#working-route-panel-code')).not.toContainText(/conditions|outage|unavailable/);
});

test('the connected request journey retains identity at all review sizes', async ({page},info) => {
  test.setTimeout(180000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready','true');
  await page.clock.install();
  async function capture(step:string) {
    for (const width of [360,390,768,1440,1920]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(theme => { document.documentElement.dataset.theme=theme; },theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
      await page.screenshot({path:`artifacts/tactile-journey/${info.project.name}/${step}-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
    }
  }
  await capture('home');
  await page.getByRole('button',{name:'Run a demo request',exact:true}).click();
  await page.clock.runFor(10000);
  await page.getByRole('button',{name:'What if a provider fails?',exact:true}).click();
  await page.clock.runFor(10000);
  const source=(await state(page)).requests[0];
  await capture('recovery');
  await page.getByRole('button',{name:'Adjust this route',exact:true}).click();
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  await capture('route');
  await page.getByRole('button',{name:'Move Amazon Bedrock earlier',exact:true}).click();
  await page.getByRole('button',{name:'Test draft',exact:true}).click();
  await page.clock.runFor(1000);
  await capture('comparison');
  await page.getByRole('button',{name:'Inspect draft receipt',exact:true}).click();
  await expect(page.getByRole('region',{name:'Request details'})).toBeVisible();
  await capture('receipt');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Use this route in your app',exact:true}).click();
  await expect(page.getByTestId('working-source')).toContainText(source.id);
  await capture('connect');
});
