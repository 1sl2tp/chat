const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function extract(a,b){
  const from=source.indexOf(a),to=source.indexOf(b,from);
  assert(from>=0&&to>from,'owner section missing: '+a);
  return source.slice(from,to);
}
const code=[
  extract('function canonicalMedia(payload){','\nasync function enrichMessageWithMedia'),
  extract('async function refreshMessageSessionFromMedia(','\nfunction conversationHydrationKey'),
  extract('function markActiveMessageDirty(','\nasync function patchContactSummary(')
].join('\n');
function session(){
  const parent={id:'message-1',conversation_id:'thread-1',sender_account_id:'sender',
    body:'Xin chào',created_at:'2026-10-10T00:00:00Z',_media_assets:[]};
  let fullScans=0,renders=0;const ui=[];
  const store={
    getMessage:async(_,id)=>id===parent.id?{...parent}:null,
    putMessage:async(_,item)=>{Object.assign(parent,item);return true}
  };
  const ctx={
    accountId:'admin',currentConversationId:'thread-1',
    dirtyActiveMessageIds:new Set(),activeDirtyNeedsFullMediaIndex:false,
    cache:()=>store,
    media:()=>({
      listForMessage:async()=>{fullScans++;return [];},
      indexByMessage:async()=>{fullScans++;return new Map();}
    }),
    contacts:()=>({snapshot:()=>[]}),
    messages:()=>({
      mergeForContact:item=>ui.push(item._media_assets.map(a=>a.id).join(',')),
      apply:item=>{renders++;ui.push(item._media_assets.map(a=>a.id).join(','));}
    }),
    contactIdForConversation:()=> 'contact-1',
    String,Number,Array,Set,Map,Date,Boolean,Object
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,parent,ui,fullScans:()=>fullScans,renders:()=>renders,
    async onMedia(asset){
      await ctx.refreshMessageSessionFromMedia('message-1','thread-1',asset);
      ctx.markActiveMessageDirty('message-1','thread-1');
      await ctx.flushActiveMessageVisuals();
    }};
}
(async()=>{
  const devices=[session(),session()];
  const album=[
    {id:'image-1',message_id:'message-1',conversation_id:'thread-1',kind:'image',sort_index:0,version:1},
    {id:'file-2',message_id:'message-1',conversation_id:'thread-1',kind:'file',sort_index:1,version:1},
    {id:'audio-3',message_id:'message-1',conversation_id:'thread-1',kind:'audio',sort_index:2,version:1}
  ];
  for(const asset of album)await Promise.all(devices.map(d=>d.onMedia(asset)));
  for(const d of devices){
    assert.deepStrictEqual(Array.from(d.parent._media_assets,a=>a.id),['image-1','file-2','audio-3']);
    assert.strictEqual(d.fullScans(),0,'realtime media updates must not scan full IndexedDB Blob index');
    assert.strictEqual(d.renders(),3,'one render per canonical media event');
  }
  await Promise.all(devices.map(d=>d.onMedia({...album[0],version:2,deleted_at:'2026-10-10T02:00:00Z'})));
  for(const d of devices){
    assert.deepStrictEqual(Array.from(d.parent._media_assets,a=>a.id),['file-2','audio-3'],'delete keeps other assets intact');
    assert.strictEqual(d.fullScans(),0,'delete also skips full scan');
    d.ctx.markActiveMessageDirty('message-1','thread-1',{reconcileMedia:true});
    await d.ctx.flushActiveMessageVisuals();
    assert.strictEqual(d.fullScans(),1,'message event retains durable reconciliation for out-of-order arrivals');
  }
  console.log('UI-137 isolated Web/PWA media metadata/order/delete and bounded disk reads PASS');
})().catch(error=>{console.error(error);process.exit(1)});
