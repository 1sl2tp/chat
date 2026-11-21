'use strict';
// CHAT-431: compact KH daily summary only while the existing mobile
// VisualViewport keyboard owner reports open. Original rows/notes survive.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('incoming-message-layout.js','utf8');
const css=fs.readFileSync('incoming-message-layout.css','utf8');
const app=fs.readFileSync('app.js','utf8');
let blurCount=0;
const editor={blur(){blurCount++}};
function node(tag){
 let value='';
 return {
  tagName:tag,className:'',dataset:{},attributes:{},children:[],
  set textContent(v){value=String(v);this.children=[]},
  get textContent(){return value+this.children.map(child=>child.textContent).join('')},
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=[...children]},
  setAttribute(k,v){this.attributes[k]=String(v)},
  addEventListener(){}
 };
}
const global={};
vm.runInNewContext(source,{window:global,document:{
 createElement:node,getElementById:id=>id==='editor'?editor:null
},console});
const render=global.V21IncomingMessageLayout.renderDailySummary;
const payload={kind:'daily-order',dayLabel:'Hôm nay · 21/11/2026',
 items:[{name:'Triệu phi',qty:2,review:false}],
 imageGroups:[],notes:[{text:'Giao buổi chiều',review:false}]};
const mount=node('div');
assert.equal(render(mount,payload),true);
const card=mount.children[0],head=card.children[0];
assert.equal(card.dataset.approvedLayout,'kh-stock-three-columns-v1');
assert.equal(head.children[0].textContent,'Tổng hợp lấy hàng · Hôm nay · 21/11/2026');
assert.equal(head.children[1].textContent,'1 hàng từ tin · 0 ảnh');
const preview=head.children[2];
assert.equal(preview.tagName,'button');
assert.equal(preview.type,'button');
assert.equal(preview.className,'day-order-keyboard-preview');
assert.equal(preview.textContent,'Triệu phi × 2 · Xem chi tiết');
assert.equal(preview.attributes['aria-label'],'Đóng bàn phím để xem đầy đủ bảng tổng hợp lấy hàng');
assert.equal(card.children[1].dataset.stockColumns,'stt-name-qty');
assert.equal(card.children[1].children[1].children[1].textContent,'Triệu phi');
assert.equal(card.children[1].children[1].children[2].textContent,'2');
assert.equal(card.children.at(-1).className,'day-order-summary-disclaimer');
assert(card.textContent.includes('Giao buổi chiều'));
preview.onclick();
assert.equal(blurCount,1,'must return to the original editor focus owner');
const images=node('div');
assert.equal(render(images,{kind:'daily-order',dayLabel:'Hôm nay',items:[],
 imageGroups:[{stamp:Date.parse('2026-11-21T20:50:00+07:00'),
 items:[{name:'ảnh cần soát',qty:1}],notes:[]}],notes:[]}),true);
assert(images.children[0].children[0].children[2].textContent.includes('1 ảnh cần soát'));
assert(images.children[0].children.some(x=>x.className==='day-order-image-source'));
const many=node('div');
assert.equal(render(many,{...payload,items:[
 {name:'Triệu phi',qty:2},{name:'Pepsi lon',qty:5}
 ]}),true);
assert(many.children[0].children[0].children[2].textContent.includes('+1 hàng'));
assert.equal(many.children[0].children[1].children.length,3);
assert(css.includes('.day-order-keyboard-preview{\n display:none'));
assert(css.includes('#stageLayout[data-keyboard-open="true"]:not([data-bank-report-active="true"])'));
assert(css.includes('.day-order-summary-card > :not(.incoming-brief-head)'));
assert(css.includes('.day-order-keyboard-preview{\n  display:block'));
assert(!/position:fixed|position:sticky|scrollTop\s*=|setInterval\(/.test(css));
assert(app.includes('stageLayout.dataset.keyboardOpen=String(keyboardOpen)'));
assert(!/fetch\(|XMLHttpRequest|localStorage|supabase\.|innerHTML\s*=/.test(source));
console.log('CHAT-431 keyboard-compact daily card, tap full details, rows/OCR preserved: PASS');
