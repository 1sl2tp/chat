'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const dashboard=fs.readFileSync('bank-report-dashboard.js','utf8');
const REPORT_ID='fc3ec480-60d2-4749-b7af-5f4ae71eb14e';

// Make the Admin directory sorter run in isolation with real activity dates.
const start=directory.indexOf('const PINNED_REPORT_ID=');
const end=directory.indexOf('async function invokeBody(',start);
assert(start>=0&&end>start,'report pin should be part of the directory sorter');
const scope={};
vm.createContext(scope);
vm.runInContext(directory.slice(start,end)+
  '\nglobalThis.sort=sortDirectoryContacts;globalThis.isReport=isPinnedReportContact;',scope);
const c=(id,latest_at,display_name='Customer')=>({id,latest_at,display_name});
const report=c(REPORT_ID,'2026-10-19T10:00:00.000Z','TAPHOA · Báo cáo chuyển khoản');
const newest=c('newest','2026-10-23T10:00:00.000Z');
const middle=c('middle','2026-10-22T10:00:00.000Z');
const old=c('old','2026-10-20T10:00:00.000Z');
const deceptive=c('deceptive','2026-10-21T10:00:00.000Z','TAPHOA · Báo cáo chuyển khoản');
const sorted=Array.from(scope.sort([old,middle,report,newest,deceptive]),x=>x.id);
assert.deepEqual(sorted,[REPORT_ID,'newest','middle','deceptive','old'],
  'report stays first regardless of message activity; other contacts remain newest-first');
assert.deepEqual(Array.from(scope.sort([old,middle,newest]),x=>x.id),
  ['newest','middle','old'],'missing report is not invented in directory');
assert.deepEqual(Array.from(scope.sort([report,{...newest,deleted_at:'2026-10-23'}]),x=>x.id),[REPORT_ID]);
assert.equal(scope.isReport(deceptive),false,'never pin by display name');
assert.equal(scope.isReport({id:REPORT_ID,display_name:'Renamed report'}),true,'rename never unpins report');
assert(dashboard.includes("const REPORT_ID='"+REPORT_ID+"'"),
  'report contact id must match the report dashboard');
assert(shell.includes("const PINNED_BANK_REPORT_CONTACT_ID='"+REPORT_ID+"'"),
  'initial AuthUI ordering must agree with dynamic Admin directory');
assert(shell.includes("items.sort((a,b)=>Number(isPinnedBankReportContact(b))-Number(isPinnedBankReportContact(a)))"));
assert(shell.includes("if(authAccount?.role==='admin'){"),
  'ordinary user lists must not use Admin-only pinning');
assert(directory.includes("row.dataset.contactPinned=isPinnedReportContact(item)?'report':''"));
assert(directory.includes("const show=matchesDirectory(item);"),
  'manual search/group filtering must still decide row visibility');
assert(directory.includes('viewport.restore(scrollHost,host,scrollAnchor)'),
  'background resort must not jump the visible directory position');
console.log('PASS canonical transfer report pinned on top; live-order, filters, scroll & admin-only behavior preserved');
