'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const begin=src.indexOf('if(ui.variance){',src.indexOf('// BANK-326:'));
const end=src.indexOf(' // Keep every bank diagnostic',begin);
assert(begin>=0&&end>begin,'renderer must contain isolated proof gap block');
const segment=src.slice(begin,end);
const test=(bank,booked)=>{
 const variance={
  hidden:true,children:[],
  replaceChildren(...children){this.children=children;}
 };
 const ui={variance};
 let filter='all',selectedCustomer='customer',paintCount=0;
 const create=(tag,cls,value='')=>({
  tag,cls,textContent:String(value),
  attributes:{},events:{},children:[],
  setAttribute(name,value){this.attributes[name]=value;},
  addEventListener(event,cb){this.events[event]=cb;},
  appendChild(child){this.children.push(child);}
 });
 const render=new Function('ui','s','incomingAmountVnd','el','append',
  'bankDisplayVnd','bankMoneySpoken','data','paint',`
  let filter='all',selectedCustomer='customer';
  ${segment}
  return {variance,filter:()=>filter,selectedCustomer:()=>selectedCustomer};`);
 return render(ui,{matched_amount:booked},bank,create,
  (p,...parts)=>{p.children.push(...parts);return p},
  v=>(v/1000).toLocaleString('vi-VN'),
  v=>v.toLocaleString('vi-VN')+' đồng',
  {summary:{}},()=>{paintCount++;});
};
let gap=test(26446000,34446000);
assert.equal(gap.variance.hidden,false,'34.446 booked vs 26.446 observed bank must flag');
assert.equal(gap.variance.children[0].children[0].textContent,'Cần đối chiếu thêm 8.000');
assert.match(gap.variance.children[0].children[1].textContent,/chưa kết luận tiền chưa về/);
assert.equal(gap.variance.children[1].textContent,'Xem thu tay');
gap.variance.children[1].events.click();
assert.equal(gap.filter(),'manual_bank');
assert.equal(gap.selectedCustomer(),null);
for(const [bank,booked] of [[0,0],[26446000,26446000],[34446000,26446000],[1000000,1000500]]){
 const result=test(bank,booked);
 assert.equal(result.variance.hidden,true);
 assert.equal(result.variance.children.length,0);
}
assert(html.includes('data-bank-variance role="status"'));
assert(css.includes('.bank-report-variance[hidden]{display:none!important;}'));
assert(css.includes('.bank-report-variance-action:focus-visible'));
assert(src.includes("client.rpc('chat_bank_dashboard'"));
assert(src.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(!/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(?:taphoa_debt_ledger|chat_bank_bill_receipts)\b/i.test(segment));
console.log('BANK-326 variance read-only 8m difference, no false bank-loss conclusion and manual review PASS');
