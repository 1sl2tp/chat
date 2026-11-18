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
assert(html.includes('@media(max-width:700px),(hover:none),(pointer:coarse)'),'touch tablet responsive without 1024px gap');
assert(html.includes('font-size:16px'),'iOS editable input >=16px');
assert(html.includes('env(safe-area-inset-bottom)'),'iPhone safe-area');
assert(html.includes('env(safe-area-inset-top,0px)'),'notch-safe top banner');
assert(html.includes('.app,.work-view .app{box-sizing:border-box;flex:1 1 auto;height:auto;min-height:0}'),
 'one mobile height owner; no fixed 43px competition with iOS keyboard');
assert(html.includes('demoDrafts=Object.create(null),demoPreviewMessages=Object.create(null)'),
 'demo may retain drafts per chat in RAM only, never browser storage');
assert(html.includes('min-width:48px'),'48px touch target visual contract');
assert(html.includes('prefers-reduced-motion:reduce'),'reduced motion');
assert(html.includes('min-height:44px'),'touch targets');
assert(html.includes('--ui-tap:48px'),'Android-sized touch primitives');
assert(html.includes('id="conversationActions"')&&html.includes('aria-modal="true"'),'native contextual dialog required');
assert(html.includes('aria-controls="conversationActions"'),'conversation menu has its own control');
assert(html.includes('data-sheet-action="work"'),'business tools are contextual, not a third fixed header icon');
assert(html.includes('data-sheet-close'),'sheet must have 44+ px close target');
assert(html.includes('aria-pressed="true"')&&html.includes('aria-pressed="false"'),'filter state must be announced');
assert(!html.includes('data-action="work" title="Công việc của liên hệ"'),'work button should not crowd mobile chat header');
assert(html.includes('replaceChildren()'),'safe, text-only re-render');
assert(html.includes("window.history.pushState({chatNextDemo:true},'',fragment)"),
 'mock route changes must be native Back compatible');
assert(html.includes("window.addEventListener('popstate',restoreDemoRoute)"),
 'browser Back must restore mock route without outbound navigation');
assert(html.includes('window.visualViewport.addEventListener'), 'one visible viewport owner for soft keyboard');
assert(html.includes('top:var(--demo-vv-top,0px)')&&html.includes('height:var(--demo-vv-height,100dvh)'),
 'keyboard geometry must be applied to root surface, not message scroller');
assert(!html.includes('setInterval('),'no keyboard polling');
new vm.Script(js,{filename:'chat-next-demo-inline.js'});

