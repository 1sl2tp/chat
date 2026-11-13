'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// SPEC-CHAT-DIRECTORY-GROUPS-AUTH-RACE-20261102
// A pending directory_groups request must not block the first fetch for
// a newly authenticated admin. No backend calls beyond one per admin.
const src=fs.readFileSync('contact-directory-admin.js','utf8');
const start=src.indexOf('async function ensureGroups({force=false}={}){');
const end=src.indexOf('\ninstallStyle();',start);
assert(start>=0&&end>start,'canonical admin group request owner exists');
const fragment=src.slice(start,end);

function fixture(){
  let admin={id:'A',role:'admin'};
  const requests=[];
  let tools=null;
  const updates=[];
  const ctx=vm.createContext({
    currentAdmin:()=>admin,
    directoryTools:()=>tools,
    ensureDirectoryTools:()=>{},
    syncDirectoryRows:()=>updates.push('directory'),
    syncAdminGroupControls:()=>updates.push('controls'),
    publishGroupsChanged:()=>updates.push('changed'),
    syncNccCapability:()=>updates.push('ncc-capability'),
    groupKey:value=>value||'other',
    invokeBody:body=>new Promise((resolve,reject)=>requests.push({body,adminId:admin?.id,resolve,reject})),
    queueMicrotask,
    String,Map,Array,
  });
  vm.runInContext(
    "let groupMap=new Map();let loadedAdminId='';let loadingGroups=false;let nccReady=false;" +
    "let query='';let filter='all';let syncScrollToTop=false;let syncQueued=false;\n" +
    fragment +
    "\nthis.api={ensureGroups,resetForAuth,get:()=>({loadedAdminId,loadingGroups,groups:[...groupMap]})};",ctx);
  return {api:ctx.api,requests,updates,as(id){admin=id?{id,role:'admin'}:null;ctx.api.resetForAuth();}};
}
const drain=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

async function check(rejectOld){
  const f=fixture();
  const old=f.api.ensureGroups();
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].adminId,'A');
  f.as('B');
  await drain();
  assert.equal(f.requests.length,1,'B waits only while A is pending');
  if(rejectOld)f.requests[0].reject(Error('account A request failed'));
  else f.requests[0].resolve({groups:[{id:'user-A',contact_group:'friend'}]});
  await old;
  await drain();
  assert.equal(f.requests.length,2,'B fetch automatically starts after A settles');
  assert.equal(f.requests[1].adminId,'B');
  assert.equal(f.api.get().loadedAdminId,'');
  assert.deepEqual(Array.from(f.api.get().groups),[],'A data never enters B scope');
  f.requests[1].resolve({groups:[{id:'user-B',contact_group:'customer'}]});
  await drain();
  const actual=f.api.get();
  assert.equal(actual.loadedAdminId,'B');
  assert.deepEqual(Array.from(actual.groups),[['user-B','customer']]);
  assert.equal(actual.loadingGroups,false);
  assert.equal(f.requests.length,2,'no duplicate backend fetch');
}
(async()=>{
  await check(false);
  await check(true);
  console.log('CHAT directory groups auth-switch in-flight success/failure PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
