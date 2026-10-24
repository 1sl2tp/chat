import test from 'node:test';
import assert from 'node:assert/strict';
import {performZaloFriendAction,createZaloFriendActionWorker} from '../src/friend-action-worker.mjs';

const target={uid:'123456789012',display_name:'Minh Dương'};
function api(overrides={}){
 const logs=[];
 const impl={
  async findUser(phone){logs.push(['find',phone]);return target;},
  async getFriendRequestStatus(id){logs.push(['status',id]);return{is_friend:0,is_requested:0,is_requesting:0};},
  async sendFriendRequest(msg,id){logs.push(['send',msg,id]);return '';},
  async acceptFriendRequest(id){logs.push(['accept',id]);return '';},
  ...overrides,
 };
 return{impl,logs};
}
test('phone number triggers Zalo user lookup and sends real friend invite once',async()=>{
 const a=api(),result=await performZaloFriendAction(a.impl,{phone:'0975419705'});
 assert.equal(result.status,'sent');
 assert.equal(result.zalo_name,'Minh Dương');
 assert.equal(result.zalo_id,target.uid);
 assert.deepEqual(a.logs.map(x=>x[0]),['find','status','send']);
 assert.equal(a.logs[0][1],'0975419705');
 assert.equal(a.logs[2][2],target.uid);
});
test('already friends, already sent, or incoming invitation never send a duplicate',async()=>{
 for(const [flags,want,actions] of [
  [{is_friend:1},'already_friends',['find','status']],
  [{is_requesting:1},'already_sent',['find','status']],
  [{is_requested:1},'accepted',['find','status','accept']],
 ]){
  const x=api({async getFriendRequestStatus(id){x.logs.push(['status',id]);return flags;}});
  const result=await performZaloFriendAction(x.impl,{phone:'0975419705'});
  assert.equal(result.status,want);
  assert.deepEqual(x.logs.map(y=>y[0]),actions);
 }
});
test('unknown delivery/network results never retry or lie about friend status',async()=>{
 const x=api({async sendFriendRequest(){throw Object.assign(Error('timeout'),{code:408});}});
 const result=await performZaloFriendAction(x.impl,{phone:'0975419705'});
 assert.equal(result.status,'unknown');
 assert.equal(result.error_code,'zalo_send_unconfirmed');
 const y=api({async findUser(){throw Object.assign(Error('not found'),{code:216});}});
 const missing=await performZaloFriendAction(y.impl,{phone:'0975419705'});
 assert.equal(missing.status,'not_found');
 const z=api({async sendFriendRequest(){throw Object.assign(Error('blocked'),{code:215});}});
 assert.equal((await performZaloFriendAction(z.impl,{phone:'0975419705'})).status,'blocked');
 assert.equal((await performZaloFriendAction(x.impl,{phone:'xx'})).status,'failed');
});
test('one bridge claim produces exactly one result, no extra sends',async()=>{
 const x=api();let claim=0,done=0;
 const worker=createZaloFriendActionWorker({
  api:x.impl,endpoint:'https://example.invalid/bridge',bridgeToken:'test',
  fetchImpl:async(url,args)=>{
   assert.equal(args.headers['x-bridge-token'],'test');
   const request=JSON.parse(args.body);
   if(request.kind==='friend_action_next'){
    claim++;
    return{ok:true,json:async()=>({ok:true,job:claim===1?{id:'job-1',phone:'0975419705'}:null})};
   }
   assert.equal(request.kind,'friend_action_complete');
   assert.equal(request.id,'job-1');
   assert.equal(request.status,'sent');
   done++;
   return{ok:true,json:async()=>({ok:true})};
  },logger:{info(){},warn(){}},
 });
 assert.equal(await worker(),true);
 assert.equal(await worker(),false);
 assert.equal(claim,2);
 assert.equal(done,1);
 assert.equal(x.logs.filter(y=>y[0]==='send').length,1);
});
