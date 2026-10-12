'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-cache-store.js'),'utf8');
const from=source.indexOf('async function listMessages(');
const to=source.indexOf('async function removeMessage(',from);
assert(from>=0&&to>from,'bounded cache owner missing');
let visited=0;
const all=[];
for(let i=0;i<1200;i++)all.push({
  cache_key:'a:message:'+String(i).padStart(4,'0'),
  account_id:'a',conversation_id:'conv-a',
  id:String(i).padStart(4,'0'),created_at:'2026-10-10T00:00:'+String(Math.floor(i/20)%60).padStart(2,'0')+'Z',
  deleted_at:i>=1100&&i%19===0?'2026-10-11':null
});
all.push({cache_key:'b:message:excluded',account_id:'b',conversation_id:'conv-a',id:'excluded',created_at:'9999',deleted_at:null});
all.push({cache_key:'a:message:other-conversation',account_id:'a',conversation_id:'other',id:'other',created_at:'9999',deleted_at:null});
const sorted=all.filter(row=>row.account_id==='a'&&row.conversation_id==='conv-a')
  .sort((x,y)=>x.created_at.localeCompare(y.created_at)||x.cache_key.localeCompare(y.cache_key));
const index={
  openCursor(range,direction){
    assert.strictEqual(direction,'prev','must read backwards from indexed timestamp');
    assert.strictEqual(JSON.stringify(range.lower),JSON.stringify(['a','conv-a','']));
    assert.strictEqual(JSON.stringify(range.upper),JSON.stringify(['a','conv-a',String.fromCharCode(0xffff)]));
    const reversed=sorted.slice().reverse();
    let at=0;
    const request={error:null,onerror:null,onsuccess:null};
    const fire=()=>queueMicrotask(()=>{
      const item=reversed[at];
      if(item)visited++;
      request.result=item?{value:item,continue(){at++;fire();}}:null;
      request.onsuccess?.();
    });
    fire();
    return request;
  }
};
const cacheDb={transaction(){return{objectStore(){return{index(){return index;}}}};}};
const context={
  open:async()=>cacheDb,txDone:async()=>true,
  IDBKeyRange:{bound:(lower,upper)=>({lower,upper})},
  String,Math,Number,Promise,Error
};
vm.createContext(context);
const listMessages=vm.runInContext('('+source.slice(from,to).trim()+')',context);
(async()=>{
  const result=await listMessages('a','conv-a',100);
  assert.strictEqual(result.length,100);
  assert(visited<=110,'should visit only newest needed rows plus tombstones');
  const expected=sorted.filter(x=>!x.deleted_at).slice(-100);
  assert.deepStrictEqual(result.map(x=>x.id),expected.map(x=>x.id),'ascending chronological order, same-time ID tie order');
  assert(result.every(x=>!x.cache_key&&!x.account_id),'private storage envelope stripped');
  const sync=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
  assert(!sync.includes('prewarmCachedContacts('),'boot must not hydrate inactive conversations');
  console.log('Chat IndexedDB bounded startup cursor PASS visited='+visited);
})().catch(e=>{console.error(e);process.exitCode=1;});
