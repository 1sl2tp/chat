'use strict';
// CHAT-NEXT-008: public, client-only design gallery; never call real Chat/Bank APIs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..','docs/chat-next/demo');
const html=fs.readFileSync(path.join(root,'invoice.html'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=html.match(/<style>\s*([\s\S]*?)\s*<\/style>/)?.[1]||'';
const js=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1]||'';
assert(css.length>5000&&js.length>600,'one self-contained printable gallery required');
assert(!/<script\b[^>]+src=/i.test(html),'no third-party scripts');
assert(!/<link\b[^>]+href=/i.test(html),'no external styles/scripts');
assert(html.includes('BẢN DEMO · KHÔNG CÓ DỮ LIỆU THẬT'),'explicit fake-data banner');
assert(html.includes('Không phải chứng từ giao dịch thực tế'),'receipt must be marked sample');
assert(html.includes('SỐ LƯỢNG × ĐƠN GIÁ = THÀNH TIỀN (đ)'),'explicit quantity x price');
assert(html.includes('data-template="mono"')&&html.includes('data-template="forest"')&&html.includes('data-template="slate"'));
assert(html.includes('aria-pressed="true"')&&html.includes('aria-pressed="false"'),'accessible switch states');
assert(html.includes('href="./index.html"'),'return to main demo');
assert(index.includes('href="./invoice.html"'),'Work section navigates to invoice');
assert(index.includes("invoiceLink.href='./invoice.html'"),'chat order can open invoice gallery');
assert(index.includes('link.href=')&&index.includes('Mở quản lý 3 mẫu hóa đơn'),'Work detail provides same preview');
assert(css.includes('@media print')&&css.includes('@page{size:A4'),'A4 print contract');
assert(css.includes('.item{break-inside:avoid}'),'line item print integrity');
assert(css.includes('@media(max-width:550px)')&&css.includes('.item .math{grid-column:2;grid-row:2;'),
 'narrow screens should stack arithmetic below item name');
assert(css.includes('grid-template-columns:minmax(58px,1fr) 10px minmax(64px,1fr) 9px minmax(75px,1fr)'),
 'desktop arithmetic uses stable qty x unit = total tracks');
assert(css.includes('font-variant-numeric:tabular-nums'),'align numerals');
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
for(const disallowed of ['fetch(', 'XMLHttpRequest','WebSocket(','navigator.serviceWorker',
'localStorage','indexedDB','supabase','window.open(', 'location.href=', 'sendMessage(','queueText(', 'credentials:']){
 assert(!html.includes(disallowed),'gallery must not call business API: '+disallowed);
}
const itemSpecs=[
{item:'milk',qty:2,unit:310000,total:620000},
{item:'cookie',qty:3,unit:45000,total:135000},
];
function parseCurrency(s){return Number(s.replace(/[^\d]/g,''));}
for(const spec of itemSpecs){
 const line=html.match(new RegExp('<div class="item" data-item="'+spec.item+'">([\\s\\S]*?)</div></div>'));
 assert(line,'item row missing '+spec.item);
 const t=line[1];
 const quantity=t.match(/class="qty">(\d+) /),unit=t.match(/class="unit">([\d.]+)/),total=t.match(/class="line-total">([\d.]+)/);
 assert(quantity&&unit&&total,'all calculation fields required');
 assert.equal(Number(quantity[1]),spec.qty);
 assert.equal(parseCurrency(unit[1]),spec.unit);
 assert.equal(parseCurrency(total[1]),spec.total);
 assert.equal(spec.qty*spec.unit,spec.total,'item arithmetic must balance');
}
assert.equal(itemSpecs.reduce((sum,it)=>sum+it.total,0),755000,'total controlled by line arithmetic');
assert(html.includes('<strong>755.000<sup>đ</sup></strong>'));
assert(html.includes('<b>755.000</b>'));
new vm.Script(js,{filename:'chat-next-invoice-inline.js'});

function fakeNode(tag,dataset={}){
 const node={tagName:tag.toUpperCase(),dataset,attributes:{},className:'',textContent:'',handlers:{},
 setAttribute(k,v){this.attributes[k]=String(v)},
 addEventListener(k,fn){this.handlers[k]=fn},
 click(){assert(this.handlers.click,'missing button handler');this.handlers.click()},
 };
 return node;
}
const buttons=['mono','forest','slate'].map(x=>fakeNode('button',{template:x}));
const sheet=fakeNode('article',{template:'mono'});
const chosen=fakeNode('p');
const printMono=fakeNode('button');
const printSheet=fakeNode('button');
let prints=0;
const document={
 getElementById(id){return{sheet,chosen,printMono,printSheet}[id]},
 querySelectorAll(s){assert.equal(s,'[data-template]');return [...buttons,sheet]},
};
vm.runInNewContext(js,{document,window:{print(){prints++}},Array,Object,String,console},{timeout:1500});
assert.equal(sheet.dataset.template,'mono','default is black-white');
assert.equal(buttons[0].attributes['aria-pressed'],'true');
assert.equal(buttons[1].attributes['aria-pressed'],'false');
buttons[1].click();
assert.equal(sheet.dataset.template,'forest','forest template changes only visual class');
assert.equal(sheet.className,'sheet','non-mono uses same geometry');
assert.equal(buttons[1].attributes['aria-pressed'],'true');
assert.equal(buttons[0].attributes['aria-pressed'],'false');
buttons[2].click();
assert.equal(sheet.dataset.template,'slate');
assert(chosen.textContent.includes('03 · Xanh than'));
printMono.click();
assert.equal(sheet.dataset.template,'mono','return to baseline print layout');
assert.equal(sheet.className,'sheet mono');
printSheet.click();
assert.equal(prints,1,'print stays client-side and does not submit a business record');
console.log('CHAT NEXT phase-8 invoice gallery PASS: 3 skins, print, accessibility, arithmetic 755000, standalone offline');
