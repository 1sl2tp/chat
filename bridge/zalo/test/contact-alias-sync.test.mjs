import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactSync,syncApiContacts} from '../src/contact-sync.mjs';

test('contact sync prefers Zalo friend alias while preserving the profile name',async()=>{
  const calls=[];
  const sync=createContactSync({
    endpoint:'https://example.test/functions/v1/v21-zalo-contacts',
    bridgeToken:'secret',
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({ok:true,count:2})};
    },
  });
  const api={
    async getAllFriends(){
      return [
        {userId:'z1',displayName:'Hậu Thủy',zaloName:'Hậu Thủy',avatar:'https://img/1.jpg'},
        {userId:'z2',displayName:'Lã Hoàng Tiệp',zaloName:'Lã Hoàng Tiệp',avatar:'https://img/2.jpg'},
      ];
    },
    async getAliasList(count,page){
      assert.equal(count,100);
      if(page===1)return {items:[{userId:'z1',alias:'A Hậu Còi'},{userId:'z2',alias:'A Tiệp nh'}],updateTime:'1'};
      return {items:[],updateTime:'1'};
    },
  };

  const result=await syncApiContacts({api,sync});

  assert.deepEqual(result,{ok:true,count:2});
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    contacts:[
      {zalo_id:'z1',display_name:'Hậu Thủy',alias_name:'A Hậu Còi',avatar_url:'https://img/1.jpg',thread_type:'user'},
      {zalo_id:'z2',display_name:'Lã Hoàng Tiệp',alias_name:'A Tiệp nh',avatar_url:'https://img/2.jpg',thread_type:'user'},
    ],
    alias_snapshot_complete:true,
  });
});

test('contact sync keeps working when alias lookup fails and does not declare a complete alias snapshot',async()=>{
  const calls=[];
  const sync=createContactSync({
    endpoint:'https://example.test/functions/v1/v21-zalo-contacts',
    bridgeToken:'secret',
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({ok:true,count:1})};
    },
  });
  const api={
    async getAllFriends(){return [{userId:'z1',displayName:'Hậu Thủy',avatar:'https://img/1.jpg'}];},
    async getAliasList(){throw new Error('temporary_alias_failure');},
  };

  await syncApiContacts({api,sync});

  assert.deepEqual(JSON.parse(calls[0].options.body),{
    contacts:[{zalo_id:'z1',display_name:'Hậu Thủy',avatar_url:'https://img/1.jpg',thread_type:'user'}],
    alias_snapshot_complete:false,
  });
});
