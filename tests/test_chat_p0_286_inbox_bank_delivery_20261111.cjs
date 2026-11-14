'use strict';
// P0-MSG/DIR/BANK-286: source-owned, offline-safe presentation only.
// No new writer, reconciliation decision, transport, polling or financial RPC.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const bank=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');

function node(tag='',className='',text=''){
 return {
  tag,className,textContent:String(text),dataset:{},attributes:{},children:[],hidden:false,
  handlers:{},
  querySelector(selector){
   if(selector===':scope > .message-delivery-state')
    return this.children.find(x=>x.className==='message-delivery-state')||null;
   return null;
  },
  setAttribute(name,value){this.attributes[name]=String(value)},
  addEventListener(name,callback){this.handlers[name]=callback},
  replaceChildren(...nodes){this.children=nodes},
  appendChild(item){item.parent=this;this.children.push(item);return item},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
 };
}
const start=app.indexOf('function syncMessageDeliveryState(');
const end=app.indexOf('function messageDateKey(',start);
assert(start>0&&end>start);
const msgContext=vm.createContext({document:{createElement:tag=>node(tag)}});
vm.runInContext(app.slice(start,end)+'\nglobalThis.show=syncMessageDeliveryState;',msgContext);
const unit=node();
msgContext.show(unit,{sender:'self',status:'sending'});
assert.equal(unit.children.length,1);
assert.equal(unit.children[0].textContent,'Đang chờ xác nhận gửi');
assert.equal(unit.children[0].attributes.role,'status');
msgContext.show(unit,{sender:'self',status:'failed'});
assert.equal(unit.children[0].textContent,'Chưa gửi thành công');
assert.equal(unit.children[0].dataset.state,'failed');
msgContext.show(unit,{sender:'self',status:'sent'});
assert.equal(unit.children.length,0,'canonical ACK removes the pending/failure hint');
msgContext.show(unit,{sender:'remote',status:'failed'});
assert.equal(unit.children.length,0,'remote messages must not inherit local errors');
assert(app.includes("String(message?.status||'sent')"),
 'status transition invalidates the message visual signature');
assert.equal((app.match(/syncMessageDeliveryState\(unit,message\);/g)||[]).length,3,
 'create, content patch and lightweight ACK patch share the same status owner');
assert(html.includes('.message-delivery-state[data-state="failed"]'));

const dStart=directory.indexOf('function matchesDirectory(item){');
const dEnd=directory.indexOf('function syncDirectoryRows(',dStart);
assert(dStart>0&&dEnd>dStart);
const directoryContext=vm.createContext({
 query:'',filter:'unread',groupMap:new Map([['c1','customer']]),
 groupKey:x=>String(x||'other'),
 normalizeText:value=>String(value||'').toLowerCase()
});
vm.runInContext(directory.slice(dStart,dEnd)+'\nglobalThis.matches=matchesDirectory;',directoryContext);
assert(directoryContext.matches({id:'c1',has_unread:true,display_name:'A'}));
assert(directoryContext.matches({id:'c1',unread_count:2,display_name:'A'}));
assert(!directoryContext.matches({id:'c1',has_unread:false,unread_count:0,display_name:'A'}));
directoryContext.filter='customer';
assert(directoryContext.matches({id:'c1'}));
directoryContext.filter='all';
assert(directoryContext.matches({id:'c2'}));
assert(directory.includes('data-contact-directory-filter="unread">Chưa đọc</button>'));
assert(directory.includes("button.setAttribute('aria-pressed',String(selected))") ||
 directory.includes("button.setAttribute('aria-pressed',String(selected));"));
assert(directory.includes('height:44px')&&directory.includes('min-height:44px'));
assert(directory.includes('Tìm tên hoặc tài khoản'));

const queueStart=bank.indexOf('function renderBankWorkQueue(');
const queueEnd=bank.indexOf('function paint(data){',queueStart);
assert(queueStart>0&&queueEnd>queueStart);
const holder=node('section');
holder.hidden=true;
let painted=0,scrolled=0;
const bankContext=vm.createContext({
 ui:{queue:holder,groups:{scrollIntoView(){scrolled++}}},
 filter:'all',selectedCustomer:'old',
 el:node,
 append:(parent,...items)=>{for(const item of items)parent.appendChild(item);return parent},
 paint:()=>{painted++}
});
vm.runInContext(bank.slice(queueStart,queueEnd)+'\nglobalThis.renderQueue=renderBankWorkQueue;',bankContext);
const data={bills:[
 {report_status:'waiting_bank'},
 {report_status:'review'},
 {report_status:'reading'},
 {report_status:'matched'}
]};
bankContext.renderQueue(data,3);
assert.equal(holder.hidden,false);
const actions=holder.children[1];
assert.equal(actions.children.length,3);
assert.deepEqual(actions.children.map(x=>x.dataset.filter),
 ['bank_only','waiting_bank','review']);
assert.deepEqual(actions.children.map(x=>x.children[0].textContent),['3','1','2']);
actions.children[2].handlers.click();
assert.equal(bankContext.filter,'review');
assert.equal(bankContext.selectedCustomer,null);
assert.equal(painted,1);assert.equal(scrolled,1);
bankContext.renderQueue({bills:[]},0);
assert.equal(holder.children.length,1,'empty queue has no redundant empty-state card');
assert.equal(holder.hidden,true,'empty queue is removed from the compact report');
bankContext.ui.queue=null;
bankContext.renderQueue(data,3); // cached HTML lacks the new optional slot
assert(bank.includes("queue:root.querySelector('[data-bank-work-queue]')"));
assert(bank.includes('ui.queue?.replaceChildren();if(ui.queue)ui.queue.hidden=true;'));
assert(!bank.slice(queueStart,queueEnd).includes('.rpc('));
assert(!bank.slice(queueStart,queueEnd).includes('collect('));
assert(html.includes('class="bank-report-work-queue"'));
assert(css.includes('min-height:44px;display:inline-flex'));
assert(css.includes('.bank-report-work-button:focus-visible'));
console.log('P0-286: honest local send states, canonical unread inbox, read-only bank work queue PASS');
