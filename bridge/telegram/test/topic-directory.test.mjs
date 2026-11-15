import test from 'node:test';
import assert from 'node:assert/strict';
import {projectChatDirectory,planTopicDirectory} from '../src/topic-directory.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const adminChat='8011308020';
const fixture={
  accounts:[
    {id:A,role:'user',display_name:'Khách A',deleted_at:null},
    {id:B,role:'user',display_name:'Khách B',deleted_at:null},
    {id:C,role:'user',display_name:'Khách C',deleted_at:null},
    {id:'44444444-4444-4444-8444-444444444444',role:'user',display_name:'Deleted',deleted_at:'2026-01-01'},
    {id:'55555555-5555-4555-8555-555555555555',role:'admin',display_name:'Admin',deleted_at:null},
  ],
  links:[{chat_account_id:A,zalo_id:'z-01'},{chat_account_id:B,zalo_id:'z-02'}],
  contacts:[
    {zalo_id:'z-01',display_name:'C Sâm',alias_name:'C Sâm',thread_type:'user'},
    {zalo_id:'z-02',display_name:'C Sâm',alias_name:'C Sâm',thread_type:'user'},
    {zalo_id:'z-03',display_name:'Khách chưa gán',thread_type:'user'},
    {zalo_id:'g-01',display_name:'Nhóm Zalo',thread_type:'group'},
  ],
};
test('directory comes from accounts even without messages, not activity list',()=>{
  const c=projectChatDirectory(fixture);
  assert.deepEqual(c.map(x=>x.contactKey),['chat:'+A,'chat:'+B,'chat:'+C]);
  assert.deepEqual(c.map(x=>x.replyEligible),[true,true,false]);
  assert.equal(c[2].state,'chat_only');
});
test('unlinked Zalo is opt-in, never reply eligible, and groups are excluded',()=>{
  const c=projectChatDirectory({...fixture,includeUnlinkedZalo:true});
  assert.equal(c.length,4);
  assert.equal(c.find(x=>x.contactKey==='zalo:z-03').replyEligible,false);
  assert(!c.some(x=>x.contactKey==='zalo:g-01'));
});
test('identical names get deterministic tags stable after reorder',()=>{
  const a=projectChatDirectory(fixture);
  const b=projectChatDirectory({...fixture,accounts:[...fixture.accounts].reverse()});
  assert.deepEqual(a,b);
  assert.notEqual(a[0].topicTitle,a[1].topicTitle);
  assert(a[0].topicTitle.startsWith('C Sâm · '));
});
test('keep/rename/create planned without recreating existing topics',()=>{
  const c=projectChatDirectory(fixture);
  const mappings=[
    {contact_key:'chat:'+A,telegram_chat_id:adminChat,telegram_thread_id:60,topic_name:c[0].topicTitle,state:'active'},
    {contact_key:'chat:'+B,telegram_chat_id:adminChat,telegram_thread_id:61,topic_name:'Tên cũ',state:'active'},
  ];
  const p=planTopicDirectory({directory:c,mappings,chatId:adminChat});
  assert.deepEqual(p.actions.map(x=>x.type),['keep','rename','create']);
  assert.equal(p.plannedCreates,1);
  assert.equal(p.created,0);
  assert.equal(p.actions[0].threadId,60);
});
test('wrong-chat mapping cannot authorize another Telegram Admin chat',()=>{
  const c=projectChatDirectory(fixture);
  const m=[{contact_key:'chat:'+A,telegram_chat_id:'88888888',telegram_thread_id:60,topic_name:'X',state:'active'}];
  const p=planTopicDirectory({directory:c,mappings:m,chatId:adminChat,maxCreates:1});
  assert.equal(p.actions.length,1);assert.equal(p.actions[0].type,'create');
});
test('at most three create proposals, never bulk import',()=>{
  const c=projectChatDirectory({...fixture,includeUnlinkedZalo:true});
  assert.equal(planTopicDirectory({directory:c,chatId:adminChat,maxCreates:0}).actions.length,0);
  assert.equal(planTopicDirectory({directory:c,chatId:adminChat,maxCreates:2}).plannedCreates,2);
  assert.throws(()=>planTopicDirectory({directory:c,chatId:adminChat,maxCreates:4}),/create_cap_invalid/);
});
test('duplicate Topic ownership and duplicate contact mapping fail closed',()=>{
  const c=projectChatDirectory(fixture);
  const m=[
    {contact_key:'chat:'+A,telegram_chat_id:adminChat,telegram_thread_id:60,topic_name:'A',state:'active'},
    {contact_key:'chat:'+B,telegram_chat_id:adminChat,telegram_thread_id:60,topic_name:'B',state:'active'},
  ];
  assert.throws(()=>planTopicDirectory({directory:c,mappings:m,chatId:adminChat}),/duplicate_topic_ownership/);
  assert.throws(()=>planTopicDirectory({directory:c,mappings:[m[0],m[0]],chatId:adminChat}),/duplicate_existing_contact_keys/);
});
test('contradictory Zalo links and duplicate source snapshots rejected',()=>{
  assert.throws(()=>projectChatDirectory({...fixture,links:[...fixture.links,{chat_account_id:B,zalo_id:'z-04'}]}),/duplicate_zalo_links/);
  assert.throws(()=>projectChatDirectory({...fixture,links:[...fixture.links,{chat_account_id:C,zalo_id:'z-02'}]}),/duplicate_zalo_link_target/);
});
test('names clean controls and respect Telegram 128 UTF-8 byte limit',()=>{
  const c=projectChatDirectory({accounts:[{id:A,role:'user',display_name:'Khách \n'+('é'.repeat(100)),deleted_at:null}]});
  assert(!c[0].topicTitle.includes('\n'));
  assert(new TextEncoder().encode(c[0].topicTitle).length<=128);
});
