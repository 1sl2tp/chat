import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotConfig,verifyTelegramBot,verifyPilotChat,selectPilotCommand,exactTopicAck}
  from '../../../supabase/functions/v21-telegram-pilot/pilot-core.mjs';
const admin='8011308020';
const cfg={TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyz',
  TELEGRAM_ADMIN_USER_ID:admin,TELEGRAM_PILOT_CHAT_ID:admin};
const event=(id,text,user=admin,chat=admin)=>({update_id:id,message:{
  chat:{id:Number(chat),type:'private'},from:{id:Number(user),is_bot:false},
  message_id:id,text}});
test('requires secret and exact admin chat, not browser-provided IDs',()=>{
  assert.equal(pilotConfig(cfg).valid,true);
  assert.deepEqual(pilotConfig({...cfg,TELEGRAM_BOT_TOKEN:''}).missing,['TELEGRAM_BOT_TOKEN']);
  assert.deepEqual(pilotConfig({...cfg,TELEGRAM_PILOT_CHAT_ID:'999999999'}).missing,['TELEGRAM_PILOT_CHAT_ID']);
  assert.deepEqual(pilotConfig({...cfg,TELEGRAM_ADMIN_USER_ID:'bad'}).missing,
    ['TELEGRAM_ADMIN_USER_ID','TELEGRAM_PILOT_CHAT_ID']);
});
test('requires exact bot username and private topics',()=>{
  assert.equal(verifyTelegramBot({is_bot:true,username:'taphoa_chat_bridge_bot',has_topics_enabled:true}),true);
  assert.throws(()=>verifyTelegramBot({is_bot:true,username:'other_bot',has_topics_enabled:true}),/wrong_bot/);
  assert.throws(()=>verifyTelegramBot({is_bot:true,username:'taphoa_chat_bridge_bot'}),/threads_disabled/);
  assert.equal(verifyPilotChat({type:'private',id:Number(admin)},admin),true);
  assert.throws(()=>verifyPilotChat({type:'supergroup',id:Number(admin)},admin),/wrong_target/);
});
test('only exact admin /pilot in exact private chat authorizes a topic',()=>{
  const out=selectPilotCommand([event(1,'/start'),event(2,'/pilot','123456789'),event(3,'/pilot',admin,'123456789'),
    event(4,'/pilot'),event(5,'/pilot')],admin,admin);
  assert.equal(out.selected.updateId,4);
  assert.equal(out.ackOffset,6);
  assert.equal(selectPilotCommand([event(1,'/start')],admin,admin).selected,null);
  assert.equal(selectPilotCommand([{...event(9,'/pilot'),message:{...event(9,'/pilot').message,
    forward_origin:{type:'user'}}}],admin,admin).selected,null);
  assert.equal(selectPilotCommand([event(1,'/pilot',admin,'999999999')],admin,admin).selected,null);
});
test('successful Telegram send must acknowledge correct message thread and target chat',()=>{
  const good={message_id:7,message_thread_id:88,is_topic_message:true,chat:{id:Number(admin)}};
  assert.deepEqual(exactTopicAck(good,88,admin),{threadId:88,messageId:7});
  assert.throws(()=>exactTopicAck({...good,message_thread_id:89},88,admin),/wrong_topic_ack/);
  assert.throws(()=>exactTopicAck({...good,chat:{id:3}},88,admin),/wrong_chat_ack/);
  assert.throws(()=>exactTopicAck({...good,is_topic_message:false},88,admin),/wrong_topic_ack/);
});
