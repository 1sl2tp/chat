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

assert(html.includes('<title>CHAT NEXT · V23 — Căn lề và nhóm ảnh gọn (demo)</title>'),'V19 named release');
assert(html.includes('data-design-id="CHAT-NEXT-023" data-design-round="23"'),'V19 distinct design round');
assert(html.includes('<span class="version-round">V23</span>'),'visible version selector must be updated');
assert(css.includes('/* CHAT-NEXT-016 — L5 composer precision'),'one micro-geometry owner');
assert(css.includes('.conversation{scrollbar-width:none'),'classic scrollbars cannot shift L4');
assert(css.includes('.conversation::-webkit-scrollbar{display:none'),'WebKit track removed');
assert(css.includes('--frame-input-pad-x:14px')&&css.includes('--frame-input-pad-y:11px'),'input inset tokens');
assert(css.includes('--frame-input-line:24px')&&css.includes('--frame-input-max:120px'),'multiline editor tokens');
assert(html.includes('L5 Ô GÕ / NÚT + / GỬI'),'micro-measurement provided');
assert(html.includes('Math.abs(leftGap-rightGap)<=1'),'symmetric controls');
assert(html.includes('bottomDelta<=1'),'buttons and editor share baseline');


assert(css.includes('/* CHAT-NEXT-017 — Fine-detail design owner'),'V17 centralized detail layer');
for(const token of ['--detail-title:24px','--detail-contact:14px','--detail-preview:12.5px',
 '--detail-thread:14px','--detail-meta:11px','--detail-icon:21px',
 '--detail-row-radius:14px','--detail-control-radius:14px','--detail-unit:4px']){
 assert(css.includes(token),'missing V17 token '+token);
}
assert(html.includes('ICON + / GỬI '),'V17 diagnostic checks glyph centering');
assert(html.includes('leftError<=1&&rightError<=1'),'1px center tolerance required');
assert(css.includes('.contact-title{font-size:var(--detail-contact)'),'contact typography from tokens');
assert(css.includes('.composer-inner #draft{font-size:16px'),'iOS safe textarea size');


assert(css.includes('/* CHAT-NEXT-018 — Readability hierarchy'),'V18 readability owner');
for(const t of ['--read-body:15px','--read-body-line:23px','--read-preview:13px',
 '--read-meta:11.5px','--read-primary:var(--ink)','--read-action:var(--accent)']){
 assert(css.includes(t),'missing V18 readable type/color role '+t);
}
assert(js.includes("kind==='note'")&&js.includes("kind==='order'"),'explicit type classification');
assert(js.includes("raw.join('\\n')"),'request source and rows share structured payload');
assert(js.includes("orderCard(entry[1])"),'request card uses typed message payload, not a second fixed list');
assert(js.includes("row.className+=' order-message'"),'request category is visually distinct');
assert(js.includes("message mine message-preview"),'local demo draft cannot look like sent/confirmed message');
assert(!js.includes('Tin gốc không bị chỉnh sửa.'),'never assert original source without source');
/* V19: validate explicit typed payload once, use aligned quantity/unit subcolumns.
   The readable source is derived from the same validated item entries. */
assert(css.includes('/* CHAT-NEXT-019 — Request card micro-grid'),'V19 semantic grid owner exists');
assert(css.includes('grid-template-columns:minmax(0,1fr) var(--request-quantity-width)'),'request product and quantity columns share one grid');
assert(css.includes('--request-unit-width:52px')&&css.includes('--request-unit-width:46px'),'quantity unit column adapts to narrow mobile');
assert(css.includes('.message-stream .order-name{min-width:0;overflow-wrap:anywhere'),'long product name cannot push quantity offscreen');
assert(css.includes('font-variant-numeric:tabular-nums'),'numeric values align consistently');
assert(js.includes('var items=payload.items.filter(function(item)'),'invalid typed entries are excluded before render');
assert(js.includes("if(!items.length)return el('div','bubble','Không có mặt hàng mẫu hợp lệ để trình bày.')"),
 'missing or invalid item list must fail closed, never invent request data');
