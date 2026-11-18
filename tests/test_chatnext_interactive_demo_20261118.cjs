'use strict';
// CHAT NEXT demo is public, isolated, and may never call live Chat services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','docs/chat-next/demo/index.html'),'utf8');
const js=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/i)?.[1]||'';
const css=html.match(/<style>\s*([\s\S]*?)\s*<\/style>/i)?.[1]||'';
assert(js.length>2000 && css.length>2500,'self-contained markup and interactivity required');
assert(!/<script\b[^>]*src=/i.test(html),'demo must not load third-party runtime');
assert(!/<link\b[^>]*href=/i.test(html),'demo must be a single static file');
for(const prohibited of [
 'fetch(', 'XMLHttpRequest','WebSocket(', 'EventSource(', 'navigator.serviceWorker',
 'supabase.createClient', 'V21SyncEngine', 'localStorage', 'indexedDB',
 'window.open(', 'location.href=', 'sendMessage(', 'queueText(', '.insert(',
]){
 assert(!html.includes(prohibited),'public demo must never call live APIs: '+prohibited);
}
assert(html.includes('BẢN DEMO · DỮ LIỆU MẪU'),'visible demo banner mandatory');
assert(html.includes('Không gửi tới khách hàng'),'composer safety labeling mandatory');
assert(html.includes('không tự ghi thu'),'no real payment capability in demo');
assert(html.includes('type="search"')&&html.includes('id="search"'),'search UI');
assert(html.includes('id="contacts"'),'contact list');
assert(html.includes('id="conversation"'),'conversation');
assert(html.includes('id="workDetail"'),'work detail');
assert(html.includes('id="draft"')&&html.includes('id="composer"'),'local preview composer');
assert(html.includes('id="theme"'),'theme switcher');
assert(html.includes('data-filter="unread"')&&html.includes('data-filter="customer"'));
assert(html.includes('data-action="back"')&&html.includes('data-mode="work"'));
assert(html.includes('(pointer:coarse) and (max-width:1023px)'),'tablet responsive');
assert(html.includes('font-size:16px'),'iOS editable input >=16px');
assert(html.includes('env(safe-area-inset-bottom)'),'iPhone safe-area');
assert(html.includes('prefers-reduced-motion:reduce'),'reduced motion');
assert(html.includes('min-height:44px'),'touch targets');
assert(html.includes('replaceChildren()'),'safe, text-only re-render');
new vm.Script(js,{filename:'chat-next-demo-inline.js'});

// Minimal browser implementation to execute demo actions without any network.
const idNodes=new Map(),selectorNodes={};
class FakeElement{
 constructor(tag,id=''){this.tag=tag;this.id=id;this.className='';this.textContent='';this.value='';
  this.innerHTML='';this.dataset={};this.style={};this.hidden=false;this.scrollHeight=24;this.scrollTop=0;
  this.children=[];this.handlers={};this.classList={
    add:(name)=>{this.className=this.className.split(' ').concat(name).join(' ')},
    remove:(name)=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ')},
    toggle:(name,force)=>{let names=new Set(this.className.split(' ').filter(Boolean));let enable=force===undefined?!names.has(name):force;if(enable)names.add(name);else names.delete(name);this.className=Array.from(names).join(' ');return enable},
    contains:(name)=>this.className.split(' ').includes(name)
  }; }
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
 dispatch(k,event={}){for(const h of this.handlers[k]||[])h(Object.assign({target:this,preventDefault(){},isComposing:false},event));}
 get scrollHeight(){return this._scrollHeight||24}
 set scrollHeight(v){this._scrollHeight=v}
}
const ids=['screen','app','toast','theme','themeText','contacts','search','activeAvatar','activeName',
'activeKind','profileAvatar','profileName','profileKind','orderCount','conversation','composer',
'draft','workDetail'];
for(const id of ids)idNodes.set(id,new FakeElement('div',id));
idNodes.get('themeText').textContent='Chế độ tối';
const map={
 '[data-mode]':['chat','work','chat','work'].map(v=>{let n=new FakeElement('button');n.dataset.mode=v;return n}),
 '[data-filter]':['all','unread','group','customer'].map(v=>{let n=new FakeElement('button');n.dataset.filter=v;return n}),
 '[data-work]':['orders','payments','pricing','pick'].map(v=>{let n=new FakeElement('button');n.dataset.work=v;return n}),
 '[data-action]':['call','settings','new','back','work','more','attach','photos'].map(v=>{let n=new FakeElement('button');n.dataset.action=v;return n}),
};
const document={
 body:new FakeElement('body'),
 getElementById(id){return idNodes.get(id)},
 createElement(tag){return new FakeElement(tag)},
 querySelectorAll(sel){return map[sel]||[]}
};
const context={document,console,clearTimeout,setTimeout};
vm.runInNewContext(js,context,{timeout:1500});
assert.equal(idNodes.get('contacts').children.length,5,'initial five mock conversations rendered');
assert.equal(idNodes.get('activeName').textContent,'Chị Lan');
assert.equal(idNodes.get('app').dataset.page,'inbox','mobile starts at Inbox');
map['[data-filter]'][1].dispatch('click');
assert.equal(idNodes.get('contacts').children.length,2,'unread filter uses mock local state');
map['[data-filter]'][3].dispatch('click');
assert.equal(idNodes.get('contacts').children.length,3,'customer filter works offline');
map['[data-filter]'][0].dispatch('click');
const selectedContact=idNodes.get('contacts').children[2];
selectedContact.dispatch('click');
assert.equal(idNodes.get('activeName').textContent,'Anh Minh','contact selection updates chat identity');
assert.equal(idNodes.get('app').dataset.page,'chat','contact opens the conversation on mobile');
idNodes.get('draft').value='Tin nhắn thử nghiệm an toàn';
idNodes.get('composer').dispatch('submit');
const latest=idNodes.get('conversation').children.at(-1);
assert.equal(latest.children[0].textContent,'Tin nhắn thử nghiệm an toàn');
assert.equal(latest.children[1].textContent,'Nháp demo · chưa gửi');
assert.equal(idNodes.get('draft').value,'','sent demo text clears only local textarea');
map['[data-mode]'][1].dispatch('click');
assert(idNodes.get('screen').classList.contains('work-view'),'Work navigation toggles only demo page');
map['[data-work]'][0].dispatch('click');
assert(idNodes.get('workDetail').children.length>=2,'work detail opens without API');
idNodes.get('theme').dispatch('click');
assert(document.body.classList.contains('dark'),'theme toggle uses local DOM only');
map['[data-action]'][3].dispatch('click');
assert.equal(idNodes.get('app').dataset.page,'inbox','back returns to chat directory');
console.log('CHAT NEXT interactive public demo: 5 contacts, filter, chat, mock send, Work, theme, safe isolation PASS');
