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
