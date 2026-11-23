import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// No real credentials, production origin, Web Push, chat sends, bill/payment
// RPC, or Supabase calls are permitted in this suite.
test.beforeEach(async ({page})=>{
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port==='8765')
   return route.continue();
  // Abort every remote resource/request, including auth, realtime and media.
  return route.abort('blockedbyclient');
 });
});

test('public shell mounts one original chat composition without API access',async({page},testInfo)=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 for(const selector of [
  '#appShell','#chatScreen','#stageLayout','#scrollRoot',
  '#composerForm','#composerShell','#editor','#globalOverlayRoot'
 ]){
  await expect(page.locator(selector),selector).toHaveCount(1);
 }
 await expect(page.locator('#appShell #globalOverlayRoot')).toHaveCount(0);
 const snapshot=await page.evaluate(()=>({
  viewport:document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
  layoutWidth:document.documentElement.scrollWidth,
  visualWidth:window.innerWidth,
  scrollOwners:document.querySelectorAll('#scrollRoot').length,
  composerCount:document.querySelectorAll('#composerForm').length,
 }));
 await testInfo.attach('anonymous-shell-metrics.json',{
  body:JSON.stringify(snapshot,null,2),contentType:'application/json'
 });
 await page.screenshot({path:testInfo.outputPath('anonymous-shell.png'),animations:'disabled'});
});

test('axe-core collects an accessibility baseline on local unauthenticated shell',async({page},testInfo)=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#appShell')).toHaveCount(1);
 const report=await new AxeBuilder({page}).withTags([
  'wcag2a','wcag2aa','wcag21a','wcag21aa'
 ]).analyze();
 const summary={
  page:'anonymous localhost shell (all external network blocked)',
  violations:report.violations.map(v=>({
   id:v.id,impact:v.impact,description:v.description,affected:v.nodes.length,
   selectors:v.nodes.slice(0,5).map(node=>node.target)
  })),
  incomplete:report.incomplete.length,
  passes:report.passes.length
 };
 await testInfo.attach('axe-accessibility-report.json',{
  body:JSON.stringify(summary,null,2),contentType:'application/json'
 });
 // Initial baseline is report-only. No success claim about accessibility
 // until each verified issue has an owner, fix, and a regression assertion.
 expect(Array.isArray(summary.violations)).toBe(true);
});