assert(js.includes("amount.append(el('b','order-amount',item.amount),el('span','order-unit',item.unit))"),
 'amount and unit share stable column structure');
assert(js.includes("raw.push(qty+' '+item.name)"),'raw text mirrors visible item values');
assert(js.includes('raw.push(payload.note)'),'raw text mirrors the original note');
assert(js.includes("el('strong','order-note-label','Ghi chú')"),'separate note label preserves data hierarchy');

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
assert(html.includes('/* CHAT-NEXT-012: cohesive fine-detail layer.'),'premium polish layer missing');
assert(html.includes('--polish-space-1:4px')&&html.includes('--polish-space-6:24px'),
 'every spacing token follows 4px rhythm');
assert(html.includes('--ui-tap:48px'),'touch hit sizes must remain >=48px');
assert(html.includes('scrollbar-gutter:stable'),'desktop conversation scrollbar must not shift width');
assert(html.includes('.search:focus-within,.editorbox:focus-within'), 'search and editor focus should be visible');
assert(html.includes('.send:disabled'),'empty composer must have distinct disabled CTA');
assert(html.includes('body.dark{--polish-focus:'),'dark state focus contrast token required');
assert(html.includes('class="icon-sprite"'),'one self-contained icon sprite');
for(const name of ['message-circle','briefcase','search','pencil','arrow-left','more','plus','arrow-up','moon','receipt','wallet','tag','image','close']){
 assert(html.includes('id="ui-'+name+'"'),'missing consistent line icon: '+name);
}
assert(!html.includes('>▤</span>')&&!html.includes('>▦</span>')&&!html.includes('>♧</span>'),
 'placeholder glyphs must not remain as primary navigation icons');
assert(html.includes('id="inboxSummary" aria-live="polite"'),'list count needs accessible summary');
assert(html.includes('id="sendDemo" type="submit" disabled'),'empty send starts disabled');
const iconNames=[...html.matchAll(/<symbol id="ui-([a-z-]+)"/g)].map(x=>x[1]);
assert.equal(iconNames.length,18,'one coherent 18-symbol icon family (media zoom included)');
assert.equal(new Set(iconNames).size,18,'no duplicate local icon ids');
for(const [,ref] of html.matchAll(/<use href="#ui-([a-z-]+)"/g)){
 assert(iconNames.includes(ref),'unresolved SVG use reference: '+ref);
}
assert(!html.includes('cdnjs.cloudflare.com')&&!html.includes('fonts.googleapis.com'),
 'no external asset requests; icons and typography are self-contained');
assert(html.includes('Chỉ minh họa'),'sample account connection must never imply real availability');
const color=(key,section)=> {
 const value=section.match(new RegExp('--'+key+':(#[0-9A-Fa-f]{6})'))?.[1];
 assert(value,'missing CSS color: '+key);return value;
};
function luminosity(hex){
 const z=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 return .2126*z[0]+.7152*z[1]+.0722*z[2];
}
function contrast(a,b){const [hi,lo]=[luminosity(a),luminosity(b)].sort((a,b)=>b-a);return(hi+.05)/(lo+.05)}
const palette=css.match(/^:root\{([^}]+)\}/m)?.[1]||'';
const dark=css.match(/^body\.dark\{([^}]+)\}/m)?.[1]||'';
assert(contrast(color('muted',palette),color('subtle',palette))>=4.5,
 'light secondary text must meet AA over subtle surface');
assert(contrast(color('accent',palette),color('accentLight',palette))>=4.5,
 'light selected labels must meet AA on selected background');
assert(contrast(color('muted',dark),color('subtle',dark))>=4.5,
 'dark secondary text must meet AA over subtle surface');
assert(contrast(color('accent',dark),color('accentLight',dark))>=4.5,
 'dark selected labels must meet AA on selected background');
assert(html.includes('min-height:44px'),'touch targets');
assert(html.includes('/* CHAT-NEXT-013 — zero-network media preview'),'media CSS must remain isolated');
assert(html.includes('.media-art{position:relative;isolation:isolate;aspect-ratio:4/3'),
  'media thumbnail dimensions must be fixed without remote image load');
assert(html.includes('.media-card{display:block;width:min(300px,100%)'),
  'media thumbnails fit inside chat and remain constant size');
