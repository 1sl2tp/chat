import test from 'node:test';
import assert from 'node:assert/strict';
import {projectChatDirectory,planTopicDirectory} from '../src/topic-directory.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const admin='8011308020',accounts=[
{id:A,role:'user',display_name:'C Sâm',deleted_at:null},
{id:B,role:'user',display_name:'C Sâm',deleted_at:null},
{id:C,role:'user',display_name:'Chưa từng nhắn tin',deleted_at:null},
{id:'44444444-4444-4444-8444-444444444444',role:'user',display_name:'Deleted',deleted_at:'2026-01-01'},
{id:'55555555-5555-4555-8555-555555555555',role:'admin',display_name:'Admin',deleted_at:null},
];
test('only active Chat accounts including empty conversations',()=>{
  const d=projectChatDirectory({accounts});assert.equal(d.length,3);
  assert.deepEqual(d.map(x=>x.contactKey),[A,B,C].map(x=>'chat:'+x));
  assert.equal(d[2].name,'Chưa từng nhắn tin');
  assert(d.every(x=>!x.replyEligible&&x.state==='chat_active'));
});
test('Zalo directory not read even if given as extraneous data',()=>{
 const d=projectChatDirectory({accounts,contacts:new Array(350).fill({zalo_id:'z'})});
 assert.equal(d.length,3);assert(!d.some(x=>x.contactKey.startsWith('zalo:')));
});
test('identical display names get stable distinct topics',()=>{
 const d=projectChatDirectory({accounts}),r=projectChatDirectory({accounts:[...accounts].reverse()});
 assert.deepEqual(d,r);assert.notEqual(d[0].topicTitle,d[1].topicTitle);
});
test('reconcile existing idempotently and rename instead of duplicate',()=>{
 const d=projectChatDirectory({accounts});
 const mappings=[{contact_key:'chat:'+A,telegram_chat_id:admin,telegram_thread_id:60,topic_name:d[0].topicTitle,state:'active'},
 {contact_key:'chat:'+B,telegram_chat_id:admin,telegram_thread_id:61,topic_name:'Tên cũ',state:'active'}];
 const p=planTopicDirectory({directory:d,mappings,chatId:admin,maxCreates:143});
 assert.deepEqual(p.actions.map(x=>x.type),['keep','rename','create']);
 assert.equal(p.createdTopics,0);assert.equal(p.plannedCreates,1);
});
test('143 contacts planned without creating any actual topic or reading Zalo',()=>{
 const all=Array.from({length:143},(_,i)=>({
 id:(i+1).toString(16).padStart(8,'0')+'-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0'),
 role:'user',display_name:'Khách '+i,deleted_at:null}));
 const d=projectChatDirectory({accounts:all});
 const p=planTopicDirectory({directory:d,chatId:admin,maxCreates:143});
 assert.equal(p.total,143);assert.equal(p.plannedCreates,143);assert.equal(p.createdTopics,0);
});
test('wrong Telegram chat and duplicate thread owner are guarded',()=>{
 const d=projectChatDirectory({accounts});
 const foreign=[{contact_key:'chat:'+A,telegram_chat_id:'99999',telegram_thread_id:60,topic_name:'X',state:'active'}];
 const p=planTopicDirectory({directory:d,mappings:foreign,chatId:admin,maxCreates:1});
 assert.equal(p.actions[0].type,'create');
 const dup=[{contact_key:'chat:'+A,telegram_chat_id:admin,telegram_thread_id:60,state:'active'},
 {contact_key:'chat:'+B,telegram_chat_id:admin,telegram_thread_id:60,state:'active'}];
 assert.throws(()=>planTopicDirectory({directory:d,mappings:dup,chatId:admin}),/duplicate_topic_ownership/);
});
test('name controls and multibyte length normalized',()=>{
 const d=projectChatDirectory({accounts:[{id:A,role:'user',display_name:'Khách \n'+('ế'.repeat(120)),deleted_at:null}]});
 assert(!d[0].topicTitle.includes('\n'));assert(new TextEncoder().encode(d[0].topicTitle).length<=128);
});
