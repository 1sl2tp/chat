'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const start=source.indexOf('function bankReportSessionOwner(){');
const end=source.indexOf('function cardValue(',start);
const modalStart=source.indexOf('function closeViewer(){');
const resetStart=source.indexOf('function resetBankReportEntryScroll(){',modalStart);
const modalEnd=source.indexOf('function synchronize(){',resetStart);
const syncEnd=source.indexOf('ui.refresh.addEventListener(',modalEnd);
assert(start>0&&end>start&&modalStart>0&&resetStart>modalStart&&modalEnd>resetStart&&syncEnd>modalEnd);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const makeOwner=(id,session)=>({state:'AUTHENTICATED',account:{role:'admin',id},appSessionId:session});
const identity={value:makeOwner('adminA','sessionA')};
const snapshots={snapshot:()=>identity.value,getClient:()=>client};
const data={bills:[],summary:{matched_count:1},updated_at:'2026-11-02T12:00:00Z'};
let rpcQueues=[],paints=0,events=0,reloads=0,clears=0;
const client={rpc(){const d=deferred();rpcQueues.push(d);return d.promise;}};
const element=()=>({textContent:'',hidden:false,replaceChildren(){clears++;}});
const ui={date:{value:'2026-11-02',max:''},stamp:element(),summary:element(),status:element(),
 table:element(),groups:element(),viewer:{hidden:true,replaceChildren(){clears++;}},review:element()};
const state={ui,window:{V21AuthSessionStore:snapshots},document:{hidden:false,dispatchEvent(){events++;}},
 localDate:()=> '2026-11-02',paint(){paints++;},focusPushRecord(){},
 requestId:0,active:true,loading:false,queued:false,reportSessionOwner:'adminA|sessionA',
 CustomEvent:class{},Promise,Date,Intl,Error,console,Number,String};
vm.createContext(state);
vm.runInContext(source.slice(start,end),state);
const a=state.reload();
assert.equal(rpcQueues.length,3);
identity.value=makeOwner('adminB','sessionB');
state.reportSessionOwner='adminB|sessionB';state.requestId++;
rpcQueues.splice(0).forEach(x=>x.resolve({data,error:null}));
Promise.resolve(a).then(async()=>{
 assert.equal(paints,0,'stale account A must not paint the report for B');
 assert.equal(events,0,'stale report cannot mark bank summary viewed');
 const b=state.reload();
 assert.equal(rpcQueues.length,3);
 rpcQueues.splice(0).forEach(x=>x.resolve({data,error:null}));
 await b;
 assert.equal(paints,1,'new Admin B report paints once');
 const sync={active:true,reportSessionOwner:'adminA|sessionA',
  isReportContact:()=>true,bankReportSessionOwner:()=> 'adminB|sessionB',
  stage:{dataset:{}},root:{hidden:false},ui,
  requestId:4,selectedCustomer:'oldCustomer',filter:'review',current:{private:'A'},
  closeViewer(){clears++},closeReviewDialog(){clears++},dateReady(){},reload(){reloads++}};
 vm.createContext(sync);
 vm.runInContext(source.slice(resetStart,syncEnd),sync);
 sync.synchronize();
 assert.equal(sync.reportSessionOwner,'adminB|sessionB');
 assert.equal(sync.current,null);
 assert.equal(sync.filter,'all');
 assert.equal(reloads,1);
 assert.equal(sync.requestId,5,'old in-flight response invalidated');
 console.log('BANK-225: authenticated bank dashboard session rotation PASS');
}).catch(error=>{console.error(error);process.exitCode=1});