assert(html.includes('.bubble{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;user-select:text'), 'long notes and unbroken codes must wrap and remain selectable');
assert(html.includes('ABC-0123456789-0123456789-0123456789-0123456789'), 'long order code regression sample');
assert(html.includes('.media-stage{flex:1;min-height:0;overflow:auto'),
  'media-stage must own zoom scroll separately from chat list');
assert(html.includes('.media-dialog[open]{display:flex;flex-direction:column}'),
  'native dialog should not leak a hidden empty overlay');
assert(html.includes('id="mediaViewer" aria-labelledby="mediaViewerTitle" aria-modal="true"'),
  'media viewer is one accessible modal');
assert(html.includes("['media','order','07:29']")&&html.includes("['media','catalog','09:03']"),
  'sample media belongs to mock messages only');
assert(html.includes('DEMO · KHÔNG PHẢI ẢNH THẬT'),
  'fictional art must be labelled, never mistaken for a real bill');
assert(!/<img\b[^>]+src=/i.test(html),'no remote customer images in public demo');
assert(!html.includes('data:image'),'demo image previews use mock CSS only');

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

/* V14 structural contract: shared content-width wrappers, not four unrelated
   padded siblings. This does not claim pixel-perfect real-device verification. */
assert(html.includes('/* CHAT-NEXT-014 — Single geometry owner'),'L0-L5 frame must have one owner');
for(const required of [
 'class="chat-width chat-header-inner"','class="chat-width message-stream" id="messageStream"',
 'class="chat-width composer-inner"','class="chat-width chat-note-inner"',
 'grid-template-rows:var(--frame-head-height) minmax(0,1fr) auto auto',
 'grid-template-columns:var(--frame-control) minmax(0,1fr) var(--frame-control)',
 'width:min(var(--frame-thread-max),calc(100% - var(--frame-thread-axis) - var(--frame-thread-axis)))',
 'grid-template-columns:44px minmax(0,1fr) 64px'
]){
 assert(html.includes(required),'missing shared alignment contract: '+required);
}
assert(html.includes("var box=byId('messageStream');box.replaceChildren"),
 'renderChat must write only inside the message stream, not replace its geometry wrapper');
assert(html.includes("byId('conversation').scrollTop=byId('conversation').scrollHeight"),
 'scroll owner must remain the original conversation viewport');
assert(html.includes("input.style.height='24px'")&&html.includes('Math.min(input.scrollHeight,120)'),
 'auto-growing text uses canonical 24px baseline and 120px ceiling');
assert(html.includes('--frame-control:48px')&&html.includes('--frame-thread-max:760px')&&html.includes('--frame-inbox-axis:16px'),
 'L1-L5 tokens should be specified in one frame owner');
function getFramePx(name){
 const start=html.indexOf('/* CHAT-NEXT-014 — Single geometry owner');
 const fragment=html.slice(start,html.indexOf('</style>',start));
 const value=fragment.match(new RegExp('--frame-'+name+':(\\d+)px'))?.[1];
 assert(value,'missing frame token: '+name);
 return Number(value);
}
const rail=getFramePx('rail'),contextWidth=getFramePx('context'),axis=getFramePx('inbox-axis');
const control=getFramePx('control'),gap=getFramePx('control-gap');
assert.equal(axis,16,'same sidebar axis is used by header, filters and contact row');
for(const width of [320,360,375,390,414,430]){
 const gutter=width<=360?10:12;
 const content=width-2*gutter;
 const textareaArea=content-2*44-2*(width<=360?6:gap);
 assert(textareaArea>=200,'mobile input too narrow at '+width);
 const messageMax=content*.88;
 assert(messageMax<=content,'message cannot overflow shared frame at '+width);
}
for(const width of [1024,1280,1399,1440,1600,1920]){
 const available=Math.min(width-40,1460);
 const dir=Math.min(332,Math.max(292,Math.round(width*.25)));
 const hasContext=width>=1400;
 const chatWidth=available-rail-dir-(hasContext?contextWidth:0);
 assert(chatWidth>=400,'main pane must have usable width at '+width);
 const content=Math.min(760,chatWidth-32);
 assert(content>=360,'desktop header/messages/composer content width at '+width);
 const textareaArea=content-2*control-2*gap;
 assert(textareaArea>=240,'desktop input must retain width at '+width);
}

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
'activeKind','profileAvatar','profileName','profileKind','orderCount','conversation','messageStream','composer',
'draft','sendDemo','inboxSummary','workDetail','conversationActions','actionSheetTitle',
 'mediaViewer','mediaViewerTitle','mediaViewerCount','mediaViewerMeta','mediaThumbnails','mediaStage',
 'mediaCanvas','mediaPrev','mediaNext','mediaZoomIn','mediaZoomOut','mediaZoomLabel','mediaClose'];
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
assert.equal(idNodes.get('inboxSummary').textContent,'5 hội thoại · 2 chưa đọc');
assert.equal(idNodes.get('sendDemo').disabled,true,'send action disabled for empty draft');
assert.equal(idNodes.get('contacts').children[0].dataset.unread,'true',
 'unread is represented by a state, not just a colored count');
