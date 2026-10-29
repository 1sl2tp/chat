'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
function section(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert(a>=0&&b>a, 'canonical code section '+start);
 return app.slice(a,b);
}
const fixed='2026-10-28T18:30:00.000Z'; // 01:30 Oct29 in Vietnam, Oct28 in UTC
class FixedDate extends Date {
 constructor(...args){super(...(args.length?args:[fixed]));}
 static now(){return Date.parse(fixed);}
}
const context=vm.createContext({
 Date:FixedDate,Intl,URL,
 currentMediaAccountId:()=> 'account-1',
 localImagePreviewUrls:new Map(),
 store:{items:[]},
 mapServerMedia:()=>null,
 createMessage:input=>input,
 deriveMessageKind:()=> 'text'
});
vm.runInContext(
 section('function messageTimestampMs(message){','function syncMessageTimeNode(')+
 section('function messageDateKey(timestamp){','function formatMessageDayLabel(')+
 section('function mediaViewerItem(','function revokeViewerOwnedUrls(')+
 section('function formatViewerDate(date){','function viewerTimeFilterLabel(')+
 section('function isViewerItemInTimeScope(','function updateImageViewerTimeMenu(')+
 section('function mapV21ServerMessage(row,selfId){','window.V21ConversationBridge=')+
 '\nglobalThis.testApi={ms:messageTimestampMs,view:mediaViewerItem,collect:collectConversationImageAssets,label:viewerTimestampLabel,filter:isViewerItemInTimeScope,map:mapV21ServerMessage};',
 context);
const a=context.testApi,media={type:'image',assetId:'photo-1',accountId:'account-1'};
const ok=a.view(media,'','2026-10-28T18:10:00Z');
assert.equal(ok.createdAt,Date.parse('2026-10-28T18:10:00Z'));
assert.equal(a.view(media).createdAt,0,'undated image must not be now');
assert.equal(a.view(media,'','broken-date').createdAt,0);
assert.equal(a.label(a.view(media)),'Không rõ ngày giờ gửi');
assert(a.label(ok).includes('29/10/2026'),'viewer date follows VN local calendar');
assert(a.label(ok).includes('01:10'));
context.store.items=[
 {id:'m1',sender:'remote',media,createdAt:undefined},
 {id:'m2',sender:'self',media:{type:'image',assetId:'photo-2',accountId:'account-1'},createdAt:Date.parse('2026-10-28T18:10:00Z')}
];
const images=Array.from(a.collect());
assert.equal(images.length,2);
assert.equal(images[0].createdAt,0,'album collection must not substitute viewing clock');
assert.equal(images[1].createdAt,Date.parse('2026-10-28T18:10:00Z'));
const unknown={createdAt:0},today={createdAt:Date.parse('2026-10-28T18:01:00Z')};
const yesterday={createdAt:Date.parse('2026-10-28T16:30:00Z')};
const older={createdAt:Date.parse('2026-10-21T16:30:00Z')};
assert.equal(a.filter(unknown,'all'),true);
for(const scope of ['today','yesterday','week','month'])assert.equal(a.filter(unknown,scope),false,'unknown excluded from '+scope);
assert.equal(a.filter(today,'today'),true);
assert.equal(a.filter(today,'yesterday'),false);
assert.equal(a.filter(yesterday,'today'),false,'Oct28 23:30 VN must not be Oct29 today');
assert.equal(a.filter(yesterday,'yesterday'),true);
assert.equal(a.filter(yesterday,'week'),true);
assert.equal(a.filter(older,'week'),false);
assert.equal(a.filter(today,'month'),true);
assert.equal(a.filter({createdAt:Date.parse('2026-09-30T16:00:00Z')},'month'),false);
assert.equal(a.filter({createdAt:Date.parse('2026-10-01T00:00:00Z')},'month'),true);
const row={id:'msg-1',body:'hello',sender_account_id:'A',created_at:'2026-10-28T18:01:00Z'};
assert.equal(a.map(row,'A').createdAt,Date.parse(row.created_at));
assert.equal(a.map({...row,id:'msg-2',created_at:null},'A').createdAt,0);
assert.equal(a.map({...row,id:'msg-3',created_at:'malformed'},'A').createdAt,0);
assert(!app.includes('createdAt:Number(createdAt)||Date.now()'));
assert(!app.includes('createdAt:Date.parse(row.created_at)||Date.now()'));
assert(!app.includes("function mediaViewerItem(media,previewUrl='',createdAt=Date.now()"));
assert(!app.includes("const add=(media,previewUrl='',createdAt=Date.now()"));
assert(html.includes('.message-sent-time{')&&html.includes('font-size:12px;'));
console.log('CHAT Zalo display round 2: true sent times, VN media filters, unknown-safe mapping and 12px metadata PASS');
