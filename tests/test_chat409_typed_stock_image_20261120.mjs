import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseStockImageModel,PROMPT,readStockImageWithGemini}
 from '../supabase/functions/v21-ncc-ai-room/chat-stock-read.mjs';
const edge=fs.readFileSync('supabase/functions/v21-ncc-ai-room/index.ts','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('incoming-message-layout.css','utf8');
const parserSource=fs.readFileSync('incoming-message-layout.js','utf8');
const clientSource=fs.readFileSync('chat-stock-image-read.js','utf8');
const uiSource=fs.readFileSync('chat-stock-image-ui.js','utf8');
assert(PROMPT.includes('Numbers before * or × can be prices or sizes'));
assert(PROMPT.includes('a newer photo can be a corrected version'));
const model={
 classification:'typed_stock_list',
 lines:[
  {raw:'Tương ớt 250 - 370 *5 THÙNG',name:'Tương ớt 250',quantity:5,unit:'thùng'},
  {raw:'Tương ớt 500 - 342 *5 THÙNG',name:'Tương ớt 500',quantity:5,unit:'thùng'},
  {raw:'Tương ớt 1KG *5 THÙNG',name:'Tương ớt 1KG',quantity:5,unit:'thùng'},
  {raw:'Dầu mezan 1L 549*10 thùng',name:'Dầu mezan 1L',quantity:10,unit:'thùng'},
  {raw:'Sữa thọ đỏ giấy 380*1 thùng',name:'Sữa thọ đỏ giấy',quantity:1,unit:'thùng'},
  {raw:'Sữa nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 5 thùng',name:'Sữa nuvi to',quantity:5,unit:'thùng',uncertain:true},
  {raw:'Cháo gấu đỏ gà - 150 *5',name:'Cháo gấu đỏ gà',quantity:5},
  {raw:'Om 1.2 *3 thùng',name:'Om 1.2',quantity:3,unit:'thùng'},
  {raw:'Om 5kg *3 thùng',name:'Om 5kg',quantity:3,unit:'thùng'},
  {raw:'Giá tương ớt 370, SL??',name:'tương ớt',quantity:370}
 ],notes:['chưa rõ có bao nhiêu vị Sữa nuvi']
};
const parsed=parseStockImageModel(model);
assert.equal(parsed.classification,'typed_stock_list');
assert.deepEqual(parsed.lines.map(x=>[x.name,x.qty]),[
 ['Tương ớt 250',5],['Tương ớt 500',5],['Tương ớt 1KG',5],
 ['Dầu mezan 1L',10],['Sữa thọ đỏ giấy',1],['Cháo gấu đỏ gà',5],
 ['Om 1.2',3],['Om 5kg',3]
],'price 370/549/150 and product sizes cannot become quantities');
assert(parsed.lines.every(x=>x.review),'OCR output must always be yellow review');
assert(parsed.notes.some(x=>x.includes('mỗi màu')));
assert.equal(parseStockImageModel({classification:'other',lines:model.lines}).lines.length,0,
 'bank slips, personal photos and regular chat screenshots must not be parsed');
const forced=parseStockImageModel({classification:'typed_stock_list',lines:[
 {raw:'Cháo gấu đỏ gà - 150 *5',name:'Cháo gấu đỏ gà',quantity:150}
]});
assert.equal(forced.lines.length,0,'model quantity mismatch to *5 must be rejected');
const bytes=new Uint8Array([255,216,255,...Array(100).fill(0)]);
let calls=0;
const ai=await readStockImageWithGemini({
 bytes,mime:'image/jpeg',key:'test',
 fetcher:async(url,options)=>{
  calls++;
  assert(url.includes('gemini-3.5-flash-lite'));
  const request=JSON.parse(options.body);
  assert(request.contents[0].parts[1].inline_data.data);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(model)}]}}]})};
 }
});
assert.equal(calls,1);
assert.deepEqual(ai.lines.map(x=>x.qty),parsed.lines.map(x=>x.qty));
const edgeBlock=edge.slice(edge.indexOf('async function handleChatStockImage('),
 edge.indexOf('async function handleSend('));
