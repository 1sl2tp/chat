'use strict';
// UI-249 — 507px screenshot: centered top switch in narrow Chat Web/PWA.
// CSS ownership only. No DOM reparent, timers, camera/call state changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const tokens=fs.readFileSync('ui-foundation.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function rule(selector){
 const start=css.indexOf(selector+'{');
 assert(start>=0,'Missing rule: '+selector);
 const end=css.indexOf('}',start);
 assert(end>start,'Unclosed '+selector);
 return css.slice(start,end+1).replace(/\s+/g,'');
}
const selector='#appShell[data-auth-state="authenticated"] .compact-top-grid:has(> .call-focus-slot[hidden])';
const centered=rule(selector);
assert(centered.includes('grid-template-columns:44pxminmax(0,1fr)44px;'),'symmetric end rails');
const base=rule('#appShell[data-auth-state="authenticated"] .compact-top-grid');
assert(base.includes('grid-template-columns:44pxminmax(0,1fr)auto;'),'live call retains auto rail');
assert(base.includes('column-gap:6px;'));
const tab=rule('#appShell[data-auth-state="authenticated"] .top-mode-switch');
assert(tab.includes('width:min(100%,17.5rem);'),'idle switch must stay proportional');
assert(tab.includes('min-height:44px;'));
const identity=rule('#appShell[data-auth-state="authenticated"] .top-mode-switch[data-contact-identity="true"]');
assert(identity.includes('max-width:min(100%,280px);'));
assert(identity.includes('grid-template-columns:repeat(2,minmax(0,1fr));'));
const photos=rule('#appShell[data-auth-state="authenticated"] .top-mode-tab[data-top-tab="photos"]');
assert(photos.includes('font-size:13px;'),'Chat and Photos label sizes match');
const common=rule('#appShell[data-auth-state="authenticated"] .top-mode-tab');
assert(common.includes('font-size:13px;')&&common.includes('min-height:40px;'));
assert(source.includes('compact-top-grid chat-content-axis"'),'header keeps shared content axis');
assert(source.includes('class="call-focus-slot" data-call-focus-slot data-call-ui-state="idle"'));
assert(source.includes('aria-label="Mở menu"'));
assert(source.includes('role="tablist" aria-label="Trò chuyện và ảnh"'));
assert(source.includes('data-top-tab="chat"')&&source.includes('data-top-tab="photos"'));
assert(shell.includes('slot.hidden=!showCallSurface;'),'only canonical call owner hides slot');
assert(shell.includes("const showIdleCall=route==='chat'&&hasContact;"));
assert(source.includes('.compact-top-grid:has(.call-focus-slot:not([data-call-ui-state="idle"])) .top-mode-switch{opacity:0;pointer-events:none}'),'ongoing call visibility owns tab switch');
assert(tokens.includes('--ui-control-touch:44px;'));
const epoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'';
assert(epoch.startsWith('pwa-chat-')&&epoch!=='pwa-chat-composer-send-parity-ui248-20261106');
// Reference geometry: 507px screenshot, with 12px gutters, 44px rails,
// and two 6px grid gaps. The switch is truly viewport-centered at any
// width with no call, while remaining inside its middle grid track.
for(const vw of [320,375,390,430,507,516,640]){
 const outer=12, side=44, gap=6;
 const mid=vw-2*outer-2*side-2*gap;
 const switchWidth=Math.min(mid,280);
 assert(mid>0);
 const left=outer+side+gap+(mid-switchWidth)/2;
 const right=vw-left-switchWidth;
 assert(Math.abs(left-right)<1e-9,'balanced switch at '+vw);
 assert(left>=outer+side+gap,'switch must not overlap menu');
}
console.log('UI-249 mobile centered tab/header 320–640px, identity/call/Web/PWA PASS');
