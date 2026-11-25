'use strict';
const assert=require('node:assert/strict');
const {createReadHost}=require('../chat-0v-read-host.js');
(async()=>{
 let s={state:'AUTHENTICATED',account:{id:'a'},appSessionId:'private-session'},calls=[],release;
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='v21_contacts_sidebar')return {data:[{id:'c',display_name:'Mẫu',conversation_id:'room',avatar_path:'private',username:'private'},{id:'empty',display_name:'Trống',conversation_id:null}]};return {data:{account_id:'a',messages:[{id:'m',conversation_id:'room',sender_account_id:'a',body:'Mẫu',created_at:'2026-11-25T18:00:00Z',client_id:'private'}]}}}};
 const host=createReadHost({session:()=>s,client:()=>db});
 assert.deepEqual(host.start(),{accountId:'a',epoch:'approved-host-session',approved:true});
 await assert.rejects(host.read('thread','c'),/forbidden/);assert.equal(calls.length,0);
 const rows=await host.read('directory');assert.equal(rows.length,2);assert(!('username'in rows[0]));assert(!('avatar_path'in rows[0]));
 assert.deepEqual(await host.read('thread','empty'),[]);assert.equal(calls.length,1);
 const msgs=await host.read('thread','c');assert.equal(msgs[0].body,'Mẫu');assert(!('client_id'in msgs[0]));assert.equal(calls[1].name,'v21_sync_snapshot');assert.equal(calls[1].args.p_message_limit,100);
 await assert.rejects(host.read('send','c'),/not_allowed/);assert.equal(calls.length,2);
 const slow={rpc:async()=>await new Promise(r=>{release=r})};const other=createReadHost({session:()=>s,client:()=>slow});other.start();const pending=other.read('directory');s={...s,appSessionId:'changed'};release({data:[]});await assert.rejects(pending,/session_changed/);
 assert.equal(host.valid(),false);host.close();await assert.rejects(host.read('directory'),/unavailable/);
 const fs=require('node:fs'),asset=fs.readFileSync('0v-read.html','utf8');assert(asset.includes("connect-src 'none'"));assert(!asset.includes('Main.mount();'));assert(!asset.includes('ReleaseUpdater.start();'));console.log('CHAT-447 read scope, no writes, stale session and asset isolation PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
