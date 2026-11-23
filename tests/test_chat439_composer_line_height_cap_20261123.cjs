'use strict';
// CHAT-439 — actual mobile auto-grow cap as pure VM-evaluated source.
// No messages, bank records, browser network, DOM writes or real uploads.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const start=app.indexOf('function composerTextHeightLimit(');
const end=app.indexOf('\nfunction autoGrow(',start);
assert(start>0&&end>start,'use actual production composer height helper');
const heightLimit=vm.runInNewContext(app.slice(start,end)+'\ncomposerTextHeightLimit;');
const lineHeights=[40,62,84,106,128,150];
for(const h of lineHeights){
 const cap=heightLimit(900,44,12,22);
 assert.equal(cap,150,'six full lines must fit in a tall viewport');
 assert.equal(Math.min(cap,h),h,'1-6 lines have no fractional clipping: '+h);
}
assert.equal(heightLimit(380,44,12,22),106,'small keyboard viewport yields only four whole lines');
assert.equal(heightLimit(310,44,12,22),84,'compact viewport yields three whole lines');
assert.equal(heightLimit(220,44,12,22),40,'very short visible viewport preserves a readable thread');
assert.equal(heightLimit(900,44,12,22),150,'large viewport yields six lines');
assert.equal(heightLimit(900,44,12,24),136,'CSS typography variations still quantize to full rows');
let previous=0;
for(let viewport=180;viewport<=1000;viewport++){
 const result=heightLimit(viewport,44,12,22);
 assert(lineHeights.includes(result),'cap must always be a whole visible line: '+viewport+'/'+result);
 assert(result>=previous,'cap must grow monotonically with visible viewport');
 const remaining=viewport-44-12-result;
 if(viewport>=240)assert(remaining>=0,'never exceed the visible viewport');
 previous=result;
}
assert(app.includes('Math.abs(rawVisibleHeight-composerStableViewportHeightPx)>=24'),
 'iOS keyboard minor viewport noise must not update the editor cap');
assert(app.includes('KeyboardInsetAdapter.adjustForEditorHeightChange(paintedDelta)'),
 'same-paint bottom compensation must survive multiline changes');
assert(app.includes("if(!composing&&!event.isComposing)autoGrow({source:'typing'})"),
 'Vietnamese IME must not trigger provisional per-key height changes');
assert(css.includes('max-height:150px; /* CHAT-439'),
 'CSS actual max height must permit six lines; JS limit alone is insufficient');
assert(css.includes('grid-template-columns:var(--ui-control-touch,44px) minmax(0,1fr)'),
 'the plus/text/mic/send track widths must not move while typing');
// The release contract is shared across owners, not tied to the version
// current on the day CHAT-439 was introduced. Keep detecting drift while
// allowing an intentional version/cache-epoch bump without editing this test.
const htmlVersion=html.match(/<meta name="app-release-version" content="(V\d+\.\d+\.\d+)">/);
const appVersion=app.match(/releaseVersion:'(V\d+\.\d+\.\d+)'/);
const swVersion=sw.match(/RELEASE_VERSION='(V\d+\.\d+\.\d+)'/);
assert(htmlVersion&&appVersion&&swVersion,
 'all three release owners must expose a well-formed version');
assert.equal(appVersion[1],htmlVersion[1],
 'composer runtime release must match canonical HTML');
assert.equal(swVersion[1],htmlVersion[1],
 'PWA shell release must match canonical HTML');
const shellEpoch=sw.match(/SHELL_CACHE_EPOCH='([^']+)'/);
assert(shellEpoch&&shellEpoch[1].trim(),
 'PWA shell cache epoch must remain explicitly versioned');
console.log('CHAT-439 whole-line mobile composer cap, keyboard stability and release parity PASS');
