import test from 'node:test';
import assert from 'node:assert/strict';
import {createZaloFriendAcceptanceMonitor} from '../src/friend-acceptance-monitor.mjs';

test('background friendship confirmation requires Zalo is_friend=1 before push',async()=>{
 const posted=[];
 const monitor=createZaloFriendAcceptanceMonitor({
  api:{async getFriendRequestStatus(id){return {is_friend:id==='123456789012'?1:0,is_requesting:1};}},
  endpoint:'https://example.invalid/friend',bridgeToken:'test',
  logger:{info(){},warn(){}},
  fetchImpl:async (_url,options)=>{
   assert.equal(options.headers['x-bridge-token'],'test');
   const q=JSON.parse(options.body);posted.push(q);
   return {ok:true,json:async()=>q.kind==='friend_watch_list'
    ?{ok:true,rows:[{id:'job-1',zalo_id:'123456789012'},{id:'job-2',zalo_id:'123456789013'}]}
    :{ok:true}};
  },
 });
 assert.equal(await monitor(),true);
 assert.deepEqual(posted.map(x=>x.kind),[
  'friend_watch_list','friend_watch_result','friend_watch_result','friend_notify_drain'
 ]);
 assert.equal(posted[1].is_friend,true);
 assert.equal(posted[2].is_friend,false);
 // Never call sendFriendRequest or acceptFriendRequest during status checks.
});
test('unexpected relationship response cannot claim acceptance',async()=>{
 const posted=[];
 const monitor=createZaloFriendAcceptanceMonitor({
  api:{async getFriendRequestStatus(){return {err:1};}},
  endpoint:'https://example.invalid/friend',bridgeToken:'test',
  logger:{info(){},warn(){}},
  fetchImpl:async (_url,options)=>{
   const q=JSON.parse(options.body);posted.push(q);
   return {ok:true,json:async()=>q.kind==='friend_watch_list'
    ?{ok:true,rows:[{id:'job-1',zalo_id:'123456789012'}]}:{ok:true}};
  }
 });
 assert.equal(await monitor(),true);
 assert.deepEqual(posted.map(x=>x.kind),['friend_watch_list','friend_notify_drain']);
});
test('network failure does not send a new friend invitation',async()=>{
 let sends=0;
 const monitor=createZaloFriendAcceptanceMonitor({
  api:{
   async getFriendRequestStatus(){throw Error('offline')},
   async sendFriendRequest(){sends++}
  },
  endpoint:'https://example.invalid/friend',bridgeToken:'test',
  logger:{info(){},warn(){}},
  fetchImpl:async (_url,options)=>{
   const q=JSON.parse(options.body);
   return {ok:true,json:async()=>q.kind==='friend_watch_list'
    ?{ok:true,rows:[{id:'job-1',zalo_id:'123456789012'}]}:{ok:true}};
  }
 });
 assert.equal(await monitor(),true);
 assert.equal(sends,0);
});
