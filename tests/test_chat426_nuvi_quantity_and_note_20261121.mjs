import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNamedTotalPack,parseStockImageModel,PROMPT}
 from '../supabase/functions/v21-chat-stock-image/chat-stock-read.mjs';

const exact='Sua nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 5 thùng';
const expectedNote='291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng';
assert(PROMPT.includes('quantity 5 thùng'));
assert(PROMPT.includes('middle text is a note'));
const target={name:'Sua nuvi to',qty:5,unit:'thùng',note:expectedNote};
const direct=parseNamedTotalPack(exact);
for(const [key,value] of Object.entries(target))assert.equal(direct[key],value,key);
for(const fixture of [
 {classification:'typed_stock_list',lines:[{raw:exact,name:'Sua nuvi to',quantity:5,unit:'thùng',uncertain:true}],notes:[exact,exact]},
 {classification:'typed_stock_list',lines:[{raw:exact,name:'Sua nuvi to',quantity:null}],notes:[]},
 {classification:'typed_stock_list',lines:[],notes:[exact,exact]}
]){
 const got=parseStockImageModel(fixture);
 assert.equal(got.lines.length,1,'one actual product');
 assert.equal(got.notes.length,0,'same full OCR line must not appear as duplicate notes');
 for(const [key,value] of Object.entries(target))assert.equal(got.lines[0][key],value,key);
 assert(got.lines[0].review,'source remains unconfirmed until admin review');
}
const annotated=parseStockImageModel({classification:'typed_stock_list',lines:[
 {raw:exact,name:'Sua nuvi to',quantity:3,unit:'thùng',uncertain:true},
 {raw:'Chao gau do ga - 150 *5',name:'Chao gau do ga',quantity:5}
],notes:['Giao chiều mai',exact]});
assert.deepEqual(annotated.lines.map(x=>x.qty),[5,5]);
assert.deepEqual(annotated.notes,['Giao chiều mai']);
const other=parseStockImageModel({classification:'other',lines:[],notes:[exact]});
assert.equal(other.lines.length,0,'unrelated images do not become orders');
for(const nonItem of [
 'Sua nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng',
 'Sua nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 0 thùng',
 'Giá sua nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 5 thùng',
 'Tổng 5 thùng',
 'Sua nuvi to = Tổng 5 thùng'
])assert.equal(parseNamedTotalPack(nonItem),null,nonItem);
const src=fs.readFileSync('incoming-message-layout.js','utf8');
const reader=fs.readFileSync('chat-stock-image-read.js','utf8');
const css=fs.readFileSync('incoming-message-layout.css','utf8');
const edge=fs.readFileSync('supabase/functions/v21-chat-stock-image/index.ts','utf8');
const dom={};
function el(tag){
 let own='';
 return {tagName:tag,dataset:{},children:[],attrs:{},
  set textContent(v){own=String(v);this.children=[]},
  get textContent(){return own+this.children.map(child=>child.textContent).join('')},
  append(...kids){this.children.push(...kids)},
  replaceChildren(...kids){this.children=[...kids]},
  setAttribute(k,v){this.attrs[k]=v},
  addEventListener(){}};
}
new Function('window','document',src)(dom,{createElement:el});
const summary=dom.V21IncomingMessageLayout.summarizeDay([{
 sender:'remote',media:{type:'image'},stamp:Date.parse('2026-11-20T04:06:00Z'),
 imageReadings:[{assetId:'photo',status:'read',lines:annotated.lines,notes:annotated.notes}]
}]);
assert.equal(summary.imageGroups.length,1);
assert.equal(summary.imageGroups[0].items.length,2);
assert.equal(summary.imageGroups[0].items[0].note,expectedNote);
assert.deepEqual(summary.imageGroups[0].notes,['Giao chiều mai']);
const node=el('div');
assert(dom.V21IncomingMessageLayout.renderDailySummary(node,summary));
assert(node.textContent.includes('Sua nuvi to'));
assert(node.textContent.includes('Ghi chú: '+expectedNote));
assert.equal(node.textContent.split('Ghi chú: '+expectedNote).length-1,1,
 'keep note once directly with this product');
assert(!node.textContent.includes(exact),'do not reprint the full OCR raw line as a warning');
assert(css.includes('.incoming-brief-product-note'));
assert(reader.includes("note:String(line.note||'').trim().slice(0,240)"));
assert(edge.includes('readStockImageWithGemini'));
assert(!/\.upload\(|\.storage\.from\(|\.send\(/u.test(edge),
 'customer image recognition cannot send messages or write storage');
console.log('CHAT-426 Nuvi total 5, literal attached note, dedup and read-only: PASS');
