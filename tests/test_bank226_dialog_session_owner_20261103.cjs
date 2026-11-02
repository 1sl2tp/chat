'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('bank-report-dashboard.js','utf8');
const i=s.indexOf('function bankDialogIsCurrent('),j=s.indexOf('let reviewFocusOwner=null;',i);
assert(i>0&&j>i);
let owner='A|1',current='A|1',active=true,route=true,visible=true,mounted=true;
const target={};
const ctx={Boolean,get active(){return active;},isReportContact:()=>route,
 get reportSessionOwner(){return owner;},bankReportSessionOwner:()=>current,
 ui:{review:{get hidden(){return !visible;},contains(n){return mounted&&n===target;}}}};
vm.createContext(ctx);vm.runInContext(s.slice(i,j),ctx);
const check=(who='A|1')=>ctx.bankDialogIsCurrent(target,who);
assert.equal(check(),true);
mounted=false;assert.equal(check(),false,'dialog replaced');
mounted=true;visible=false;assert.equal(check(),false,'closed');
visible=true;current='B|2';assert.equal(check(),false,'changed Admin session');
current='A|1';owner='B|2';assert.equal(check(),false,'report switched');
owner='A|1';route=false;assert.equal(check(),false,'wrong contact');
route=true;active=false;assert.equal(check(),false,'inactive');
active=true;assert.equal(check(),true);
const r=s.slice(s.indexOf('async function openReviewDialog('),s.indexOf('// BANK-191: explicit real collection'));
const c=s.slice(s.indexOf('async function openCollectionDialog('),s.indexOf('function closeViewer()'));
for(const code of [r,c]){
 assert(code.includes('const owner=bankReportSessionOwner();'));
 assert(code.includes('if(!bankDialogIsCurrent(overlay,owner))return;'));
 assert(code.includes('if(!bankDialogIsCurrent(overlay,owner)||save.disabled)return;'));
 assert(code.includes('if(bankDialogIsCurrent(overlay,owner))cancel.disabled=false;'));
}
assert(r.includes("client.rpc('chat_bank_manual_exception_record'"));
assert(c.includes("client.rpc('chat_bank_manual_collect'"));
assert(!s.includes("rpc('chat_bank_app_collect'"));
console.log('BANK-226 dialog and Admin session ownership PASS');
