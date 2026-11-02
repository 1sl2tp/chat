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
const buttons=['all','customer','cm','friend','other'].map(key=>({
  dataset:{contactDirectoryFilter:key,active:String(key==='friend')}
}));
const tools={
  querySelector(s){assert.equal(s,'[data-contact-directory-search]');return input;},
  querySelectorAll(s){assert.equal(s,'[data-contact-directory-filter]');return buttons;}
};
let scheduled=0;
let admin={id:'new-admin'};
const context=vm.createContext({
  currentAdmin:()=>admin,
  directoryTools:()=>tools,
  scheduleSync:()=>{scheduled++;},
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
assert.deepEqual(buttons.map(b=>b.dataset.active),['true','false','false','false','false'],
  'active pill must match all-category filter');
assert.equal(scheduled,1);

context.directoryTools=()=>null;
admin=null;
context.query='another';context.filter='customer';
context.reset();
assert.equal(context.query,'');
assert.equal(context.filter,'all');
assert.equal(scheduled,2);
console.log('CHAT directory auth reset aligns search text, category pill and model PASS');
