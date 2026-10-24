import test from 'node:test';
import assert from 'node:assert/strict';
import {readVerifiedIncomingRequests,syncIncomingFriendRequests} from '../src/friend-requests-sync.mjs';

test('Only VERIFIED received friend requests show, recommendations and outgoing requests excluded',async()=>{
 const statusLookups=[];
 const api={
  async getFriendRecommendations(){return {recommItems:[
   {recommItemType:1,dataInfo:{userId:'12345678901',displayName:'Người được gợi ý',recommType:1}},
   {recommItemType:2,dataInfo:{userId:'12345678902',displayName:'Người gửi lời mời',recommType:2,recommTime:1792800000,recommInfo:{message:'Mời kết bạn'}}},
   {recommItemType:2,dataInfo:{userId:'12345678903',displayName:'Lời mời đã hủy',recommType:2}},
   {recommItemType:2,dataInfo:{userId:'12345678904',displayName:'Mình đã gửi lời mời',recommType:2}}
  ]};},
  async getFriendRequestStatus(id){
   statusLookups.push(id);
   return {'12345678902':{is_requested:1,is_friend:0},
    '12345678903':{is_requested:0,is_friend:0},
    '12345678904':{is_requested:0,is_requesting:1}}[id];
  }
 };
 const incoming=await readVerifiedIncomingRequests(api);
 assert.equal(incoming.length,1);
 assert.equal(incoming[0].zalo_id,'12345678902');
 assert.equal(incoming[0].display_name,'Người gửi lời mời');
 assert(!statusLookups.includes('12345678901'),'suggestion must never be checked as invitation');
 let sent;
 const sync=await syncIncomingFriendRequests({api,endpoint:'https://example.invalid/sync',bridgeToken:'fake',
  fetchImpl:async (_url,options)=>{
   sent=JSON.parse(options.body);
   assert.equal(options.headers['x-bridge-token'],'fake');
   return {ok:true,json:async()=>({ok:true})};
  }});
 assert.equal(sync.count,1);
 assert.equal(sent.kind,'incoming_friend_requests_snapshot');
 assert.deepEqual(sent.requests,incoming);
});

test('No successful snapshot when Zalo API is unavailable or shape changes',async()=>{
 await assert.rejects(()=>readVerifiedIncomingRequests({
  async getFriendRecommendations(){throw Error('session expired')},
  async getFriendRequestStatus(){return {is_requested:0}}
 }),/session expired/);
 await assert.rejects(()=>readVerifiedIncomingRequests({
  async getFriendRecommendations(){return {foo:[]}},
  async getFriendRequestStatus(){return {is_requested:0}}
 }),/zalo_request_inbox_format_changed/);
 await assert.rejects(()=>readVerifiedIncomingRequests({}),/unsupported/);
});

test('Explicit empty array is a successful checked state, not a failure',async()=>{
 const rows=await readVerifiedIncomingRequests({
  async getFriendRecommendations(){return {recommItems:[]}},
  async getFriendRequestStatus(){throw Error('never called')}
 });
 assert.deepEqual(rows,[]);
});
