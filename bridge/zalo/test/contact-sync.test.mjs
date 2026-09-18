import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactSync,syncApiContacts,syncApiGroups} from '../src/contact-sync.mjs';

test('contact sync posts endpoint identity, name, avatar and thread type',async()=>{
  const calls=[];
  const sync=createContactSync({
    endpoint:'https://example.test/functions/v1/v21-zalo-contacts',
    bridgeToken:'secret',
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({ok:true,count:2})};
    },
  });

  const result=await sync([
    {userId:'z1',displayName:'C Sâm Phủ Lý',zaloName:'Sâm',avatar:'https://img/1.jpg',phoneNumber:'hidden'},
    {userId:'z2',displayName:'',zaloName:'Anh Bình',avatar:'https://img/2.jpg'},
    {userId:'',displayName:'Bỏ qua',avatar:'x'},
  ]);

  assert.deepEqual(result,{ok:true,count:2});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://example.test/functions/v1/v21-zalo-contacts');
  assert.equal(calls[0].options.headers['x-bridge-token'],'secret');
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    contacts:[
      {zalo_id:'z1',display_name:'C Sâm Phủ Lý',avatar_url:'https://img/1.jpg',thread_type:'user'},
      {zalo_id:'z2',display_name:'Anh Bình',avatar_url:'https://img/2.jpg',thread_type:'user'},
    ],
  });
});

test('syncApiContacts reads friends once and sends them to configured sync',async()=>{
  const calls=[];
  const api={
    async getAllFriends(){
      calls.push('friends');
      return [{userId:'z1',displayName:'C Sâm Phủ Lý',avatar:'https://img/1.jpg'}];
    },
  };
  const sync=async(rows)=>{
    calls.push(['sync',rows]);
    return {ok:true,count:rows.length};
  };
  const result=await syncApiContacts({api,sync});
  assert.deepEqual(result,{ok:true,count:1});
  assert.deepEqual(calls,[
    'friends',
    ['sync',[{userId:'z1',displayName:'C Sâm Phủ Lý',avatar:'https://img/1.jpg'}]],
  ]);
});

test('syncApiGroups resolves group ids, filters exact Vietnamese group name and marks group thread',async()=>{
  const calls=[];
  const api={
    async getAllGroups(){
      calls.push('groups');
      return {gridVerMap:{g1:'1',g2:'1'}};
    },
    async getGroupInfo(ids){
      calls.push(['info',ids]);
      return {gridInfoMap:{
        g1:{groupId:'g1',name:'Báo giá Tùng 0911479555',fullAvt:'https://img/group.jpg'},
        g2:{groupId:'g2',name:'Nhóm khác',fullAvt:''},
      }};
    },
  };
  const sync=async(rows)=>{
    calls.push(['sync',rows]);
    return {ok:true,count:rows.length};
  };
  const result=await syncApiGroups({api,sync,filter:'Báo giá Tùng 0911479555'});
  assert.deepEqual(result,{ok:true,count:1,matched:1,names:['Báo giá Tùng 0911479555']});
  assert.deepEqual(calls,[
    'groups',
    ['info',['g1','g2']],
    ['sync',[{groupId:'g1',name:'Báo giá Tùng 0911479555',fullAvt:'https://img/group.jpg',threadType:'group'}]],
  ]);
});
