import {test,expect} from '@playwright/test';

// QW-V02: evidence-only visual captures plus hard layout geometry checks.
// This is the anonymous public shell, NOT a logged-in chat or real iPhone.
// Snapshots are archived for future review; pixel-golden comparisons are not
// claimed until an approved, same-OS baseline has been committed.
test.beforeEach(async ({page})=>{
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port==='8765')
   return route.continue();
  return route.abort('blockedbyclient');
 });
});

test('anonymous shell does not horizontally overflow the browser viewport',async({page},testInfo)=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#appShell')).toHaveCount(1);
 const metrics=await page.evaluate(()=>{
  const shell=document.querySelector('#appShell');
  const root=document.querySelector('#scrollRoot');
  const composer=document.querySelector('#composerForm');
  const viewport=Math.round(window.visualViewport?.width||window.innerWidth);
  const content=Math.round(document.documentElement.scrollWidth);
  return{
   viewport,
   content,
   overflowPx:Math.max(0,content-viewport),
   shellCount:document.querySelectorAll('#appShell').length,
   scrollOwnerCount:document.querySelectorAll('#scrollRoot').length,
   composerCount:document.querySelectorAll('#composerForm').length,
   shellPresent:Boolean(shell),
   scrollPresent:Boolean(root),
   composerPresent:Boolean(composer),
   note:'Public unauthenticated shell, remote network blocked; this is not a private conversation test.'
  };
 });
 await testInfo.attach('geometry-'+testInfo.project.name+'.json',{
  body:JSON.stringify(metrics,null,2),contentType:'application/json'
 });
 const shot=await page.screenshot({animations:'disabled',fullPage:false});
 await testInfo.attach('public-shell-'+testInfo.project.name+'.png',{body:shot,contentType:'image/png'});
 expect(metrics.scrollOwnerCount).toBe(1);
 expect(metrics.composerCount).toBe(1);
 expect(metrics.overflowPx,'unexpected horizontal scrolling in the anonymous shell').toBeLessThanOrEqual(8);
});

test('source page has one viewport declaration and no duplicated app owner',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const topology=await page.evaluate(()=>({
  viewportMeta:document.querySelectorAll('meta[name="viewport"]').length,
  shell:document.querySelectorAll('#appShell').length,
  screen:document.querySelectorAll('#chatScreen').length,
  composer:document.querySelectorAll('#composerForm').length,
  globalOverlay:document.querySelectorAll('#globalOverlayRoot').length,
  nestedGlobalOverlay:document.querySelectorAll('#appShell #globalOverlayRoot').length
 }));
 expect(topology).toEqual({
  viewportMeta:1,shell:1,screen:1,composer:1,globalOverlay:1,nestedGlobalOverlay:0
 });
});
