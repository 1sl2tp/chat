import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveTopic,confirmTopic,uncertainTopic,shouldCreateTopic} from '../src/topic-lifecycle.mjs';
import fs from 'node:fs';
const account='11111111-1111-4111-8111-111111111111';
test('reservation confirms only same private Telegram chat and positive topic ID',()=>{
 const r=reserveTopic({chatId:'8011308020',accountId:account,title:'C Sâm'});
 assert.equal(r.state,'reserved');
 assert.equal(confirmTopic(r,{chatId:'8011308020',threadId:60}).state,'active');
 assert.throws(()=>confirmTopic(r,{chatId:'8011308021',threadId:60}),/wrong_chat/);
 assert.throws(()=>confirmTopic(r,{chatId:'8011308020',threadId:0}),/thread_id_invalid/);
 assert.throws(()=>confirmTopic({...r,state:'active'},{chatId:'8011308020',threadId:60}),/not_reserved/);
});
test('ambiguous API state fails closed instead of retrying and duplicating',()=>{
 const r=reserveTopic({chatId:'8011308020',accountId:account,title:'C Sâm'});
 const failed=uncertainTopic(r,'network_timeout');
 assert.equal(failed.state,'needs_review');
 assert.equal(shouldCreateTopic(failed),false);
 assert.equal(shouldCreateTopic(r),false);
 assert.equal(shouldCreateTopic(null),true);
});
test('applied migration snapshot is service only, RLS enabled and has two unique identities',()=>{
 const sql=fs.readFileSync(new URL('../schema/applied-20261115223711-telegram-topic-links.sql',import.meta.url),'utf8');
 assert.match(sql,/primary key\s*\(telegram_chat_id,\s*chat_account_id\)/i);
 assert.match(sql,/unique\s*\(telegram_chat_id,\s*telegram_thread_id\)/i);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/revoke all.*from public, anon, authenticated/i);
 assert.match(sql,/grant select, insert, update.*to service_role/i);
 assert.doesNotMatch(sql,/insert into\s+public\.v21_accounts|update\s+public\.v21_accounts|create\s+trigger|cron\.schedule/i);
});
