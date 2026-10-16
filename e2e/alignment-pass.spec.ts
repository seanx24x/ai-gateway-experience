import { test, expect, type Page } from '@playwright/test';
import { openRequestConditions } from './focused-workspace-helper';
import { reviewSetup } from './setup-helper';

async function ready(page: Page, path: string) {
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(path); await expect(page.locator('.app')).toHaveAttribute('data-demo-ready','true');
}
async function footerAlignment(page: Page, individual = true) {
 const positions = await page.evaluate(() => {
  const cy = (selector: string) => { const b = document.querySelector(selector)!.getBoundingClientRect(); return b.y + b.height / 2; };
  return { identity:cy('.ew-composer-actions > span'), run:cy('.ew-composer-actions > button'), context:cy('.ew-receipt-context'), status:cy('.ew-receipt-context .status-badge'), provider:cy('.ew-receipt-context > span:nth-child(2)'), inspect:cy('.ew-response-receipt > button') };
 });
 for (const value of [positions.identity, positions.context, positions.inspect, ...(individual ? [positions.status, positions.provider] : [])]) expect(Math.abs(value-positions.run), JSON.stringify(positions)).toBeLessThanOrEqual(1);
}

test('@hosted Playground footer alignment survives success, recovery, resized input and validation',async ({page},info)=>{
 await ready(page,'/playground'); await page.clock.install();
 await page.getByRole('button',{name:'Run request',exact:true}).click(); await page.clock.runFor(10000);
 await footerAlignment(page);
 await page.getByRole('button',{name:'Test recovery',exact:true}).click(); await page.clock.runFor(10000);
 for (const width of [1024,1280,1440,1920]) {
  await page.setViewportSize({width,height:1000}); await footerAlignment(page,width>=1280);
  await page.locator('#workspace-prompt').evaluate((el:HTMLTextAreaElement)=>{el.style.height='280px';});
  await footerAlignment(page,width>=1280);
 }
 await page.locator('#workspace-prompt').fill(''); await page.getByRole('button',{name:'Run request',exact:true}).click();
 await expect(page.locator('.ew-request-editor .error-text[role=alert]')).toContainText('Add a prompt'); await footerAlignment(page);
 const alert=await page.locator('.ew-request-editor .error-text[role=alert]').boundingBox();const footer=await page.locator('.ew-composer-actions').boundingBox();
 expect(alert!.y+alert!.height).toBeLessThan(footer!.y);
 await page.screenshot({path:`artifacts/alignment-pass/${info.project.name}/playground-validation.png`,fullPage:true,animations:'disabled'});
});

test('page actions, catalog values, billing connectors and setup choices share alignment rails',async({page},info)=>{
 test.setTimeout(180000);
 for (const width of [360,390,768,1440,1920]) {
  await page.setViewportSize({width,height:width<768?844:1000});
  for (const theme of ['light','dark']) {
   for (const path of ['/','/monitor','/playground','/routes','/dashboard','/budgets','/keys','/byok','/settings','/models','/virtual-models','/leaderboards','/documentation','/connect']) {
    await ready(page,path);
    if(await page.locator('html').getAttribute('data-theme')!==theme) await page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true}).click();
    if(width>=1024){
     const delta=await page.evaluate(()=>{
      const head=document.querySelector('.ew-identity,.ops-heading,.mw-heading');
      const title=head?.querySelector('h1');const action=head?.querySelector(':scope > button,:scope > a,:scope > .ew-primary-action');
      if(!title||!action)return null;const a=title.getBoundingClientRect(),b=action.getBoundingClientRect();if(!b.height)return null;
      return Math.abs(a.y+a.height/2-(b.y+Math.min(b.height,44)/2));
     });if(delta!==null)expect(delta,`${path} heading/action`).toBeLessThanOrEqual(1);
    }
    if(path==='/models'&&width>=768){
     const deltas=await page.locator('.mw-model-row').evaluateAll(rows=>rows.map(row=>{const mid=(s:string)=>{const b=row.querySelector(s)!.getBoundingClientRect();return b.y+(s==='.mw-model-title'?Math.min(b.height,parseFloat(getComputedStyle(row.querySelector(s)!).lineHeight)):b.height)/2;};return Math.abs(mid('.mw-model-title')-mid('.mw-price-cell'));}));
     for(const delta of deltas)expect(delta).toBeLessThanOrEqual(1);
    }
    if(path==='/byok'&&width>=1024){
     const values=await page.locator('.byok-path-step strong,.byok-path-icon,.byok-path-arrow').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return b.y+b.height/2;}));
     expect(Math.max(...values)-Math.min(...values)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/alignment-pass/${info.project.name}/${path.slice(1)||'home'}-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
   }
  }
 }
 await page.setViewportSize({width:1440,height:1000});await ready(page,'/connect');await reviewSetup(page);
 const fields=await page.locator('.se-review-summary .se-context-value').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().x));
 expect(fields).toHaveLength(2);expect(Math.abs(fields[0]-fields[1])).toBeLessThanOrEqual(1);
});

test('completed Playground rows remain aligned within each panel when stacked',async({page},info)=>{
 await ready(page,'/playground');await page.clock.install();await openRequestConditions(page);
 await page.getByRole('combobox',{name:'Simulate a scenario',exact:true}).selectOption('provider-failure');
 await page.getByRole('button',{name:'Run request',exact:true}).click();await page.clock.runFor(10000);
 await page.locator('.ew-fixture > details > summary').click();
 for(const width of [360,390,768,1440,1920]){
  await page.setViewportSize({width,height:width<768?844:1000});
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true}).click();
   if(width>=1024)await footerAlignment(page);
   else {
    const offset=await page.locator('.ew-response-receipt').evaluate(el=>{const c=el.querySelector('.ew-receipt-context')!.getBoundingClientRect();const b=el.querySelector('button')!.getBoundingClientRect();return Math.abs(c.y+c.height/2-b.y-b.height/2);});
    expect(offset).toBeLessThanOrEqual(1);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`artifacts/alignment-pass/${info.project.name}/playground-recovered-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
  }
 }
});
