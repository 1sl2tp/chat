import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedPilotContacts,normalizeChatId,normalizeThreadId,ensureTopicDelivery,
  routeTelegramReply,DEMO_CONTACTS} from '../src/core.mjs';
import {createTelegramApi,validateTarget} from '../src/api.mjs';
import {parseAllowlist,readPilotDirectory} from '../src/backend.mjs';
import {runPilot,parseArgs} from '../src/pilot.mjs';
const id1=DEMO_CONTACTS[0].accountId,id2=DEMO_CONTACTS[1].accountId;
const ok=result=>({ok:true,status:200,json:async()=>({ok:true,result})});
test('dry-run uses fictional contacts and makes no network calls',async()=>{
  const logs=[],result=await runPilot([],{env:{},fetchImpl:()=>{throw Error('network forbidden');},log:x=>logs.push(x)});
  assert.equal(result.contacts,3);
  assert.equal(JSON.parse(logs[0]).changedProduction,false);
  assert.equal(JSON.parse(logs[0]).sentToTelegram,false);
});
test('only supported arguments and mode',()=>{
  assert.deepEqual(parseArgs(['--apply','--mode=group']),{apply:true,source:'demo',mode:'group',existingThreadId:null});
  assert.throws(()=>parseArgs(['--unexpected']),/unknown_argument/);
  assert.throws(()=>parseArgs(['--mode=private','--mode=group']),/multiple_modes/);
  assert.throws(()=>parseArgs(['--existing-thread-id=0']),/thread_id_invalid/);
});
test('directory clamps to three and rejects invalid identities',()=>{
  assert.equal(normalizedPilotContacts([...DEMO_CONTACTS,...DEMO_CONTACTS]).length,3);
  assert.equal(normalizeChatId('-100111'),'-100111');
  assert.throws(()=>normalizeChatId('@group'),/chat_id_invalid/);
  assert.throws(()=>normalizeThreadId('1.5'),/thread_id_invalid/);
  assert.deepEqual(parseAllowlist([id1,id2].join(',')),[id1,id2]);
  assert.throws(()=>parseAllowlist(id1+','+id1),/allowlist/);
  assert.throws(()=>parseAllowlist(''),/allowlist/);
});
test('private topics require supported bot and correct destination',()=>{
  assert.equal(validateTarget({bot:{is_bot:true,has_topics_enabled:true},chat:{type:'private'},mode:'private'}),true);
  assert.throws(()=>validateTarget({bot:{is_bot:true},chat:{type:'private'},mode:'private'}),/topics_not_enabled/);
  assert.throws(()=>validateTarget({bot:{is_bot:true,has_topics_enabled:true},chat:{type:'supergroup'},mode:'private'}),/expected_private/);
  assert.equal(validateTarget({bot:{is_bot:true},chat:{type:'supergroup',is_forum:true},mode:'group'}),true);
  assert.throws(()=>validateTarget({bot:{is_bot:true},chat:{type:'group'},mode:'group'}),/expected_forum/);
});
test('Telegram probe verifies returned topic ID, never an unrelated topic',()=>{
  assert.deepEqual(ensureTopicDelivery({message_id:5,message_thread_id:88},88),{messageId:5,threadId:88});
  assert.throws(()=>ensureTopicDelivery({message_id:5,message_thread_id:89},88),/ack_mismatch/);
  assert.throws(()=>ensureTopicDelivery({message_id:5},88),/ack_mismatch/);
});
test('API calls have bounded topic payload and sanitize error response',async()=>{
  const calls=[];const api=createTelegramApi({token:'123456:abcdefghijklmnopqrstuvwxyz',fetchImpl:async(url,init)=>{
    calls.push({method:url.split('/').at(-1),payload:JSON.parse(init.body)});
    return calls.length===1?ok({message_id:4,message_thread_id:13}):{ok:false,status:400,json:async()=>({description:'Bad Request: BOT_TOPIC_WRONG_HOME'})};
  }});
  const ack=await api.sendProbe(123,13,'hello');
  assert.equal(ack.threadId,13);
  assert.deepEqual(calls[0].payload,{chat_id:'123',message_thread_id:13,text:'hello',disable_notification:true});
  await assert.rejects(api.createTopic(123,'Test'),/telegram_createForumTopic_topic_wrong_home/);
});
test('read-only backend adapter fetches only selected canonical account and Zalo link',async()=>{
  const seen=[];
  const answer=[{id:id1,display_name:'Account 1',role:'user',deleted_at:null},
    {chat_account_id:id1,zalo_id:'z123'}, {zalo_id:'z123',display_name:'Zalo 1',alias_name:'Khách thử',
      profile_name:'Zalo 1',thread_type:'user'}];
  const contacts=await readPilotDirectory({baseUrl:'https://db.example.test',
    serviceRoleKey:'stub-key',accountIds:[id1],fetchImpl:async(url,opts)=>{
      seen.push({url,opts});return{ok:true,json:async()=>[answer[seen.length-1]]};
    }});
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].accountId,id1);
  assert.equal(contacts[0].name,'Khách thử');
  assert.equal(seen.length,3);
  assert(seen.every(item=>item.opts.method===undefined));
  assert(seen.every(item=>item.url.includes('eq.')));
});
test('routing rejects other chats, senders, general topics and unmapped threads',()=>{
  const topicToAccount=new Map([[20,id1]]);
  const update={message:{chat:{id:555},from:{id:777},is_topic_message:true,
    message_thread_id:20,message_id:1,text:'Xin chào'}};
  const options={chatId:555,adminUserId:777,topicToAccount};
  assert.equal(routeTelegramReply(update,options).accountId,id1);
  assert.equal(routeTelegramReply(update,{...options,chatId:556}),null);
  assert.equal(routeTelegramReply(update,{...options,adminUserId:778}),null);
  assert.equal(routeTelegramReply({...update,message:{...update.message,message_thread_id:21}},options),null);
  assert.equal(routeTelegramReply({...update,message:{...update.message,is_topic_message:false}},options),null);
});
test('live probe creates exactly one test topic and sends only there',async()=>{
  const sent=[],logs=[];const types=['getMe','getChat','createForumTopic','sendMessage'];
  const answers=[{is_bot:true,has_topics_enabled:true},{type:'private'},{message_thread_id:90},
    {message_id:9,message_thread_id:90}];
  const result=await runPilot(['--apply'],{env:{
    TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyz',TELEGRAM_PILOT_CHAT_ID:'123',
  },fetchImpl:async(url,init)=>{
    const method=url.split('/').at(-1),payload=JSON.parse(init.body);
    sent.push({method,payload});return ok(answers[types.indexOf(method)]);
  },log:x=>logs.push(x)});
  assert.equal(result.threadId,90);
  assert.deepEqual(sent.map(x=>x.method),types);
  assert.equal(sent.at(-1).payload.message_thread_id,90);
  assert(sent.at(-1).payload.text.includes('Không có tin nhắn nào'));
  assert.equal(JSON.parse(logs.at(-1)).stage,'telegram-probe-passed');
});
test('private topic known Telegram outage fails closed; no general-chat fallback',async()=>{
  const calls=[],logs=[];
  await assert.rejects(runPilot(['--apply'],{
    env:{TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyz',TELEGRAM_PILOT_CHAT_ID:'12'},
    fetchImpl:async(url)=>{
      const method=url.split('/').at(-1);calls.push(method);
      if(method==='getMe')return ok({is_bot:true,has_topics_enabled:true});
      if(method==='getChat')return ok({type:'private'});
      if(method==='createForumTopic')return ok({message_thread_id:91});
      return {ok:false,status:400,json:async()=>({description:'Bad Request: message thread not found'})};
    },log:x=>logs.push(x),
  }),/topic_unavailable/);
  assert.deepEqual(calls,['getMe','getChat','createForumTopic','sendMessage']);
  assert.equal(JSON.parse(logs.at(-1)).stage,'telegram-probe-failed');
});
