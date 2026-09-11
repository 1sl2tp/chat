import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseSessionStore} from '../src/session-store.mjs';

const credentials={cookie:[{name:'zpsid',value:'cookie'}],imei:'imei-1',userAgent:'ua-1'};

test('session store loads credentials through protected edge endpoint',async()=>{
  const calls=[];
  const store=createSupabaseSessionStore({
    supabaseUrl:'https://project.supabase.co',
    publishableKey:'pk-test',
    bridgeToken:'bridge-secret',
    fetchImpl:async(url,options)=>{
      calls.push([url,options]);
      return {ok:true,json:async()=>({ok:true,credentials})};
    },
  });
  assert.deepEqual(await store.load(),credentials);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'https://project.supabase.co/functions/v1/v21-zalo-session');
  assert.equal(calls[0][1].method,'GET');
  assert.equal(calls[0][1].headers['x-bridge-token'],'bridge-secret');
  assert.equal(calls[0][1].headers.apikey,'pk-test');
});

test('session store saves credentials through protected edge endpoint',async()=>{
  const calls=[];
  const store=createSupabaseSessionStore({
    supabaseUrl:'https://project.supabase.co/',
    publishableKey:'pk-test',
    bridgeToken:'bridge-secret',
    fetchImpl:async(url,options)=>{
      calls.push([url,options]);
      return {ok:true,json:async()=>({ok:true})};
    },
  });
  await store.save(credentials);
  assert.equal(calls[0][1].method,'POST');
  assert.equal(calls[0][1].headers['content-type'],'application/json');
  assert.deepEqual(JSON.parse(calls[0][1].body),{credentials});
});

test('session store rejects failed edge responses',async()=>{
  const store=createSupabaseSessionStore({
    supabaseUrl:'https://project.supabase.co',
    publishableKey:'pk-test',
    bridgeToken:'bridge-secret',
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'unauthorized'})}),
  });
  await assert.rejects(()=>store.load(),/session_store_http_403/);
});
