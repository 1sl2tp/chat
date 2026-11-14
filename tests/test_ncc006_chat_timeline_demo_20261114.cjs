'use strict';
// NCC-006: offline chat-style image -> table flow. No Supabase or customer data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('ncc-invoice-admin.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const begin=source.indexOf('const nccChatUrls=new Set();');
const end=source.indexOf('async function sendPhoto(panel){',begin);
assert(begin>0&&end>begin,'single conversation renderer available');
const moduleText=source.slice(begin,end);
class FakeEl{
 constructor(tag){
  this.tagName=tag;this.className='';this.children=[];this.dataset={};
  this.listeners={};this.textContent='';this.attributes={};
 }
 append(...items){this.children.push(...items);}
 appendChild(item){this.children.push(item);return item;}
 replaceChildren(...items){this.children=[...items];}
 addEventListener(name,callback){this.listeners[name]=callback;}
}
const thread=new FakeEl('div'),notes=[];
const panel={
 dataset:{nccSentAt:'2026-11-14T04:14:00Z'},
 querySelector(selector){
  if(selector==='[data-ncc-photo-result]')return thread;
  if(selector==='[data-ncc-photo-file]')return {files:[]};
  throw Error('unexpected selector '+selector);
 }
};
let clipboardValue='';
const ctx=vm.createContext({
 Set,Date,Intl,Number,String,Array,Promise,
 document:{createElement:tag=>new FakeEl(tag)},
 navigator:{clipboard:{writeText:async value=>{clipboardValue=value;}}},
 URL:{revokeObjectURL:()=>{throw Error('demo has no object URL');}},
 admin:()=>true,
 money:value=>Number(value).toLocaleString('vi-VN'),
 photoNote:(_panel,value)=>notes.push(value),
 ensureDialog:()=>{throw Error('demo does not open business workflow')},
 call:()=>{throw Error('demo must not call backend')}
});
vm.runInContext(moduleText+'\nthis.api={nccChatClock,nccChatDay,nccChatDemo,photoResult,nccClearChat};',ctx);
assert.equal(ctx.api.nccChatClock('2026-11-14T04:14:00Z'),'11:14','Vietnam 24h format');
assert.equal(ctx.api.nccChatDay('2026-11-14T04:14:00Z'),'14/11/2026');
const visit=node=>[node,...(node.children||[]).flatMap(visit)];
(async()=>{
 ctx.api.nccChatDemo(panel);
 let nodes=visit(thread);
 assert.equal(nodes.filter(n=>n.className?.includes('ncc-chat-message')).length,2,'Admin photo + AI result bubbles');
 assert(nodes.some(n=>n.textContent.includes('MẪU — KHÔNG PHẢI KẾT QUẢ THẬT')),'clearly tagged mock');
 assert.equal(nodes.filter(n=>n.tagName==='time').length,2,'both sides have a time stamp');
 assert.equal(nodes.filter(n=>n.tagName==='tr').length,4,'table header plus 3 fixture lines');
 const copy=nodes.find(n=>n.className==='ncc-photo-copy');
 assert(copy?.listeners?.click,'copy table is a real action');
 await copy.listeners.click();
 assert(clipboardValue.includes('Mặt hàng mẫu A\t5\tHộp\t18000\t90000'));
 assert(notes.some(s=>s.includes('Đã sao chép 3 dòng')));
 assert.equal(thread.dataset.nccDemo,'1');
 ctx.api.photoResult(panel,{
  document:{status:'needs_review',created_at:'2026-11-14T04:14:00Z'},
  lines:[{row_no:1,printed_name:'Hàng đọc từ ảnh',quantity:4,
    printed_unit:'Thùng',unit_price_vnd:1000,line_total_vnd:4000}]
 },'invoice-1');
 nodes=visit(thread);
 assert.equal(thread.dataset.nccDemo,undefined,'real response clears fake conversation');
 assert.equal(nodes.filter(n=>n.className?.includes('ncc-chat-message')).length,2);
 assert(nodes.some(n=>n.textContent.includes('Hàng đọc từ ảnh')));
 assert(!nodes.some(n=>n.textContent.includes('Mặt hàng mẫu A')));
 assert(nodes.some(n=>n.tagName==='time'&&n.textContent==='11:14'),'send time preserved');
 const itemCount=thread.children.length;
 ctx.api.photoResult(panel,{document:{status:'matched'},lines:[]},'invoice-1');
 assert.equal(thread.children.length,itemCount,'same OCR id does not duplicate bubbles');
 assert(source.includes('if(clearHistory)nccClearChat(panel);'),'logout clears chat in memory');
 assert(source.includes('if(panel.dataset)panel.dataset.nccSentAt=new Date().toISOString();'),'sender time belongs to Admin action');
 assert(source.includes("data-ncc-chat-demo"),'open a demo without backend');
 assert(source.includes("if(!photoBusy&&!file)photoNote("),'backend not simulated as ready');
 assert(source.includes('if(photoBusy||!photoReady())return;'),'real submission remains gated');
 assert(!moduleText.includes("call('manual_upload'"),'demo does not upload');
 assert(css.includes('/* NCC-006: separate workroom'));
 assert(css.includes('.ncc-chat-meta time'));
 assert(css.includes('.ncc-photo-result-table'));
 assert(html.includes('data-bank-report-ncc-slot'),'work layout keeps invoice section');
 console.log('NCC-006: timestamped Admin/AI bubbles, mock-only demo and copyable table PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});