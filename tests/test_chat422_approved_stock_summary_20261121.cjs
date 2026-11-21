'use strict';
// CHAT-422: screenshot-approved 20/11/2026 KH day card is the baseline.
// Visual/DOM/semantic regression; zero customer messages or DB writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('incoming-message-layout.js','utf8');
const css=fs.readFileSync('incoming-message-layout.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const ui={};
function node(tag){
 let content='';
 return {
  tagName:tag,className:'',dataset:{},attributes:{},children:[],
  set textContent(value){content=String(value);this.children=[];},
  get textContent(){return content+this.children.map(child=>child.textContent).join('');},
  append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=[...children];},
  setAttribute(name,value){this.attributes[name]=String(value);},
  addEventListener(){}
 };
}
vm.runInNewContext(code,{
 window:ui,document:{createElement:node},console
});
const {renderDailySummary,render,summarizeDay}=ui.V21IncomingMessageLayout;
const screenshotRows=[
 ['Grow plus vinamilk',5,false],
 ['Bò bịch ko đường',3,true],
 ['9 Hạt ít đường',5,false],
 ['9 Hạt ko đường',2,false],
 ['Proby to có',5,true],
 ['Proby to việt quất',2,false],
 ['Chua nha đam',2,true],
 ['Chua ít đường',2,true],
 ['Miliket',5,false],
 ['Milo to có đường',10,true]
];
const daily={
 kind:'daily-order',dayLabel:'Hôm qua · 20/11/2026',messageCount:4,
 items:screenshotRows.map(([name,qty,review])=>({name,qty,review,unit:''})),
 imageGroups:[],notes:[]
};
const mount=node('div');
assert.equal(renderDailySummary(mount,daily),true);
assert.equal(mount.children.length,1,'one daily card only');
const card=mount.children[0];
assert.equal(card.className,'incoming-brief day-order-summary-card');
assert.equal(card.dataset.approvedLayout,'kh-stock-three-columns-v1');
assert.equal(card.attributes['aria-label'],'Tổng hợp tin lấy hàng trong ngày');
assert.equal(card.children[0].children[0].textContent,
 'Tổng hợp lấy hàng · Hôm qua · 20/11/2026');
assert.equal(card.children[0].children[1].textContent,'10 hàng từ tin · 0 ảnh');
const table=card.children[1];
assert.equal(table.dataset.stockColumns,'stt-name-qty');
assert.equal(table.attributes.role,'table');
assert.equal(table.children.length,11,'header plus ten source items');
const columns=table.children[0];
assert.equal(columns.attributes.role,'row');
assert.deepEqual(Array.from(columns.children,x=>x.textContent),
 ['STT','Tên sản phẩm','SL']);
assert(columns.children.every(x=>x.attributes.role==='columnheader'));
for(const [i,[name,qty,review]] of screenshotRows.entries()){
 const line=table.children[i+1];
 assert.equal(line.attributes.role,'row');
 assert.equal(line.children.length,3,'no hidden unit/fourth column');
 assert.deepEqual(Array.from(line.children,child=>child.attributes.role),
 ['cell','cell','cell']);
 assert.equal(line.children[0].textContent,String(i+1));
 assert.equal(line.children[1].children.length,review?1:0,
  'do not change yellow-review marker from the approved screenshot');
 assert.equal(line.children[1].textContent,name+(review?'Cần hướng dẫn':''));
 assert.equal(line.children[2].textContent,String(qty),'numeric-only SL');
 assert.equal(line.dataset.needsReview,review?'true':undefined);
}
assert.equal(card.children.at(-1).textContent,
 'Chỉ tổng hợp tin đã tải và ảnh đã chọn đọc · chưa xác nhận hoặc tạo đơn');
const reused=mount.children[0];
assert.equal(renderDailySummary(mount,{...daily,items:daily.items.slice(0,1)}),true);
assert.notEqual(mount.children[0],reused,'recomputed summary uses an independent card');
assert.equal(mount.children[0].children[1].children.length,2);

// Photo OCR is manual and must stay in its own table, never added to text totals.
const photo=node('div');
const photoSummary={kind:'daily-order',dayLabel:daily.dayLabel,
 items:daily.items.slice(0,1),notes:[],imageGroups:[{
  assetId:'source-photo-1',stamp:Date.parse('2026-11-20T10:49:00+07:00'),
  items:[{name:'Om 1.2',qty:3,unit:'thùng',review:true}],notes:[]
 }]};
assert.equal(renderDailySummary(photo,photoSummary),true);
const photoCard=photo.children[0];
const photoGroup=photoCard.children.find(x=>x.className==='day-order-image-source');
assert(photoGroup,'OCR photo group must be independent');
assert.equal(photoGroup.children[1].dataset.stockColumns,'stt-name-qty');
assert.equal(photoGroup.children[1].children[1].children[1].textContent,
 'Om 1.2Cần soát ảnh');
assert.equal(photoGroup.children[1].children[1].children[2].textContent,'3');
assert(photoCard.textContent.includes('Không cộng vào hàng từ tin'));

// All three screens share exactly one source for the three-column structure.
const one=node('div');
assert.equal(render(one,'Báo lấy hàng\nSữa tươi 2th'),true);
assert.equal(one.children[0].children[1].dataset.stockColumns,'stt-name-qty');
assert.deepEqual(Array.from(one.children[0].children[1].children[0].children,
 x=>x.textContent),['STT','Tên sản phẩm','SL']);
const only=one.children[0].children[1].children[1];
assert.equal(only.children[1].textContent,'Sữa tươi');
assert.equal(only.children[2].textContent,'2');
const fake=()=>({sender:'remote',text:'3 bò bịch ko đường',stamp:1234});
assert(summarizeDay([fake()])?.items?.length===1,
 'verified product structure continues read-only daily aggregation');
assert(!/fetch\(|XMLHttpRequest|setInterval\(|localStorage|supabase\.|innerHTML\s*=/.test(code));
assert(css.includes('.incoming-brief-columns,.incoming-brief-item{'));
assert(css.includes('grid-template-columns:24px minmax(0,1fr) minmax(32px,48px)'));
assert(css.includes('.incoming-brief-quantity{'));
assert(css.includes('justify-self:end;text-align:right'));
assert(css.includes('.incoming-brief-item[data-needs-review="true"]'));
assert(css.includes('background:rgba(255,208,62,.14)'));
assert(css.includes('background:#ffe58a'));
assert(css.includes('width:min(100%,720px)'));
assert(!/position:sticky|position:fixed|scrollTop\s*=/.test(css));
assert(app.includes('if(!stockSummaryCustomerAllowed()'));
assert(app.includes('const dailyByOwner=dailyStockSummariesByOwner(store.items)'));
assert(html.includes('data-build-source="incoming-message-layout.js"'));
assert(html.includes('data-build-source="incoming-message-layout.css"'));
console.log('CHAT-422 screenshot-approved ten-stock-row daily summary, yellow review, columns and no side effects: PASS');
