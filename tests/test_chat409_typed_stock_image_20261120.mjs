// CHAT-417: browser-only OCR is manual and deterministic; NEVER Gemini/Edge.
// Contract check covers order quantity evidence, editable OCR, KH day grouping.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const rulesSource=read('chat-stock-ocr-rules.js');
const clientSource=read('chat-stock-image-read.js');
const uiSource=read('chat-stock-image-ui.js');
const app=read('app.js');
const html=read('index.source.html');
const css=read('incoming-message-layout.css');
const parserSource=read('incoming-message-layout.js');
const rulesWindow={};
new Function('window',rulesSource)(rulesWindow);
const rules=rulesWindow.V21ChatStockOCRRules;
assert(rules?.parse);
const imageOne=[
 'Chia men to *1 thùng',
 'Chia men bé *1 thùng',
 'Sút 400*3 thùng',
 'Sút 800*3 thùng',
 'Sút 5kg *2 thùng',
 'Om 1.2 *3 thùng',
 'Om 5kg *3 thùng'
].join('\n');
const imageTwo=[
 'Chao gau do ga - 150 *5',
 'Chao gau do suon - 150*5',
 'Tuong ot 250 - 370 *5 THUNG',
 'Tuong ot 1KG *5 THUNG',
 'Dầu mezan 1L 549*10 thùng',
 'Sua tho do giay 380*1 thùng',
 'Sữa Nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 5 thùng',
 'Om 1.2 *3 thùng',
 'Om 5kg *3 thùng'
].join('\n');
const first=rules.parse(imageOne),second=rules.parse(imageTwo);
assert.equal(first.classification,'typed_stock_list');
assert.deepEqual(first.lines.map(x=>[x.name,x.qty]),[
 ['Chia men to',1],['Chia men bé',1],
 ['Sút 400',3],['Sút 800',3],['Sút 5kg',2],
 ['Om 1.2',3],['Om 5kg',3]
]);
assert.deepEqual(second.lines.map(x=>[x.name,x.qty]),[
 ['Chao gau do ga',5],['Chao gau do suon',5],
 ['Tuong ot 250',5],['Tuong ot 1KG',5],
 ['Dầu mezan 1L',10],['Sua tho do giay',1],
 ['Om 1.2',3],['Om 5kg',3]
]);
assert(second.notes.some(x=>x.includes('mỗi màu')),
 'price correction / per color note must not turn into quantity');
assert(second.lines.every(x=>x.review));
assert.equal(second.raw_text,imageTwo);
assert.equal(rules.parse('Giá 370\nBáo giá 549').lines.length,0);
assert.equal(rules.parse('Ngân hàng Agribank\nSố tài khoản: 123\nSố tiền: 500.000\nChuyển khoản thành công').lines.length,0);
assert.equal(rules.parse('Pepsi lon\nLong mềm').classification,'other');
assert.deepEqual(rules.parse('454 10t\nKopico sữa sl 3\nCosy bơ 600 sl3\n1kg sl 20').lines.map(x=>[x.name,x.qty]),[
 ['454',10],['Kopico sữa',3],['Cosy bơ 600',3],['1kg',20]
]);
assert.equal(rules.parse('Sút 800*2*3 thùng').lines.length,0,
 'ambiguous double multiplier must not create a silent order');
