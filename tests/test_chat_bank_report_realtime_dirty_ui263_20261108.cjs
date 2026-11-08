'use strict';
// UI-263 - only established Admin confirmations make an open report dirty.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sync=fs.readFileSync('v21-sync-engine.js','utf8');
const report=fs.readFileSync('bank-report-dashboard.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const start=sync.indexOf('function isBankReportDirtyMessage(clientId){');
const end=sync.indexOf('async function applyMessageEvent(',start);
assert(start>0&&end>start,'isolate the existing sync owner');
const sandbox=vm.createContext({});
vm.runInContext(sync.slice(start,end)+'globalThis.check=isBankReportDirtyMessage;',sandbox);
const check=sandbox.check;
assert(check('taphoa:bank-report:2026-10-19:initial'));
assert(check('taphoa:f042154a-8fb9-4b72-98c8-324c9b36bc10:collection'));
assert(check('taphoa:bank-manual:12345:collection'));
for(const key of ['',null,'taphoa:other:collection','taphoa:bank-manual:any:collection','taphoa:f042154a-8fb9-4b72-98c8-324c9b36bc10:order']){
  assert(!check(key),'only bank confirmations can mark report dirty '+key);
}
assert(sync.includes("if(own&&authSnapshot()?.account?.role==='admin'&&isBankReportDirtyMessage(payload.client_id)){"),
  'a user should not spam Admin report reads by spoofing a client ID');
assert(sync.includes("document.dispatchEvent(new CustomEvent('v21-bank-report-dirty'"),'existing dirty event retained');
assert(report.includes("document.addEventListener('v21-bank-report-dirty',()=>{if(active)void reload();});"),
 'only the currently open dashboard reads after a message signal');
assert(report.includes('if(loading){queued=true;return;}'),'coalesce overlapping report reads');
assert(!sync.includes('setInterval(()=>void reload('),'no report polling');
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-responsive-composer-ui268-20261109';"));
console.log('UI-263 bank report reacts to verified Admin finance messages, no polling PASS');
