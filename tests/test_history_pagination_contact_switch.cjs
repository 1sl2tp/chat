// Regression: a stale history request must never disable the new contact's button.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('async function loadMoreServerHistory(){');
const end=source.indexOf("historyMoreButton?.addEventListener",start);
assert.ok(start>=0&&end>start,'history loader must exist');
const loader=source.slice(start,end);
const resetStart=source.indexOf('function beginConversationViewContext(){');
const resetEnd=source.indexOf('function cancelTailRevealOnly(){',resetStart);
assert.ok(resetStart>=0&&resetEnd>resetStart,'conversation reset must exist');
const reset=source.slice(resetStart,resetEnd);
for(const outcome of ['success','failure','throw']){
 test('stale history request after contact switch: '+outcome,async()=>{
  let finish,fail;
  const pending=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
  const button={disabled:false,textContent:'Xem tin / ngày cũ hơn'};
  const historyStatus={textContent:'',classList:{add(){},remove(){}}};
  const context={historyMoreButton:button,historyStatus,historyMoreWrap:{hidden:false},conversationViewEpoch:1,
   window:{V21SyncEngine:{loadOlderHistory:()=>pending}},
   cancelPendingTailTransaction(){},windowRebaseFrame:0,loadingOlder:false,
   clearUserScrollIntentForExplicitTail(){},programmaticScrollGeneration:0,
   programmaticScroll:false,lastUserScrollTop:0,scrollRoot:{scrollTop:0}};
  vm.createContext(context);
  vm.runInContext(loader+'\n'+reset,context);
  const request=vm.runInContext('loadMoreServerHistory()',context);
  assert.equal(button.disabled,true);
  vm.runInContext('beginConversationViewContext()',context);
  assert.equal(button.disabled,false);
  if(outcome==='throw')fail(new Error('network'));
  else finish(outcome==='success'?{ok:true,has_more:false}:{ok:false,reason:'offline_or_no_context'});
  await request;
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Xem tin / ngày cũ hơn');
  assert.equal(context.historyMoreWrap.hidden,false,'stale request cannot change next contact');
 });
}

for(const oldOutcome of ['success','failure','throw']){
 test('old request cannot unlock newer in-flight history request: '+oldOutcome,async()=>{
  let resolveOld,rejectOld,resolveNew;
  const oldPending=new Promise((resolve,reject)=>{resolveOld=resolve;rejectOld=reject;});
  const newPending=new Promise(resolve=>{resolveNew=resolve;});
  let active=oldPending;
  const button={disabled:false,textContent:'Xem tin / ngày cũ hơn'};
  const historyStatus={textContent:'',classList:{add(){},remove(){}}};
  const context={historyMoreButton:button,historyStatus,historyMoreWrap:{hidden:false},conversationViewEpoch:1,
   window:{V21SyncEngine:{loadOlderHistory:()=>active}},
   cancelPendingTailTransaction(){},windowRebaseFrame:0,loadingOlder:false,
   clearUserScrollIntentForExplicitTail(){},programmaticScrollGeneration:0,
   programmaticScroll:false,lastUserScrollTop:0,scrollRoot:{scrollTop:0}};
  vm.createContext(context);
  vm.runInContext(loader+'\\n'+reset,context);
  const oldRequest=vm.runInContext('loadMoreServerHistory()',context);
  vm.runInContext('beginConversationViewContext()',context);
  active=newPending;
  const newRequest=vm.runInContext('loadMoreServerHistory()',context);
  assert.equal(button.disabled,true);
  if(oldOutcome==='throw')rejectOld(new Error('stale network failure'));
  else resolveOld(oldOutcome==='success'?{ok:true,has_more:false}:{ok:false,reason:'offline_or_no_context'});
  await oldRequest;
  assert.equal(button.disabled,true,'stale completion must not unlock new request');
  assert.equal(button.textContent,'Đang tải ngày cũ…');
  resolveNew({ok:true,has_more:true});
  await newRequest;
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Xem tin / ngày cũ hơn');
 });
}