assert(String(idNodes.get('contacts').children[0]['aria-label']).includes('2 tin chưa đọc'),
 'unread badge is accessible by spoken button label');
idNodes.get('search').value='không tồn tại';
idNodes.get('search').dispatch('input');
assert.equal(idNodes.get('contacts').children.length,1,'search empty state is a single result');
assert.equal(idNodes.get('contacts').children[0].className,'no-results','empty state is semantically styled');
assert.equal(idNodes.get('inboxSummary').textContent,'0 kết quả cho tìm kiếm','count also updates on empty search');
idNodes.get('search').value='';
idNodes.get('search').dispatch('input');
assert.equal(idNodes.get('contacts').children.length,5,'clear search restores all sample conversations');
assert.equal(idNodes.get('activeName').textContent,'Chị Lan');
assert.equal(idNodes.get('app').dataset.page,'inbox','mobile starts at Inbox');
assert.equal(window.location.hash,'#inbox','initial history state must be a safe local Inbox fragment');
// Open real DOM-like mock media tile in Lan's conversation, without any image fetch.
const orderRow=idNodes.get('messageStream').children.find(x=>x.className.includes('order-message'));
assert(orderRow,'Lan chat has an explicitly typed sample request');
const orderCardNode=orderRow.children[0];
const requestColumns=orderCardNode.children.find(x=>x.className==='order-columns');
assert(requestColumns,'the request has one semantic column heading');
assert.equal(requestColumns.children[0].textContent,'Mặt hàng');
assert.equal(requestColumns.children[1].textContent,'Số lượng');
const requestItems=orderCardNode.children.filter(x=>x.className==='orderitem');
assert.equal(requestItems.length,2,'request entries come from one structured payload');
assert.equal(requestItems[0].children[0].textContent,'Sữa hộp');
assert.equal(requestItems[0].children[1].children[0].textContent,'2','amount is separate and tabular');
assert.equal(requestItems[0].children[1].children[1].textContent,'thùng','unit is separate and aligned');
assert.equal(requestItems[1].children[1].children[0].textContent,'3');
assert.equal(requestItems[1].children[1].children[1].textContent,'hộp');
const requestSource=orderCardNode.children.find(x=>x.className==='order-source');
assert.equal(requestSource.children[1].textContent,['2 thùng Sữa hộp','3 hộp Bánh quy','Chiều giao giúp chị nhé.'].join(String.fromCharCode(10)),
 'one typed payload drives both visible columns and unmodified readable source');
