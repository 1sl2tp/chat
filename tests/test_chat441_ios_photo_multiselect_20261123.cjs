'use strict';
// CHAT-441: no live customer account, network, send transaction or real photos.
// Exercise the actual iOS picker handler + image batch handler in isolation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const app=fs.readFileSync('app.js','utf8');

assert.match(html,/<input id="upload-photos"[^>]*\bmultiple\b[^>]*accept="image\/\*"/);
assert.match(html,/<input id="upload-ios-source"[^>]*\bmultiple\b/);
assert.match(app,/RuntimeProfile\.pickerMode==='ios-native'[\s\S]*openNativeFilePicker\(uploadIOSSourceInput\)/);
assert.match(app,/uploadIOSSourceInput\?\.addEventListener\('change',[\s\S]*addIOSNativeSourceFromInput\(uploadIOSSourceInput\)/);
const extract=(from,to)=>{
  const start=app.indexOf(from);
  assert(start>=0,'missing real source function '+from);
  const end=app.indexOf(to,start);
  assert(end>start,'missing function end '+to);
  return app.slice(start,end);
};
const ios=extract('async function addIOSNativeSourceFromInput(input){','\n\nfunction formatAudioClock');
const calls=[];
const ctx={
  Array,String,Boolean,console,
  imageMimeFromName:name=>/\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(String(name||''))?'image/jpeg':'',
  ingestImageFiles:async files=>{calls.push({kind:'images',names:files.map(f=>f.name)});return{added:files.length}},
  ingestFileAttachments:async files=>{calls.push({kind:'file',names:files.map(f=>f.name)});return{added:1}},
  supportedFileAttachment:file=>/\.(pdf|docx?|xlsx?|txt|csv)$/i.test(String(file?.name||'')),
  composerHint:{textContent:''}
};
vm.createContext(ctx);vm.runInContext(ios+'\n;globalThis.pick=addIOSNativeSourceFromInput;',ctx);
const file=(name,type='image/jpeg')=>({name,type});
async function choose(files){
  const input={files,value:'C:\\fakepath\\last-selected'};
  await ctx.pick(input);
  assert.equal(input.value,'','native picker must reset for identical second selection');
}
(async()=>{
  await choose([]);
  assert.equal(calls.length,0);
  await choose([file('1.jpg'),file('2.jpg'),file('3.HEIC',''),file('4.png')]);
  assert.equal(calls.length,1,'one iOS Photos selection invokes one batch');
  assert.deepEqual(Array.from(calls.at(-1).names),['1.jpg','2.jpg','3.HEIC','4.png'],
    'must keep ALL photos in OS selection order');
  await choose([file('1.jpg'),file('2.jpg')]);
  assert.equal(calls.length,2,'same selection can be reopened immediately');
  await choose([file('receipt.pdf','application/pdf')]);
  assert.equal(calls.at(-1).kind,'file','one PDF still uses existing file path');
  await choose([file('a.jpg'),file('b.pdf','application/pdf')]);
  assert.equal(calls.at(-1).kind,'images','mixed media must not make unsupported image+file message');
  assert.deepEqual(Array.from(calls.at(-1).names),['a.jpg']);
  assert.match(ctx.composerHint.textContent,/tệp khác vui lòng chọn riêng/);
  await choose([file('unsupported.exe','application/octet-stream')]);
  assert.match(ctx.composerHint.textContent,/Chỉ hỗ trợ/);

  // Actual ingest implementation: lock each owner while a slow HEIC/photo
  // caches; unlock only after ALL selected photos settle, even on an error.
  const ingest=extract('async function ingestImageFiles(files,{scope=currentComposerScope()}={}){',
    '\nasync function addImagesFromInput(input){');
  let releaseFirst;
  const firstPending=new Promise(resolve=>{releaseFirst=resolve});
  let currentKey='draft-A';
  const appended=[],states=[];
  const asyncCtx={
    Array,String,Boolean,Number,Object,Map,console,Promise,
    imageIngressByDraft:new Map(),
    ComposerDraftOwner:{currentKey:()=>currentKey},
    syncSendButtonState:()=>states.push(asyncCtx.imageIngressByDraft.get(currentKey)||0),
    canonicalizeImageIngressFile:async raw=>raw,
    prepareImageAttachment:async raw=>{
      if(raw.name==='1.jpg')await firstPending;
      return{kind:'image',name:raw.name};
    },
    appendPreparedAttachment:(scope,item)=>{appended.push([scope.ownerDraftKey,item.name]);return true},
    composerHint:{textContent:''},
    currentComposerScope:()=>({ownerDraftKey:currentKey})
  };
  vm.createContext(asyncCtx);
  vm.runInContext(ingest+'\n;globalThis.process=ingestImageFiles;',asyncCtx);
  const scope={accountId:'account-A',conversationId:'conversation-A',mediaKey:'key-A',ownerDraftKey:'draft-A'};
  const promise=asyncCtx.process([file('1.jpg'),file('2.jpg'),file('3.jpg')],{scope});
  assert.equal(asyncCtx.imageIngressByDraft.get('draft-A'),1,'Send must remain blocked as selection prepares');
  releaseFirst();
  const processed=await promise;
  assert.equal(processed.added,3);
  assert.deepEqual(appended.map(x=>x[1]),['1.jpg','2.jpg','3.jpg']);
  assert.equal(asyncCtx.imageIngressByDraft.has('draft-A'),false,'batch completion unlocks Send');
  assert.equal(states[0],1);
  assert.equal(states.at(-1),0);

  assert.match(app,/!imageIngressPendingForCurrentDraft\(\)/,
    'Send button must remain unavailable while photos load');
  assert.match(app,/if\(\(!text&&pendingAttachments\.length===0\)\|\|sendLocked\|\|composing\|\|\s*imageIngressPendingForCurrentDraft\(\)\)return false/,
    'sendNow must protect against impatient submission while batch is pending');
  assert.match(app,/finally\{\s*const remaining=\(imageIngressByDraft\.get\(ownerKey\)\|\|1\)-1/,
    'a failed image must still release batch gate');
  console.log('CHAT-441 iOS native multi-photo picker and atomic draft readiness PASS');
})().catch(error=>{console.error(error);process.exit(1)});