// Minimal browser implementation to execute demo actions without any network.
const idNodes=new Map(),selectorNodes={};
class FakeElement{
 constructor(tag,id=''){this.tag=tag;this.id=id;this.className='';this.textContent='';this.value='';
  this.innerHTML='';this.dataset={};this.style={setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}};this.hidden=false;this.open=false;this.scrollHeight=24;this.scrollTop=0;
  this.children=[];this.handlers={};this.classList={
    add:(name)=>{this.className=this.className.split(' ').concat(name).join(' ')},
    remove:(name)=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ')},
    toggle:(name,force)=>{let names=new Set(this.className.split(' ').filter(Boolean));let enable=force===undefined?!names.has(name):force;if(enable)names.add(name);else names.delete(name);this.className=Array.from(names).join(' ');return enable},
    contains:(name)=>this.className.split(' ').includes(name)
  }; }
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}
 removeAttribute(k){delete this[k]}
 focus(){this.focused=true;document.activeElement=this}
 showModal(){this.open=true}
 close(){this.open=false;this.dispatch('close')}
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
 dispatch(k,event={}){for(const h of this.handlers[k]||[])h.call(this,Object.assign({target:this,preventDefault(){},isComposing:false},event));}
 get scrollHeight(){return this._scrollHeight||24}
 set scrollHeight(v){this._scrollHeight=v}
}
const ids=['screen','app','toast','theme','themeText','contacts','search','activeAvatar','activeName',
'activeKind','profileAvatar','profileName','profileKind','orderCount','conversation','composer',
'draft','workDetail','conversationActions','actionSheetTitle'];
for(const id of ids)idNodes.set(id,new FakeElement('div',id));
idNodes.get('themeText').textContent='Chế độ tối';
const map={
 '[data-mode]':['chat','work','chat','work'].map(v=>{let n=new FakeElement('button');n.dataset.mode=v;return n}),
 '[data-filter]':['all','unread','group','customer'].map(v=>{let n=new FakeElement('button');n.dataset.filter=v;return n}),
 '[data-work]':['orders','payments','pricing','pick'].map(v=>{let n=new FakeElement('button');n.dataset.work=v;return n}),
 '[data-action]':['call','settings','new','back','work','more','attach','photos'].map(v=>{let n=new FakeElement('button');n.dataset.action=v;return n}),
 '[data-sheet-close]':[new FakeElement('button')],
 '[data-sheet-action]':['work','photos'].map(v=>{let n=new FakeElement('button');n.dataset.sheetAction=v;return n}),
};
const document={
 body:new FakeElement('body'),activeElement:null,handlers:{},
 getElementById(id){return idNodes.get(id)},
 createElement(tag){return new FakeElement(tag)},
 querySelectorAll(sel){return map[sel]||[]},
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn)},
 dispatch(k){for(const fn of this.handlers[k]||[])fn({type:k})}
};
const location={hash:''},historyStack=[{hash:'',state:null}];let historyIndex=0;
const window={
 location,handlers:{},
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn)},
 dispatch(k){for(const fn of this.handlers[k]||[])fn({type:k})},
 requestAnimationFrame(fn){fn();return 1},
 matchMedia(){return {matches:true}},
 visualViewport:{
  height:844,offsetTop:0,handlers:{},
  addEventListener(k,fn){(this.handlers[k]||=[]).push(fn)},
  dispatch(k){for(const fn of this.handlers[k]||[])fn({type:k})}
 }
};
window.history={
 state:null,length:1,
 replaceState(state,title,hash){historyStack[historyIndex]={state,hash};this.state=state;location.hash=hash},
 pushState(state,title,hash){
  historyStack.splice(historyIndex+1);historyStack.push({state,hash});historyIndex++;
  this.state=state;this.length=historyStack.length;location.hash=hash;
 },
 back(){if(historyIndex>0){historyIndex--;this.state=historyStack[historyIndex].state;location.hash=historyStack[historyIndex].hash;window.dispatch('popstate');window.dispatch('hashchange')}},
 forward(){if(historyIndex<historyStack.length-1){historyIndex++;this.state=historyStack[historyIndex].state;location.hash=historyStack[historyIndex].hash;window.dispatch('popstate');window.dispatch('hashchange')}}
};
const context={document,window,console,clearTimeout,setTimeout};
vm.runInNewContext(js,context,{timeout:1500});
assert.equal(idNodes.get('contacts').children.length,5,'initial five mock conversations rendered');
assert.equal(idNodes.get('activeName').textContent,'Chị Lan');
assert.equal(idNodes.get('app').dataset.page,'inbox','mobile starts at Inbox');
assert.equal(window.location.hash,'#inbox','initial history state must be a safe local Inbox fragment');
map['[data-filter]'][1].dispatch('click');
assert.equal(map['[data-filter]'][1]['aria-pressed'],'true','active filter announced');
assert.equal(map['[data-filter]'][0]['aria-pressed'],'false','inactive filter announced');
assert.equal(idNodes.get('contacts').children.length,2,'unread filter uses mock local state');
map['[data-filter]'][3].dispatch('click');
assert.equal(idNodes.get('contacts').children.length,3,'customer filter works offline');
map['[data-filter]'][0].dispatch('click');
const selectedContact=idNodes.get('contacts').children[2];
selectedContact.dispatch('click');
assert.equal(idNodes.get('activeName').textContent,'Anh Minh','contact selection updates chat identity');
assert.equal(idNodes.get('app').dataset.page,'chat','contact opens the conversation on mobile');
assert.equal(window.location.hash,'#chat/minh','no account or real customer id exposed in sample fragment');
assert.equal(window.history.length,2,'selecting mock contact makes one history entry');
map['[data-action]'][3].dispatch('click');
assert.equal(idNodes.get('app').dataset.page,'inbox','native Back restores Inbox');
assert.equal(window.location.hash,'#inbox','native Back hash');
window.history.forward();
assert.equal(idNodes.get('app').dataset.page,'chat','Forward restores selected conversation');
assert.equal(idNodes.get('activeName').textContent,'Anh Minh','Forward retains contact identity');
idNodes.get('draft').value='Tin nhắn thử nghiệm an toàn';
idNodes.get('composer').dispatch('submit');
const latest=idNodes.get('conversation').children.at(-1);
assert.equal(latest.children[0].textContent,'Tin nhắn thử nghiệm an toàn');
assert.equal(latest.children[1].textContent,'Nháp demo · chưa gửi');
assert.equal(idNodes.get('draft').value,'','sent demo text clears only local textarea');
idNodes.get('draft').value='Nháp riêng của Anh Minh';
idNodes.get('draft').dispatch('input');
idNodes.get('contacts').children[0].dispatch('click'); // Lan
assert.equal(idNodes.get('draft').value,'','draft must not leak between contacts');
idNodes.get('contacts').children[2].dispatch('click'); // back to Minh
assert.equal(idNodes.get('draft').value,'Nháp riêng của Anh Minh','unsent draft restored per selected contact');
assert.equal(idNodes.get('conversation').children.at(-1).children[0].textContent,
 'Tin nhắn thử nghiệm an toàn','mock message retained during contact switch');