assert(edge.includes('if(action==="chat_stock_image")return handleChatStockImage(body)'));
assert(edge.includes('const admin=await requireAdmin(req);'));
assert(!/\.insert\(|\.upsert\(|\.upload\(|\.update\(|\.delete\(/.test(edgeBlock),
 'image action must not write Storage or database');
assert(clientSource.includes("action:'chat_stock_image'"));
assert(clientSource.includes("cache.set(key,result)"));
// CHAT-412: A swipe inside the giant summary must reach ScrollRoot even if
// the card stops bubbling to avoid triggering message actions.
assert(clientSource.includes("blob.type==='image/jpg'"),
 'legacy image/jpg must still be normalized for OCR');
assert(clientSource.includes("new Blob([blob],{type:'image/jpeg'})"));
assert(app.includes("{passive:true,capture:true}"),
 'capture-phase pointer/touch ownership is required below the day card');
const pointerStart=app.indexOf("scrollRoot.addEventListener(",app.indexOf("function isInteractiveScrollIntentTarget"));
const pointerHandler=app.slice(pointerStart,app.indexOf("window.addEventListener(",pointerStart));
assert(pointerStart>=0,'scroll handler must exist');
assert(pointerHandler.includes("markUserScrollIntent(900)"));
assert(pointerHandler.includes("capture:true"));
const touchHandler=app.slice(app.indexOf("scrollRoot.addEventListener('touchstart'"),
 app.indexOf("window.addEventListener('keydown'"));
assert(touchHandler.includes("markUserScrollIntent(1100)"));
assert(touchHandler.includes("capture:true"));
assert(app.includes("extendUserScrollIntentForMomentum(650)"),
 'iOS inertia must not be treated as geometry-driven auto-follow');
assert(app.includes("!hasUserScrollIntent();"),
 'a pending touch blocks auto-follow before USER_AWAY is recorded');
assert(app.includes("return{followTail,preserve:followTail?'AUTO':'VIEW'}"),
 'passive updates never write stale scroll pixel anchors');
assert(!app.includes("preserve:hasUserScrollIntent()?'VIEW':'ANCHOR'"),
 'OCR review and capability changes cannot restore scrollTop during swipes');
assert(app.includes("String(reason).startsWith('geometry:'))&&hasUserScrollIntent())return;"),
 'geometry-triggered tail reconciliation cannot steal native scrolling');
assert(clientSource.includes('if(owner()?.key!==who.key)'));
assert(uiSource.includes("Đọc chữ hàng trong ảnh"));
assert(uiSource.includes("reader.scan(assetId)"));
assert(!uiSource.includes("queueMediaFiles("));
assert(app.includes('imageReadings:stockImageReadings(message)'));
assert(app.includes("stockImageReadings(message).map(read=>["));
assert(app.includes("if(summary?.items?.length||summary?.imageGroups?.length)"));
assert(html.includes('data-build-source="chat-stock-image-read.js"'));
assert(html.includes('data-build-source="chat-stock-image-ui.js"'));
assert(html.indexOf('data-build-source="chat-stock-image-read.js"')<
 html.indexOf('data-build-source="app.js"'));
assert(css.includes('#messageWindow .message-stock-image-read-button'));
assert(css.includes('#messageWindow .day-order-image-source'));
const scope={};
function node(tag){
 let value='';
 return {tagName:tag,dataset:{},children:[],attrs:{},
  set textContent(v){value=String(v);this.children=[];},
  get textContent(){return value+this.children.map(x=>x.textContent).join('');},
  append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=[...children]},
  setAttribute(name,value){this.attrs[name]=value},
  addEventListener(){}
 };
}
new Function('window','document',parserSource)(scope,{createElement:node});
const messages=[
 {sender:'remote',media:{type:'image'},stamp:Date.parse('2026-11-20T03:49:00Z'),
  imageReadings:[{assetId:'a',status:'read',lines:parsed.lines,notes:parsed.notes}]},
 {sender:'remote',media:{type:'image'},stamp:Date.parse('2026-11-20T04:06:00Z'),
  imageReadings:[{assetId:'b',status:'read',lines:parsed.lines.slice(2,6),notes:[]}]}
];
const combined=scope.V21IncomingMessageLayout.summarizeDay(messages);
assert.equal(combined.kind,'daily-order');
assert.equal(combined.items.length,0,'OCR must not be mixed into text-only aggregates');
assert.equal(combined.imageGroups.length,2,'two image versions stay distinct');
assert.deepEqual(combined.imageGroups[0].items.map(x=>x.qty),
 parsed.lines.map(x=>x.qty));
assert(combined.imageGroups[1].items.every(x=>x.review));
const target=node('div');
assert(scope.V21IncomingMessageLayout.renderDailySummary(target,combined));
assert(target.textContent.includes('Ảnh 10:49'));
assert(target.textContent.includes('Ảnh 11:06'));
assert(target.textContent.includes('Không cộng vào hàng từ tin'));
assert(target.textContent.includes('Cần hướng dẫn'));
assert(!/fetch\(|localStorage|supabase\./.test(parserSource),
 'pure day summarizer must not trigger remote operations');
// CHAT-410: the old deployed Edge version does NOT support chat_stock_image.
// No click can upload media before the explicit server health feature exists.
let supported=false,healthCalls=0,events=[];
const auth={
 snapshot:()=>({state:'AUTHENTICATED',account:{id:'admin-one',role:'admin'},
  appSessionId:'session-one'}),
 getClient:()=>({functions:{invoke:async(name,{body})=>{
  assert.equal(name,'v21-ncc-ai-room');
  assert.equal(body.action,'health');
  healthCalls++;
  return {data:{ok:true,ready:true,
   features:supported?['chat_stock_image']:['invoice_totals_v2']},error:null};
 }}})
};
const fakeWindow={V21AuthSessionStore:auth,
 V21SyncEngine:{snapshot:()=>({currentConversationId:'private-conversation'})}};
const fakeDoc={addEventListener(){},dispatchEvent:event=>events.push(event.type)};
new Function('window','document','Event','Blob',clientSource)(
 fakeWindow,fakeDoc,class Event{constructor(type){this.type=type}},Blob
);
const scopedReader=fakeWindow.V21ChatStockImageRead;
assert.equal(await scopedReader.checkReady(),false);
assert.equal(scopedReader.availability(),false);
await assert.rejects(scopedReader.scan('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
 /ocr_not_deployed/,
 'never upload customer photos to an older Edge function');
assert.equal(healthCalls,1,'feature detection must be cached per Admin conversation');
assert.deepEqual(events,['v21-stock-image-capability']);
supported=true;scopedReader.clear();
assert.equal(await scopedReader.checkReady(),true);
assert.equal(scopedReader.availability(),true);
assert.equal(healthCalls,2);
assert(edge.includes('"canonical_product_links_v1","chat_stock_image"'),
 'new Edge release announces capability only with actual OCR implementation');
assert(uiSource.includes("capability===false?'Chưa triển khai bộ đọc ảnh'"));
assert(uiSource.includes('button.disabled=Boolean(current)||capability!==true'));
assert(app.includes("document.addEventListener('v21-stock-image-capability'"));

console.log('CHAT-409 typed stock image OCR isolated and day-grouped PASS');
