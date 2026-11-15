import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSyncConfig,exactAdminCommand,exactBotAndChat,canonicalTopicRows,exactCreatedTopic}
from '../../../supabase/functions/v21-telegram-directory-sync/sync-core.mjs';
const admin='8011308020',now=1800000000;
const mk=(update_id,text,from=admin,chat=admin,date=now)=>({update_id,message:{
  chat:{id:Number(chat),type:'private'},from:{id:Number(from),is_bot:false},
  date,text,message_id:update_id}});
test('Telegram admin command requires exact ID, chat, freshness and text',()=>{
 const good=exactAdminCommand([mk(1,'/start'),mk(2,'/sync143')],admin,admin,now);
 assert.deepEqual(good,{updateId:2,offset:3});
 assert.equal(exactAdminCommand([mk(3,'/sync143','123456789')],admin,admin,now),null);
 assert.equal(exactAdminCommand([mk(3,'/sync143',admin,'999999999')],admin,admin,now),null);
 assert.equal(exactAdminCommand([mk(3,'/sync143',admin,admin,now-700)],admin,admin,now),null);
 assert.equal(exactAdminCommand([mk(3,'/sync')],admin,admin,now),null);
 const f=mk(3,'/sync143');f.message.forward_origin={type:'user'};
 assert.equal(exactAdminCommand([f],admin,admin,now),null);
});
test('bot is exact pinned Telegram admin private chat with Topics',()=>{
 assert.equal(exactBotAndChat({is_bot:true,username:'taphoa_chat_bridge_bot',has_topics_enabled:true},
  {type:'private',id:Number(admin)},admin),true);
 assert.throws(()=>exactBotAndChat({is_bot:true,username:'other',has_topics_enabled:true},
  {type:'private',id:Number(admin)},admin));
 assert.throws(()=>exactBotAndChat({is_bot:true,username:'taphoa_chat_bridge_bot',has_topics_enabled:false},
  {type:'private',id:Number(admin)},admin));
});
test('143 Chat accounts are required, no names/IDs from Zalo',()=>{
 const accounts=Array.from({length:143},(_,i)=>({id:(i+1).toString(16).padStart(8,'0')+
  '-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0'),display_name:'Khách '+(i+1)}));
 const rows=canonicalTopicRows(accounts);
 assert.equal(rows.length,143);
 assert.equal(rows[0].topic_title,'Khách 1');
 assert.throws(()=>canonicalTopicRows(accounts.slice(0,142)),/chat_count_changed/);
 assert.throws(()=>canonicalTopicRows([...accounts.slice(0,142),accounts[0]]),/duplicate_or_invalid/);
});
test('invalid config or Telegram topic ACK rejected',()=>{
 assert.equal(validateSyncConfig({TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyz',
 TELEGRAM_ADMIN_USER_ID:admin,TELEGRAM_PILOT_CHAT_ID:admin}).valid,true);
 assert.equal(validateSyncConfig({TELEGRAM_BOT_TOKEN:'bad',
 TELEGRAM_ADMIN_USER_ID:admin,TELEGRAM_PILOT_CHAT_ID:admin}).valid,false);
 assert.equal(exactCreatedTopic({message_thread_id:60}),60);
 assert.throws(()=>exactCreatedTopic({message_thread_id:0}),/telegram_thread_id_invalid/);
});
test('worker is Chat-only, claims before Bot API, no alternate messaging bridge',()=>{
 const code=fs.readFileSync(new URL('../../../supabase/functions/v21-telegram-directory-sync/index.ts',import.meta.url),'utf8');
 assert.match(code,/v21_accounts\?select=id,display_name/);
 assert.match(code,/state:'needs_review',last_error_code:'create_in_flight'/);
 assert.match(code,/telegram\(token,'createForumTopic'/);
 assert.match(code,/resolution=ignore-duplicates/);
 assert.doesNotMatch(code,/zalo_contacts|zalo_user_links|zalo_message_links|v21_messages|sendMessage|createOrder|cron|setWebhook/);
});
