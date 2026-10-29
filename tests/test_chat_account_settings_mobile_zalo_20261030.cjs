'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(ROOT,'zalo-admin-link.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'zalo-admin-link.css'),'utf8');
const getSection=(a,b)=>{const start=js.indexOf(a),end=js.indexOf(b,start);assert(start>=0&&end>start,'missing '+a);return js.slice(start,end);};
// The settings controls must own their scrolling, not shrink their heights
// into the account directory or overlay it.
assert(js.includes('class="zalo-account-preferences" data-zalo-account-preferences'));
assert(js.includes('data-zalo-account-directory-status'));
assert(js.includes('data-zalo-account-unassigned aria-pressed="false"'));
assert(js.includes('Thêm từ Zalo'));
assert(js.includes('data-zalo-account-list'));
assert(js.includes("accountDirectoryMode=accountDirectoryMode==='all'?'unassigned-zalo':'all';"));
assert(js.includes("accountDirectoryMode='all';"),'open/close reset to canonical All mode');
assert(css.includes('.zalo-account-preferences{'));
assert(css.includes('flex:0 0 auto;min-height:0;max-height:min(34svh,300px)'));
assert(css.includes('overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain'));
assert(css.includes('.zalo-account-preferences .zalo-account-notification{'));
assert(css.includes('flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto;'));
assert(css.includes('.zalo-account-row{grid-template-columns:minmax(0,1fr);align-items:stretch;'));
assert(css.includes('.zalo-account-row-actions{'));
assert(css.includes('grid-column:1;justify-content:flex-start;'));
assert(css.includes('.zalo-account-person::before{content:"Chat"}'));
assert(css.includes('.zalo-account-relation::before{content:"Zalo"}'));
assert(css.includes('.zalo-account-search input,.zalo-account-panel input[type="search"],'));
assert(css.includes('.zalo-account-create-form input:not([type="checkbox"]){font-size:16px}'));
assert(css.includes('height:calc(100dvh - 16px);'));
assert(css.includes('.zalo-account-list{min-height:0;min-width:0;flex:1 1 auto;'));
// Still the same canonical admin commands; the new control changes only local view.
for(const action of ["action:'link'","action:'unlink'","action:'create_and_link'","action:'admin_snapshot'"])
  assert(js.includes(action),'existing mutation/read path preserved '+action);

class FakeNode{
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this._bySelector=new Map();this._text='';this.attributes={};this.listeners={};this.value='';this.scrollTop=0;}
  set innerHTML(html){this.html=html;this.children=[];this._bySelector.clear();}
  set textContent(text){this._text=String(text||'');this.children=[];}
  get textContent(){return this._text;}
  querySelector(selector){
    if(!this._bySelector.has(selector))this._bySelector.set(selector,new FakeNode(selector));
    return this._bySelector.get(selector);
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  appendChild(node){this.children.push(node);return node;}
  append(...nodes){nodes.forEach(n=>this.appendChild(n));}
  replaceChildren(){this.children=[];}
  addEventListener(type,fn){this.listeners[type]=fn;}
  get childElementCount(){return this.children.length;}
}
const root=new FakeNode('modal');
const body=new FakeNode('list'),search=new FakeNode('search'),toggle=new FakeNode('button'),summary=new FakeNode('summary');
const mapping=new Map([
 ['[data-zalo-account-list]',body],['[data-zalo-account-search]',search],
 ['[data-zalo-account-unassigned]',toggle],['[data-zalo-account-directory-status]',summary]
]);
root.querySelector=s=>mapping.get(s)||null;
const vmctx={
 Map,String,Array,Number,Boolean,Object,Intl,
 document:{createElement:tag=>new FakeNode(tag)},
 accountModal:root,accountDirectoryMode:'all',accountBusy:false,
 accountSnapshot:{
  accounts:[{id:'c-1',username:'anhan',display_name:'Anh Đạt'},{id:'c-2',username:'chua',display_name:'Chưa Zalo'}],
  contacts:[
   {zalo_id:'z-1',display_name:'Quang Đạt',thread_type:'user'},
   {zalo_id:'z-2',display_name:'Hạ Thư',thread_type:'user'},
   {zalo_id:'z-3',display_name:'Nhóm Bán Hàng',thread_type:'group'}
  ],
  links:[{chat_account_id:'c-1',zalo_id:'z-1'}]
 },
 avatarNode:()=>new FakeNode('avatar'),
 zaloName:contact=>contact.display_name,
 zaloProfileName:()=>'',zaloEndpointKind:contact=>contact.thread_type==='group'?'Nhóm Zalo':'Zalo cá nhân',
 zaloEndpointShort:contact=>contact.thread_type==='group'?'Nhóm':'Cá nhân',
 openAccountPicker(){},openCreateAccount(){},invokeBody(){throw Error('No backend requests during local filtering');},
 setAccountBusy(){},setAccountError(){},refreshAccountAdmin(){}
};
vm.createContext(vmctx);
vm.runInContext(
 getSection('function accountModel(){','function setAccountError(')+
 getSection('function normalizeAccountSearch(value){','function openAccountPicker(account){')+
 '\nglobalThis.paint=renderAccountRows;globalThis.matches=accountMatchesSearch;globalThis.normalize=normalizeAccountSearch;',vmctx);
vmctx.paint();
assert.equal(body.childElementCount,4,'All mode: two Chat rows and two unassigned Zalo rows');
assert.equal(toggle.textContent,'Thêm từ Zalo');
assert.equal(toggle.attributes['aria-pressed'],'false');
assert.equal(summary.textContent,'2 Chat · 2 Zalo chưa gán');
// Accents, @username, and canonical Zalo identifiers all search locally.
assert(vmctx.matches({display_name:'Hạ Thư'},null,'ha thu'));
assert(vmctx.matches({username:'chua'},null,'@chua'));
assert(vmctx.matches(null,{zalo_id:'z-3'},vmctx.normalize('Z-3')));
search.value='nhom ban hang';
vmctx.paint();
assert.equal(body.childElementCount,1);
assert.equal(summary.textContent,'0 Chat · 1 Zalo chưa gán');
// "Thêm từ Zalo" only displays unassigned contacts; no extra RPC.
search.value='';
vmctx.accountDirectoryMode='unassigned-zalo';
vmctx.paint();
assert.equal(body.childElementCount,2);
assert.equal(toggle.textContent,'Tất cả');
assert.equal(toggle.attributes['aria-pressed'],'true');
assert.equal(summary.textContent,'2 Zalo chưa gán');
assert(body.children.every(row=>row.className.includes('zalo-account-row-zalo-only')));
search.value='khong co';
vmctx.paint();
assert.equal(body.childElementCount,1);
assert.equal(body.children[0].textContent,'Không tìm thấy tài khoản hoặc Zalo phù hợp');
search.value='';
vmctx.accountDirectoryMode='all';vmctx.paint();
assert.equal(body.childElementCount,4);
console.log('CHAT account settings mobile geometry and local Chat/Zalo search/filter PASS');
