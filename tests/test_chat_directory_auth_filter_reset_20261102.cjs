'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const src=fs.readFileSync('contact-directory-admin.js','utf8');
const start=src.indexOf('function resetForAuth(){');
const end=src.indexOf('\ninstallStyle();',start);
assert(start>=0&&end>start,'canonical auth reset owner missing');
const piece=src.slice(start,end);

const input={value:'Nguyễn Văn'};
const buttons=['all','unread','customer','cm','friend','other'].map(key=>({
  dataset:{contactDirectoryFilter:key,active:String(key==='friend')},
  attributes:{},
  setAttribute(name,value){this.attributes[name]=String(value);}
}));
const work={hidden:false},heading={hidden:false};
const sections=['chat','work'].map(key=>({
 dataset:{contactDirectorySection:key,active:String(key==='work')},
 attributes:{},tabIndex:key==='work'?0:-1,
 setAttribute(name,value){this.attributes[name]=String(value);}
}));
const tools={
 dataset:{directorySection:'work'},
 querySelector(s){
  if(s==='[data-contact-directory-search]')return input;
  if(s==='[data-contact-work-tools]')return work;
  throw Error('Unexpected selector '+s);
 },
 querySelectorAll(s){
  if(s==='[data-contact-directory-filter]')return buttons;
  if(s==='[data-contact-directory-section]')return sections;
  throw Error('Unexpected selector '+s);
 }
};
let scheduled=0;
let admin={id:'new-admin'};
const context=vm.createContext({
  currentAdmin:()=>admin,
  document:{querySelector:s=>s==='[data-contact-work-bank-heading]'?heading:
    s==='[data-contact-work-tools]'?work:null},
  directoryTools:()=>tools,
  scheduleSync:()=>{scheduled++;},
  syncMobileDirectoryHeader:()=>{},
  loadedAdminId:'old-admin',
  query:'nguyễn',filter:'friend',groupMap:new Map([['contact','friend']]),Map,String
});
vm.runInContext(piece+'\nthis.reset=resetForAuth;',context);
context.reset();
assert.equal(context.query,'');
assert.equal(context.filter,'all');
assert.equal(context.loadedAdminId,'');
assert.equal(context.groupMap.size,0,'old admin group map cleared');
assert.equal(input.value,'','visible input must match cleared filter model');
assert.equal(tools.dataset.directorySection,'chat');
assert.equal(work.hidden,true);
assert.equal(work.open,false,'collapsed NCC must not stay expanded across Admin sessions');
assert.equal(heading.hidden,true);
assert.equal(sections[0].attributes['aria-selected'],'true');
assert.equal(sections[1].attributes['aria-selected'],'false');
assert.deepEqual(buttons.map(b=>b.dataset.active),['true','false','false','false','false','false'],
  'active pill must match all-category filter');
assert.deepEqual(buttons.map(b=>b.attributes['aria-pressed']),['true','false','false','false','false','false']);
assert.equal(scheduled,1);

context.directoryTools=()=>null;
admin=null;
context.query='another';context.filter='customer';
context.reset();
assert.equal(context.query,'');
assert.equal(context.filter,'all');
assert.equal(scheduled,2);
console.log('CHAT directory auth reset aligns search text, category pill and model PASS');
