'use strict';
// CHAT-418: explicit supplier-photo intake is separate from KH order OCR.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const policy=read('chat-ncc-sources.js');
const ui=read('chat-ncc-image-ui.js');
const room=read('ncc-ai-room.js');
const app=read('app.js');
const html=read('index.source.html');
const css=read('ncc-ai-room.css');
const events=[],stored=new Map();
let adminId='admin-one';
let groupMap=new Map([
 ['anh','ncc'],['thuong','other'],['kh','customer'],['new','friend']
]);
let contacts=[
 {id:'anh',display_name:'E Anh đạt'},
 {id:'thuong',display_name:'ethuonghangu'},
 {id:'kh',display_name:'Khách 1'},
 {id:'new',display_name:'NCC mới'}
];
const window={
 V21AuthSessionStore:{snapshot:()=>({
  state:'AUTHENTICATED',account:{id:adminId,role:'admin'},appSessionId:'session'
 })},
 V21ContactStore:{snapshot:()=>contacts},
 V21ContactDirectoryAdmin:{groupForContact:id=>groupMap.get(id)||null},
 localStorage:{
  getItem:key=>stored.has(key)?stored.get(key):null,
  setItem:(key,value)=>stored.set(key,value)
 }
};
const document={addEventListener(){},dispatchEvent:e=>events.push(e.type)};
vm.runInNewContext(policy,{window,document,Event:class Event{
 constructor(type){this.type=type;}
}});
const selected=window.V21NccSources;
assert.equal(selected.selected('anh'),true,'Anh Dat initially selected');
assert.equal(selected.selected('thuong'),true,'ethuonghangu initially selected');
assert.equal(selected.selected('kh'),false,'KH never automatically selected');
assert.equal(selected.selected('new'),false,'unselected contact not imported');
assert.equal(selected.list().length,3,'KH not even shown as selection option');
assert.equal(selected.setSelected('kh',true),false,'KH cannot be added');
assert.equal(selected.setSelected('new',true),true);
assert.equal(selected.selected('new'),true);
assert(stored.get('chat-ncc-source-ids:admin-one').includes('new'));
assert.equal(selected.setSelected('anh',false),true);
assert.equal(selected.selected('anh'),false,'manual removal overrides default');
assert.equal(selected.selected('thuong'),true);
adminId='admin-two';
assert.equal(selected.selected('anh'),true,'selection scoped per Admin');
assert.equal(selected.selected('new'),false);
adminId='admin-one';
groupMap.set('thuong','customer');
assert.equal(selected.selected('thuong'),false,'reassigned KH loses supplier permission');
groupMap.delete('new');
assert.equal(selected.selected('new'),false,'unloaded group fails closed');
assert(events.includes('v21-ncc-sources-changed'));
groupMap.set('thuong','other');
groupMap.set('new','other');

// Ambiguous duplicate names must not silently authorize either profile.
adminId='fresh-admin';
contacts=[...contacts,{id:'anh-duplicate',display_name:'E Anh đạt'}];
groupMap.set('anh-duplicate','other');
assert.equal(selected.selected('anh'),false);
assert.equal(selected.selected('anh-duplicate'),false);

assert(ui.includes("message.sender==='self'"),'inbound photos only');
assert(ui.includes('window.V21NccSources?.selected?.(id)'));
assert(ui.includes('stageChatImage?.({assetId,contactId:id})'));
assert(!/functions\.invoke|\.upload\(|\.insert\(|\.update\(|\.upsert\(/u.test(ui),
 'photo button must never write or scan itself');
assert(room.includes('data-ncc-source-menu'));
assert(room.includes('window.V21NccSources?.list?.()'));
assert(room.includes('async function stageChatImage('));
const handoff=room.slice(room.indexOf('async function stageChatImage('),
 room.indexOf('function launchButton('));
assert(handoff.includes('window.V21NccSources?.selected?.(id)'));
assert(handoff.includes('currentContactId'));
assert(handoff.includes('window.V21MediaCache?.get?.'));
assert(handoff.includes('ensureMediaRemote'));
assert(handoff.includes('prepareSelectedPhoto(file)'));
assert(handoff.includes('await open()'));
assert(handoff.includes('selectedPhoto=photo'));
assert(!handoff.includes('await submit(')&&!handoff.includes('api("send"'),
 'staging chat photo may not send/scan without final Admin tap');
assert(app.includes('window.V21NccChatImageUI?.sync?.(node,message)'));
assert(app.includes('if(!stockSummaryCustomerAllowed())'));
assert(app.includes('const oldNcc=node?.querySelector?'));
assert(app.includes('window.V21ChatStockImageUI?.sync?.(node,message'));
assert(html.indexOf('chat-ncc-sources.js')<html.indexOf('chat-ncc-image-ui.js'));
assert(html.indexOf('chat-ncc-image-ui.js')<html.indexOf('data-build-source="app.js"'));
assert(html.includes('data-build-source="ncc-ai-room.js"'));
assert(css.includes('#messageWindow .message-ncc-photo-button'));
assert(css.includes('.ncc-source-panel'));
console.log('CHAT-418 selected supplier contacts and safe photo staging PASS');
