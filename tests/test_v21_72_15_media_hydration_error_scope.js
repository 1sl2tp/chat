const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','v21-media-cache.js'),'utf8');
const events=[];
const document={dispatchEvent(event){events.push(event);return true;}};
const existing={account_id:'A',asset_id:'asset-1',blob:null,remote_meta:{id:'asset-1',kind:'image',storage_key:'A/C/asset-1',conversation_id:'C'}};
const ctx={console,window:null,document,CustomEvent,Blob,Map,Date,Number,String,Boolean,Math,setTimeout,clearTimeout,navigator:{storage:{estimate:async()=>({usage:0,quota:0})}}};
ctx.window=ctx;
ctx.V21CacheStore={getMediaRecord:async()=>existing,putMediaRecord:async()=>true,listMediaRecords:async()=>[]};
vm.createContext(ctx);vm.runInContext(code,ctx);assert(ctx.V21MediaCache);
const client={storage:{from(){return{download:async()=>{throw new TypeError('Load failed')}}}}};
(async()=>{
  let rejected=false,result;
  try{result=await ctx.V21MediaCache.ensureRemote({accountId:'A',assetId:'asset-1',client});}catch(error){rejected=true;}
  assert.strictEqual(rejected,false,'transient media download must not reject into global runtime');
  assert.strictEqual(result,existing,'failed hydration should preserve existing metadata record');
  const e=events.find(event=>event.type==='v21-media-hydration-error');
  assert(e,'asset-scoped hydration error event must be emitted');
  assert.strictEqual(e.detail.accountId,'A');
  assert.strictEqual(e.detail.assetId,'asset-1');
  assert.strictEqual(e.detail.kind,'image');
  assert.strictEqual(e.detail.retryable,true);
  console.log('V21.72.15 media hydration error scope PASS');
})().catch(error=>{console.error(error);process.exit(1)});
