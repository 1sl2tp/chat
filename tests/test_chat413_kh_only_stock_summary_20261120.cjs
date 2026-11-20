'use strict';
// CHAT-413: classification comes from Admin directory groups, never a name.
// Isolated browser runtime test: no Supabase requests, writes, or actual sends.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('app.js','utf8');
const groups=fs.readFileSync('contact-directory-admin.js','utf8');
function section(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'expected runtime section '+start);
 return app.slice(a,b);
}
const src=[
 section('function stockSummaryCustomerAllowed(){','function renderMessageNode('),
 section('function dailyStockSummariesByOwner(messages){','function syncDailyStockSummary(')
].join('\n');

let currentContactId='kh-1';
const contactGroups=new Map([['kh-1','customer'],['friend-1','friend'],
 ['ncc-1','ncc'],['cm-1','cm'],['other-1','other']]);
let classifiers=0,ocr=0,removals=0;
const sandbox={
 window:{
  V21SyncEngine:{snapshot:()=>({currentContactId})},
  V21ContactDirectoryAdmin:{groupForContact:id=>contactGroups.get(id)||null},
  V21ChatStockImageUI:{
   sync:()=>{ocr++;return true;},
   reads:()=>[{assetId:'test',status:'read',lines:[],notes:[]}]
  },
  V21IncomingMessageLayout:{summarizeDay:()=>{
   classifiers++;return {kind:'daily-order',items:[{name:'omachi',qty:5}],imageGroups:[]};
  }}
 },
 stableMessageDomKey:m=>m.key,
 messageTimestampMs:m=>Date.parse(m.date),
 messageDateKey:t=>new Date(t).toISOString().slice(0,10),
 formatMessageDayLabel:()=> 'Hôm nay · 20/11/2026',
 conversationViewEpoch:1,
 dailyStockCacheEpoch:-1,
 dailyStockCacheSignature:'',
 dailyStockCacheMap:new Map(),
 renderWindow:()=>{throw new Error('render must not run during group check')},
 Map,Boolean,String
};
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
const check=(value,expected)=>{
 currentContactId=value;
 assert.equal(sandbox.stockSummaryCustomerAllowed(),expected,
  'customer-only check for '+String(value));
};
for(const id of ['friend-1','ncc-1','cm-1','other-1','missing','']){
 check(id,false);
 assert.equal(sandbox.dailyStockSummariesByOwner([
  {key:'m1',sender:'remote',text:'5 omachi',date:'2026-11-20T04:00:00Z'}
 ]).size,0);
}
assert.equal(classifiers,0,'non-KH must not run text/image stock classifiers');
assert.equal(sandbox.stockImageReadings({media:{type:'image'}}).length,0,
 'non-KH image findings must not enter stock summary');

const stale={remove(){removals++;}};
assert.equal(sandbox.syncStockImageOCRControl({
 querySelector:()=>stale
},{media:{type:'image'}}),true);
assert.equal(removals,1,'changing KH to another group removes old OCR action');
assert.equal(ocr,0,'non-KH must not offer OCR');

check('kh-1',true);
const summary=sandbox.dailyStockSummariesByOwner([
 {key:'m1',sender:'remote',text:'5 omachi',date:'2026-11-20T04:00:00Z'}
]);
assert.equal(summary.size,1,'KH must retain daily stock card');
assert.equal(summary.get('m1').dayLabel,'Hôm nay · 20/11/2026');
assert.equal(classifiers,1);
assert.equal(sandbox.stockImageReadings({media:{type:'image'}}).length,1);
assert.equal(sandbox.syncStockImageOCRControl({},{}),true);
assert.equal(ocr,1);

contactGroups.set('kh-1','friend');
check('kh-1',false);
assert.equal(sandbox.dailyStockSummariesByOwner([
 {key:'m1',sender:'remote',text:'5 omachi',date:'2026-11-20T04:00:00Z'}
]).size,0,'KH changed to friend must hide previous day card immediately');

contactGroups.delete('kh-1');
check('kh-1',false);
assert.equal(sandbox.dailyStockSummariesByOwner([]).size,0,
 'unloaded group classification must fail closed');

assert(groups.includes("function groupForContact(contactId){"));
assert(groups.includes("String(loadedAdminId)!==String(admin.id)"),
 'groupForContact must be scoped to the currently authenticated Admin');
assert(groups.includes("publishGroupsChanged();"),
 'changing/reloading group data must publish to active message window');
assert(app.includes("document.addEventListener('v21-contact-groups-change',()=>{"));
const onGroupChange=section("document.addEventListener('v21-contact-groups-change',()=>{",
 '// CHAT-410: one capability result');
assert(onGroupChange.includes('dailyStockCacheEpoch=-1'));
assert(onGroupChange.includes("renderWindow({preserve:'VIEW'})"),
 'group updates must remove stale card without grabbing scrollTop');
assert(!onGroupChange.includes("scrollTop="));
console.log('CHAT-413 KH-only daily summary: OK');