map['[data-mode]'][1].dispatch('click');
assert(idNodes.get('screen').classList.contains('work-view'),'Work navigation toggles only demo page');
map['[data-work]'][0].dispatch('click');
assert(idNodes.get('workDetail').children.length>=2,'work detail opens without API');
idNodes.get('theme').dispatch('click');
assert(document.body.classList.contains('dark'),'theme toggle uses local DOM only');
map['[data-action]'][3].dispatch('click');
assert.equal(idNodes.get('app').dataset.page,'inbox','back returns to chat directory');
map['[data-action]'][5].dispatch('click');
assert(idNodes.get('conversationActions').open,'more opens native action sheet');
assert.equal(idNodes.get('actionSheetTitle').textContent,'Anh Minh','sheet title matches selected conversation');
map['[data-sheet-action]'][0].dispatch('click');
assert.equal(idNodes.get('conversationActions').open,false,'work action closes sheet');
assert(idNodes.get('screen').classList.contains('work-view'),'contextual Work opens from sheet');
assert(map['[data-action]'][5].focused,'closing sheet restores focus to trigger');
map['[data-action]'][5].dispatch('click');
map['[data-sheet-close]'][0].dispatch('click');
assert.equal(idNodes.get('conversationActions').open,false,'close button dismisses sheet');
document.activeElement=idNodes.get('draft');
window.visualViewport.height=432;window.visualViewport.offsetTop=31;
window.visualViewport.dispatch('resize');
assert.equal(idNodes.get('screen').style['--demo-vv-height'],'432px','visual viewport constrains composer above keyboard');
assert.equal(idNodes.get('screen').style['--demo-vv-top'],'31px','Safari viewport offset follows its visible top');
window.visualViewport.height=380;window.visualViewport.offsetTop=44;
window.visualViewport.dispatch('scroll');
assert.equal(idNodes.get('screen').style['--demo-vv-height'],'380px','same owner updates on visual viewport scroll');
document.activeElement=null;document.dispatch('focusout');
assert.equal(idNodes.get('screen').style['--demo-vv-height'],undefined,'keyboard geometry clears on blur');
assert.equal(idNodes.get('screen').style['--demo-vv-top'],undefined,'stale Safari offset clears on blur');
console.log('CHAT NEXT interactive public demo: 5 contacts, native Back, keyboard viewport, per-chat draft, filter, mock send, Work, theme, isolation PASS');