assert.equal(rules.parse('').raw_text,'');
assert(!/fetch\(|functions\.invoke|gemini|supabase\./iu.test(rulesSource));
assert(!/functions\.invoke|gemini|chat_stock_image|fetch\(/iu.test(clientSource),
 'manual OCR must not depend on Supabase/Gemini nor upload the photo');
assert(clientSource.includes('tesseract.js@6.0.1'));
assert(clientSource.includes("['vie','eng']"));
assert(clientSource.includes('window.V21ChatStockOCRRules.parse(text)'));
assert(clientSource.includes('reader')===false); // owner interface is plain client
assert(clientSource.includes("blob.type==='image/jpg'"), 'accept legacy MIME');
assert(clientSource.includes("new Blob([blob],{type:'image/jpeg'})"));
assert(uiSource.includes('reader.scan(assetId'));
assert(uiSource.includes('reader.updateText?.(assetId,editor.value)'));
assert(uiSource.includes('Đọc chữ trong ảnh (OCR)'));
assert(!uiSource.includes('queueMediaFiles('));
assert(html.includes('data-build-source="chat-stock-ocr-rules.js"'));
assert(html.includes('data-build-source="chat-stock-image-read.js"'));
assert(html.indexOf('data-build-source="chat-stock-ocr-rules.js"')<
 html.indexOf('data-build-source="chat-stock-image-read.js"'));
assert(html.indexOf('data-build-source="chat-stock-image-read.js"')<
 html.indexOf('data-build-source="app.js"'));
assert(css.includes('#messageWindow .message-stock-image-read-button'));
assert(css.includes('#messageWindow .day-order-image-source'));

const fakeWindow={
 Worker:class Worker{},WebAssembly:{},
 V21ChatStockOCRRules:rules,
 V21AuthSessionStore:{
  snapshot:()=>({state:'AUTHENTICATED',account:{id:'adm-1',role:'admin'},appSessionId:'sid'}),
  getClient:()=>({functions:{invoke(){throw Error('OCR must NOT call Edge')}}})
 },
 V21SyncEngine:{snapshot:()=>({currentConversationId:'convo-1'})},
 V21MediaCache:{get:async()=>({blob:new Blob([new Uint8Array(140)],{type:'image/jpeg'})})},
 Tesseract:{
  createWorker:async langs=>{
   assert.deepEqual(langs,['vie','eng']);
   return {recognize:async()=>({data:{text:imageOne}}),terminate:async()=>{}};
  }
 }
};
const events=[];
const fakeDoc={createElement:()=>({}),addEventListener(){},
 dispatchEvent:e=>events.push(e.type)};
new Function('window','document','Event','Blob',clientSource)(
 fakeWindow,fakeDoc,class Event{constructor(type){this.type=type}},Blob);
const reader=fakeWindow.V21ChatStockImageRead;
assert.equal(await reader.checkReady(),true);
assert.equal(reader.availability(),true);
const assetId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const result=await reader.scan(assetId);
assert.equal(result.lines.length,7);
assert.equal(result.rawText,imageOne);
const changed=reader.updateText(assetId,'Om 1.2 *3 thùng\nChưa rõ số lượng');
assert.equal(changed.lines.length,1);
assert.equal(changed.notes.length,1);
assert.equal(reader.peek(assetId).lines[0].qty,3);
assert.equal(events.length,1,'local capability checked once');
reader.clear();
assert.equal(reader.peek(assetId),null);

function domNode(tag){
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
const scope={};
new Function('window','document',parserSource)(scope,{createElement:domNode});
const messages=[
 {sender:'remote',media:{type:'image'},stamp:Date.parse('2026-11-20T03:49:00Z'),
  imageReadings:[{assetId:'a',status:'read',lines:first.lines,notes:first.notes}]},
 {sender:'remote',media:{type:'image'},stamp:Date.parse('2026-11-20T04:06:00Z'),
  imageReadings:[{assetId:'b',status:'read',lines:second.lines,notes:second.notes}]}
];
const daily=scope.V21IncomingMessageLayout.summarizeDay(messages);
assert.equal(daily.kind,'daily-order');
assert.equal(daily.items.length,0,'image OCR may not be merged with chat-text totals');
assert.equal(daily.imageGroups.length,2,'separate source images in the same day');
assert(daily.imageGroups[1].items.every(x=>x.review));
const target=domNode('div');
assert(scope.V21IncomingMessageLayout.renderDailySummary(target,daily));
assert(target.textContent.includes('Ảnh 10:49'));
assert(target.textContent.includes('Ảnh 11:06'));
assert(target.textContent.includes('Cần soát ảnh'));
assert(!/fetch\(|localStorage|supabase\./.test(parserSource),
 'day summarizer must remain a pure local read');

assert(app.includes("{passive:true,capture:true}"));
assert(app.includes('markUserScrollIntent(900)'));
assert(app.includes('markUserScrollIntent(1100)'));
assert(app.includes('extendUserScrollIntentForMomentum(650)'));
assert(app.includes('!hasUserScrollIntent();'));
assert(app.includes("return{followTail,preserve:followTail?'AUTO':'VIEW'}"));
assert(!app.includes("preserve:hasUserScrollIntent()?'VIEW':'ANCHOR'"));
assert(app.includes("String(reason).startsWith('geometry:'))&&hasUserScrollIntent())return;"));
assert(app.includes('imageReadings:stockImageReadings(message)'));
assert(app.includes('stockImageReadings(message).map(read=>['));
assert(app.includes('if(summary?.items?.length||summary?.imageGroups?.length)'));
assert(app.includes("document.addEventListener('v21-stock-image-capability'"));
console.log('CHAT-417 manual browser OCR -> raw text -> reviewed goods, NO AI: PASS');
