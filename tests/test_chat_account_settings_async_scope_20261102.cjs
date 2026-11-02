'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const src=fs.readFileSync('zalo-admin-link.js','utf8');
const start=src.indexOf('async function refreshAccountAdmin(){');
const end=src.indexOf('function closeAccountAdmin(',start);
assert(start>0&&end>start,'settings snapshot writer owner exists');
assert(src.includes('if(accountModal===openingModal)setAccountBusy(false);'),
  'obsolete Settings open must never unlock a new modal');
assert(src.includes('if(accountModal===openingModal)setAccountError('),
  'obsolete Settings errors must never appear in a new modal');

async function fixture(){
  const oldModal={isConnected:true};
  const account={id:'admin-a'};
  const reads=[];
  let rendered=0;
  const ctx={
    accountModal:oldModal,accountSnapshotRequest:0,
    accountSnapshot:{accounts:['initial'],contacts:[],links:[]},
    currentAdmin:()=>account,
    invokeBody:()=>new Promise(resolve=>reads.push(resolve)),
    renderAccountRowsPreservingScroll:()=>rendered++
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start,end)+';this.refresh=refreshAccountAdmin;',ctx);
  return{ctx,reads,oldModal,rendered:()=>rendered};
}

(async()=>{
  {
    const f=await fixture();
    const request=f.ctx.refresh();
    f.ctx.accountModal={isConnected:true};
    f.reads[0]({snapshot:{accounts:['obsolete']}});
    await request;
    assert.equal(f.rendered(),0,'closed/replaced modal must reject obsolete snapshot');
    assert.equal(f.ctx.accountSnapshot.accounts[0],'initial');
  }
  {
    const f=await fixture();
    const request=f.ctx.refresh();
    f.ctx.currentAdmin=()=>({id:'admin-b'});
    f.reads[0]({snapshot:{accounts:['wrong-account']}});
    await request;
    assert.equal(f.rendered(),0,'account change must reject prior account snapshot');
  }
  {
    const f=await fixture();
    const old=f.ctx.refresh(),newer=f.ctx.refresh();
    f.reads[1]({snapshot:{accounts:['latest']}});
    await newer;
    f.reads[0]({snapshot:{accounts:['older']}});
    await old;
    assert.equal(f.rendered(),1,'only newest same-modal snapshot paints');
    assert.equal(f.ctx.accountSnapshot.accounts[0],'latest');
  }
  console.log('CHAT account settings async modal/account/snapshot scope PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
