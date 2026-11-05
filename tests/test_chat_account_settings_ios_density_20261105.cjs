'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('zalo-admin-link.css','utf8');
const js=fs.readFileSync('zalo-admin-link.js','utf8');
const marker='SPEC-CHAT-ACCOUNT-IOS-DENSITY-20261105';
assert.equal(css.split(marker).length-1,1,'one scoped iPhone density owner');
const patch=css.slice(css.indexOf(marker));
for(const selector of [
 '.zalo-account-modal[data-active-tab="settings"] .zalo-account-preferences .zalo-account-notification',
 '.zalo-account-modal[data-active-tab="settings"] .zalo-account-notification-action',
 '.zalo-account-modal .zalo-account-row',
 '.zalo-account-modal .zalo-account-row-actions',
 '.zalo-account-modal .zalo-account-list',
 '.zalo-account-modal .zalo-account-search'
])assert(patch.includes(selector),'missing compact selector '+selector);
assert(patch.includes('@media(max-width:640px)'));
assert(patch.includes('@media(max-width:380px)'));
assert(patch.includes('grid-template-columns:minmax(0,1fr) auto;'));
assert(patch.includes('grid-template-columns:minmax(0,1fr);'));
assert(patch.includes('max-width:100%'));
for(const control of [
 'data-admin-push-action','data-admin-friend-open','data-admin-device-open',
 'data-admin-agribank-issue','data-admin-auto-collect-action'
])assert(js.includes(control),'must retain original admin control '+control);
console.log('iPhone account settings density CSS contract OK');

// Both tab panes own independent scroll state; reopening must start at top.
assert(js.includes("const activePane=name==='settings'?settings:links;"));
assert(js.includes('activePane.scrollTop=0;'));
assert(js.includes('if(inner)inner.scrollTop=0;'));

const overlapPatch=css.slice(css.indexOf('FIX-ACCOUNT-MOBILE-NO-OVERLAP-20261105'));
assert(overlapPatch.includes('display:flex;flex:1 1 auto;flex-direction:column'));
assert(overlapPatch.includes('>.zalo-account-notification{'));
assert(overlapPatch.includes('height:auto;min-height:0;max-height:none;'));
assert(overlapPatch.includes('position:static;display:inline-flex;'));
assert(overlapPatch.includes('padding:3px 3px 16px;'));


// Latest override must actually restore compact two-column actions on short
// cards, not silently let the older narrow-screen column layout win.
assert(overlapPatch.includes('grid-template-columns:minmax(0,1fr) auto;'),
  'short setting cards must keep their action in the same row');
assert(overlapPatch.includes('>[data-admin-agribank-pair]')&&
  overlapPatch.includes('>[data-admin-auto-collect-setting]'),
  'long financial setting cards must retain full-width descriptions');
assert(overlapPatch.includes('padding:8px 3px calc(20px + env(safe-area-inset-bottom,0px))'),
  'scrollable preferences must expose first card and last safe-area action');
assert(overlapPatch.includes('max-width:138px;min-height:40px'),
  'compact actions must be touch-sized and bounded in width');
assert(overlapPatch.includes('.zalo-account-modal[data-active-tab="links"] .zalo-account-row{'),
  'the Chat–Zalo card density must be scoped to the links tab');
assert(overlapPatch.includes('min-height:40px;padding:7px 11px;'),
  'Zalo link actions must preserve comfortable touch targets');
assert(overlapPatch.includes('@media(max-width:360px)'),
  'narrow phones need a safe single-column fallback');
const sw=fs.readFileSync('sw.js','utf8');
assert(sw.includes('pwa-chat-account-settings-compact-v2-20261105'),
  'installed PWA must receive a fresh shell cache epoch');