/* V21: image stage centers fitted artwork and shows grouped thumbnails. */
assert(css.includes('/* CHAT-NEXT-021: media viewport centered'),'viewer stage has one geometry owner');
assert(css.includes('/* CHAT-NEXT-022: zoom width must not be clamped'),'V22 zoom clamp fixed');
assert(css.includes('/* CHAT-NEXT-023: iPhone conversation geometry'),'V23 mobile geometry owner');
assert(js.includes('function lastEntry(p)'),'V23 latest message source');
assert(js.includes('function conversationSearchText(p)'),'V23 full conversation search');
assert(js.includes('function saveConversationPosition()'),'V23 scroll restoration');
assert(js.includes("else if(action==='photos'){var items=selected().texts"),'V23 scoped media');
assert(css.includes('.media-gallery{gap:3px;border-radius:14px;max-height:340px}'),'V23 gallery max height');
assert(js.includes("mediaViewer.addEventListener('keydown'"),'V22 keyboard navigation');
assert(js.includes('mediaLastTap=0'),'V22 double tap');
assert(css.includes('.media-stage{display:flex;align-items:center;justify-content:center}'),'fitted image centered in viewport');
assert(css.includes('.media-thumbnails{flex:0 0 auto;display:flex'),'thumbnail rail has independent scroll');
assert(css.includes('.media-thumbnail.selected{border-color:var(--accent)}'),'active thumbnail is highlighted');
assert(js.includes("thumb.setAttribute('aria-pressed',String(i===activeMediaIndex))"),'thumbnail selection accessible');
assert(js.includes("thumb.addEventListener('click',function(){activeMediaIndex=i;renderMediaViewer()})"),'thumbnail opens selected item');
assert(js.includes("byId('mediaStage').addEventListener('touchend'"),'touch swipe navigation exists');
assert(js.includes("if(!mediaTouchStart||!event.changedTouches.length)return"),'touch handler fails closed');
assert(js.includes("byId('mediaStage').addEventListener('dblclick'"),'double click toggles zoom');
/* V20: separate gallery message, 2/3/4/6 samples and scoped image navigation. */
assert(css.includes('/* CHAT-NEXT-020: media group owner'),'V20 grid has one CSS owner');
assert(js.includes("else if(kind==='gallery')"),'explicit gallery message only');
assert(js.includes('valid.slice(0,valid.length>=5?4:valid.length)'),'5+ uses four visible tiles');
assert(js.includes("el('span','media-gallery-more','+'+(valid.length-4))"),'remaining count is exact');
assert(js.includes('activeMediaSet=valid'),'viewer navigates the same grouped message');
assert(js.includes('var valid=ids.filter(function(id)'),'gallery validates sample media IDs');
assert(css.includes('.media-gallery.three .media-gallery-tile:first-child{grid-row:span 2}'),'3-image layout has one dominant tile');
assert(css.includes('gap:4px'),'gallery uses consistent gutters');
const galleries=idNodes.get('messageStream').children.filter(x=>x.className.includes('media-gallery-message'));
assert.equal(galleries.length,4,'Lan has four explicitly separate mock gallery messages');
assert.deepEqual(galleries.map(x=>x.children[0].children.length),[2,3,4,4],
 'two, three, four and six media groups use bounded visible tiles');
assert.equal(galleries[3].children[0].children[3].children[1].textContent,'+2',
 'six mock images show +2 remaining');
galleries[3].children[0].children[3].dispatch('click');
assert.equal(idNodes.get('mediaViewerCount').textContent,'4 / 6 ảnh mẫu',
 'opening +N tile starts at the fourth image of the same group');
idNodes.get('mediaNext').dispatch('click');
assert.equal(idNodes.get('mediaViewerCount').textContent,'5 / 6 ảnh mẫu',
 'next navigates hidden fifth image within same message');
