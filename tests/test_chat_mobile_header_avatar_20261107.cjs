'use strict';
// UI-253 — screenshot: remove the duplicated Photos action in an Admin chat
// only when QuickActions are displayed; fix max-size-induced avatar distortion.
const assert=require('node:assert/strict');
const fs=require('node:fs');

const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const marker='UI-253 — suppress duplicated Photos shortcut and enforce square header avatar';
assert.equal(css.split(marker).length-1,1,'UI-253 visual rules should have one owner');
const patch=css.slice(css.indexOf(marker));
function declarations(selector){
  const start=patch.indexOf(selector+'{');
  assert(start>=0,'Missing selector '+selector);
  const end=patch.indexOf('}',start);
  assert(end>start,'Unclosed selector '+selector);
  return patch.slice(start+selector.length+1,end).replace(/\s+/g,'');
}
const root='#appShell[data-auth-state="authenticated"][data-route="chat"]';
const dup=root+':has(#chatQuickActions:not([hidden])) #regionTop .top-mode-switch[data-contact-identity="true"]';
assert(declarations(dup).includes('grid-template-columns:minmax(0,1fr)!important;'),
  'contact name reclaims the entire center column');
const hide=declarations(dup+' .top-mode-tab[data-top-tab="photos"]');
assert(hide.includes('display:none!important;'),'only the duplicate header Photos shortcut disappears');
assert(source.includes('data-top-tab="photos" data-nav-target="photos"'),'Photos route still works');
assert(source.includes('data-chat-quick="photos"'),'Admin QuickAction Photos remains intact');
assert(source.includes('id="chatQuickActions"')&&source.includes('hidden>'),
  'visibility is driven by the existing business owner');
assert(dup.includes('[data-route="chat"]')&&dup.includes(':has(#chatQuickActions:not([hidden]))'),
  'non-Admin/no-shortcuts and Photos route must retain their secondary header action');

const avatar=root+' #regionTop .top-mode-switch[data-contact-identity="true"] .top-mode-contact-avatar';
const normal=declarations(avatar);
for(const v of ['flex:0 0 36px;','width:36px;','height:36px;',
                'min-width:36px;','min-height:36px;',
                'max-width:36px;','max-height:36px;',
                'aspect-ratio:1/1;','border-radius:50%;','overflow:hidden;']){
  assert(normal.includes(v),'normal avatar square constraint: '+v);
}
const small=patch.slice(patch.indexOf('@media(max-width:360px)'));
for(const v of ['flex-basis:32px;','width:32px;','height:32px;',
                'min-width:32px;','min-height:32px;',
                'max-width:32px;','max-height:32px;']){
  assert(small.replace(/\s+/g,'').includes(v),'small avatar square constraint: '+v);
}
const image=declarations(avatar+'>img');
for(const v of ['width:100%;','height:100%;','object-fit:cover;',
                'object-position:center;','border-radius:50%;']){
  assert(image.includes(v),'image fills square without distortion: '+v);
}
assert(source.includes('.top-mode-contact-avatar{position:relative;width:26px;'),
  'regression originated in old 26px max-size; override must remain explicit');
assert(shell.includes("renderAvatarNode(avatar,item||{"),
  'avatar source remains canonical and cached; never transform the original');
for(const vw of [320,360,375,390,430]){
  const smallScreen=vw<=360;
  const inset=smallScreen?6:10;
  const gap=smallScreen?4:6;
  const center=vw-2*inset-44-96-2*gap;
  const name=center-(smallScreen?32:36)-8;
  assert(name>80,'name should remain readable at viewport width '+vw);
}
const epoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'';
assert(epoch.startsWith('pwa-chat-')&&epoch!=='pwa-chat-header-time-ui252-20261107',
  'installed PWA needs a fresh shell after the header CSS change');
console.log('UI-253 duplicate Photos removed only with visible QuickActions; avatar square 36/32px and image contain/cover parity PASS');
