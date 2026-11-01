'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

// SPEC-CHAT-ACCOUNT-SETTING-CARD-GRID-20261102
// Wide modal: two-column compact card grid, Agribank spanning final row.
// Narrow iPhone: one column. Never change permissions, data or keyboard owner.
const css=fs.readFileSync('zalo-admin-link.css','utf8');
const js=fs.readFileSync('zalo-admin-link.js','utf8');
const policy=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const compact=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,'');
assert(css.includes('SPEC-CHAT-ACCOUNT-SETTING-CARD-GRID-20261102'));
const grid=compact.match(/\.zalo-account-preferences\{([^}]*)\}/);
assert(grid,'preferences owner must exist');
assert(grid[1].includes('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'));
assert(grid[1].includes('align-content:start;align-items:stretch;gap:8px;'));
assert(grid[1].includes('max-height:min(34svh,300px)'));
assert(grid[1].includes('overflow-y:auto;overscroll-behavior:contain'));
assert(compact.includes('.zalo-account-preferences.zalo-account-notification:last-child{grid-column:1/-1;}'));
assert(compact.includes('.zalo-account-preferences.zalo-account-notification{flex:none;display:grid;grid-template-columns:minmax(0,1fr)auto;'));
assert(compact.includes('min-height:66px'));
assert(compact.includes('max-width:156px;min-width:0;min-height:40px;'));

const mobile=compact.slice(compact.indexOf('@media(max-width:640px){'));
assert(mobile.includes('.zalo-account-preferences{max-height:min(34svh,280px);grid-template-columns:minmax(0,1fr);gap:7px;}'));
assert(mobile.includes('.zalo-account-preferences.zalo-account-notification:last-child{grid-column:1}'));
assert(mobile.includes('.zalo-account-preferences.zalo-account-notification{min-height:60px}'));

const modal=js.slice(js.indexOf('  accountModal.innerHTML='+String.fromCharCode(96)),
  js.indexOf('  host.appendChild(accountModal);'));
assert(modal.length>2000);
for(const name of [
  'data-admin-push-setting','data-admin-friend-setting','data-admin-device-setting',
  'data-admin-auto-collect-setting','data-admin-agribank-pair',
  'data-admin-push-action','data-admin-friend-open','data-admin-device-open',
  'data-admin-auto-collect-action','data-admin-agribank-issue'
])assert.equal(modal.split(name).length-1,1,'single admin control '+name);
assert(modal.indexOf('data-admin-agribank-pair')>modal.indexOf('data-admin-auto-collect-setting'));
for(const selector of ['data-zalo-account-directory-status','data-zalo-account-unassigned',
  'data-zalo-account-search','data-zalo-account-list']){
  assert(modal.includes(selector),'retained linked accounts directory '+selector);
}
for(const action of ["action:'admin_snapshot'","action:'create_and_link'","action:'unlink'"])
  assert(js.includes(action),'unchanged permission/flow '+action);
assert(css.includes('.zalo-account-modal[data-mobile-keyboard="true"]:has([data-zalo-account-search]:focus) .zalo-account-preferences'));
assert(policy.includes("kind:'account-settings'"));
console.log('CHAT compact account settings cards, mobile keyboard and Zalo actions PASS');