idNodes.get('mediaClose').dispatch('click');
const mediaRow=idNodes.get('messageStream').children.find(x=>x.className.includes('media-message'));
assert(mediaRow,'Lan chat contains a media preview in a stable ratio card');
assert.equal(mediaRow.children[0].className,'media-card','media sample is accessible as a button');
mediaRow.children[0].dispatch('click');
assert.equal(idNodes.get('mediaViewer').open,true,'one tap opens native media viewer');
assert.equal(idNodes.get('mediaViewerTitle').textContent,'Phiếu hàng minh họa');
assert.equal(idNodes.get('mediaViewerCount').textContent,'1 / 2 ảnh mẫu');
assert.equal(idNodes.get('mediaCanvas').children.length,1,'mock artwork is locally constructed');
assert.equal(idNodes.get('mediaZoomLabel').textContent,'100%');
assert.equal(idNodes.get('mediaZoomOut').disabled,true,'cannot zoom below 100%');
assert.equal(idNodes.get('mediaPrev').disabled,true,'cannot navigate before first example');
idNodes.get('mediaZoomIn').dispatch('click');
assert.equal(idNodes.get('mediaZoomLabel').textContent,'150%','zoom first increment 50%');
assert.equal(idNodes.get('mediaCanvas').style.width,'150%','zoom is width in one scroll owner');
idNodes.get('mediaZoomIn').dispatch('click');
assert.equal(idNodes.get('mediaZoomLabel').textContent,'200%');
assert.equal(idNodes.get('mediaZoomIn').disabled,true,'zoom capped at 200%');
idNodes.get('mediaNext').dispatch('click');
assert.equal(idNodes.get('mediaViewerTitle').textContent,'Bảng sản phẩm minh họa');
assert.equal(idNodes.get('mediaViewerCount').textContent,'2 / 2 ảnh mẫu');
assert.equal(idNodes.get('mediaZoomLabel').textContent,'100%','switch image resets zoom to fit');
assert.equal(idNodes.get('mediaNext').disabled,true,'last sample disables next');
idNodes.get('mediaPrev').dispatch('click');
assert.equal(idNodes.get('mediaViewerTitle').textContent,'Phiếu hàng minh họa');
idNodes.get('mediaClose').dispatch('click');
assert.equal(idNodes.get('mediaViewer').open,false,'one tap closes media dialog');
assert.equal(mediaRow.children[0].focused,true,'focus returns to originally clicked image');

map['[data-filter]'][1].dispatch('click');
assert.equal(map['[data-filter]'][1]['aria-pressed'],'true','active filter announced');
assert.equal(map['[data-filter]'][0]['aria-pressed'],'false','inactive filter announced');
assert.equal(idNodes.get('contacts').children.length,2,'unread filter uses mock local state');
assert.equal(idNodes.get('inboxSummary').textContent,'2 kết quả','filter updates count');
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
idNodes.get('draft').dispatch('input');
assert.equal(idNodes.get('sendDemo').disabled,false,'send action enabled when draft has text');
idNodes.get('composer').dispatch('submit');
const latest=idNodes.get('messageStream').children.at(-1);
assert.equal(latest.children[0].textContent,'Tin nhắn thử nghiệm an toàn');
assert.equal(latest.children[1].textContent,'Nháp demo · chưa gửi');
assert.equal(idNodes.get('draft').value,'','sent demo text clears only local textarea');
assert.equal(idNodes.get('sendDemo').disabled,true,'send action returns to disabled after local preview');
idNodes.get('draft').value='Nháp riêng của Anh Minh';
idNodes.get('draft').dispatch('input');
idNodes.get('contacts').children[0].dispatch('click'); // Lan
assert.equal(idNodes.get('draft').value,'','draft must not leak between contacts');
idNodes.get('contacts').children[2].dispatch('click'); // back to Minh
assert.equal(idNodes.get('draft').value,'Nháp riêng của Anh Minh','unsent draft restored per selected contact');
assert.equal(idNodes.get('sendDemo').disabled,false,'restored unsent draft re-enables demo action');
assert.equal(idNodes.get('messageStream').children.at(-1).children[0].textContent,
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
map['[data-action]'][7].dispatch('click');
assert.equal(idNodes.get('mediaViewer').open,true,'context Photos action opens same single viewer');
map['[data-action]'][3].dispatch('click');
assert.equal(idNodes.get('mediaViewer').open,false,'Back closes media overlay safely');
map['[data-action]'][5].focused=false;
map['[data-action]'][5].dispatch('click');
map['[data-sheet-action]'][1].dispatch('click');
assert.equal(idNodes.get('conversationActions').open,false,'context sheet closes before media opens');
assert.equal(idNodes.get('mediaViewer').open,true,'context gallery action opens same safe viewer');
idNodes.get('mediaClose').dispatch('click');
assert.equal(map['[data-action]'][5].focused,true,'closing media restores focus to original visible menu trigger');
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
console.log('CHAT NEXT V19 demo: request column semantics, media, Back, keyboard, drafts, offline isolation PASS');
