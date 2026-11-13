'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const begin=js.indexOf('function renderGroups(data){');
const end=js.indexOf('function openPush(intent={})',begin);
assert(begin>0&&end>begin,'live bank renderer must exist');
const code=js.slice(begin,end);
for(const match of [
 "const panel=el('section','bank-report-section-panel')",
 "const title=el('button','bank-report-section-toggle')",
 "title.setAttribute('aria-expanded',String(detailPanelOpen))",
 "title.setAttribute('aria-controls','bankReportDetailsBody')",
 "body.hidden=!detailPanelOpen",
 "if(!detailPanelOpen)selectedCustomer=null",
 "body.appendChild(block)"
])assert(code.includes(match),'missing one-tap detail card behavior: '+match);
assert(js.includes('detailPanelOpen=Boolean(selectedCustomer);filter=\'all\';paint(data);'),
 'customer selection must open its own details');
assert(js.includes("detailPanelOpen=key!=='all';paint(data)"),
 'explicit status filters should open their matching details');
assert(js.includes("detailPanelOpen=false;current=null;void reload();"),
 'changing days must not show stale expanded state');
const css333=css.slice(css.indexOf('/* UI-333: a stand-alone, one-tap'));
assert(css333.startsWith('/* UI-333'));
for(const selector of [
 '.bank-report-section-panel','[data-expanded="false"]',
 '.bank-report-section-toggle','.bank-report-section-icon',
 '.bank-report-section-copy','.bank-report-section-action',
 '.bank-report-section-body[hidden]{display:none!important;}',
 '@media(max-width:760px)','@media(max-width:360px)',
 ':focus-visible'
])assert(css333.includes(selector),'missing independent-detail style '+selector);
assert(!/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(?:taphoa_debt_ledger|chat_bank_bill_receipts)/i.test(code));
function node(tag,cls='',value=''){
 return {
  tag,cls,textContent:String(value),children:[],hidden:false,open:false,attributes:{},events:{},dataset:{},
  appendChild(child){this.children.push(child);return child;},
  replaceChildren(...children){this.children=children;},
  setAttribute(key,value){this.attributes[key]=value;},
  addEventListener(key,fn){this.events[key]=fn;},
  focus(){},
  querySelector(){return {focus(){}}}
 };
}
const mountScript=`
let detailPanelOpen=false, selectedCustomer=null, filter='all';
const ui={groups:node('div')};
const root={querySelector(){return {focus(){}}}};
const el=node;
const append=(parent,...kids)=>{for(const k of kids)parent.appendChild(k);return parent;};
const bankDisplayVnd=v=>String(v);
const bankCreditViewModel=v=>v||[];
const bankCreditLine=()=>node('details','bank-report-detail');
const detailLine=()=>node('details','bank-report-detail');
const possibleUnlinkedBills=()=>[];
const paint=data=>renderGroups(data);
${code}
({renderGroups,ui,get:()=>({detailPanelOpen,selectedCustomer}),select(id,data){
 selectedCustomer=id;detailPanelOpen=Boolean(id);renderGroups(data);
}});
`;
const env=vm.runInNewContext(mountScript,{node,Map,Set,String,Number,Array});
const data={
 bank_credits:[{notice_id:274,amount_vnd:730000,collection_kind:'manual_collected',receipt_id:null}],
 bank_only:[], bills:[]
};
env.renderGroups(data);
let panel=env.ui.groups.children[0];
assert.equal(panel.cls,'bank-report-section-panel');
assert.equal(panel.dataset.expanded,'false');
assert.equal(panel.children[0].attributes['aria-expanded'],'false');
assert.equal(panel.children[1].hidden,true);
assert.equal(panel.children[1].children.length,1,'hidden bank records must remain available when opened');
panel.children[0].events.click();
panel=env.ui.groups.children[0];
assert.equal(env.get().detailPanelOpen,true);
assert.equal(panel.children[1].hidden,false);
assert.equal(panel.children[0].attributes['aria-expanded'],'true');
panel.children[0].events.click();
panel=env.ui.groups.children[0];
assert.equal(env.get().detailPanelOpen,false);
assert.equal(panel.children[1].hidden,true);
const selectedData={bank_credits:[],bank_only:[],bills:[{
 customer_id:'c1',customer_name:'C Sâm pl',report_status:'matched',
 amount_vnd:730000,receipt_id:'a',ledger_id:863
}]};
env.select('c1',selectedData);
panel=env.ui.groups.children[0];
assert.equal(panel.children[1].hidden,false,'selecting customer opens relevant detail card');
panel.children[0].events.click();
assert.equal(env.get().selectedCustomer,null,'closing selected detail removes confusing active-row highlight');
assert.equal(env.get().detailPanelOpen,false);
console.log('UI-333: compact closed card, single click opens/closes, selected customer autoexpands PASS');
