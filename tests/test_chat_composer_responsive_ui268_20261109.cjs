'use strict';
// UI-268 compact default, UI-273 expand-on-wrap: mobile keeps one action
// row for short drafts, then grows the textarea above the same action rail.
// Preserve IME, native textarea scrolling, keyboard and audio owners.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const js=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const root='#appShell[data-auth-state="authenticated"][data-route="chat"]';
function rule(source,selector){
 const begin=source.indexOf(selector+'{');
 assert(begin>=0,'missing CSS rule: '+selector);
 const end=source.indexOf('}',begin);
 assert(end>begin);
 return source.slice(begin,end).replace(/\s+/g,'');
}
const mobile=css.slice(css.indexOf('@media (max-width:63.999rem), (pointer:coarse) {'));
const narrow=rule(mobile,root+' #composerShell');
assert(narrow.includes('grid-template-columns:var(--ui-control-touch,44px)minmax(0,1fr)var(--ui-control-touch,44px)var(--ui-control-touch,44px);'));
assert(narrow.includes('grid-template-rows:autoautominmax(var(--ui-control-touch,44px),auto);'));
assert(!narrow.includes('grid-row:4'),'no permanently reserved button row');
for(const [part,column] of [['#composer-plus-btn',1],['#editorWrap',2],['#composer-mic-btn',3],['#send',4]]){
 const p=rule(mobile,root+' '+part);
 assert(p.includes('grid-column:'+column+';'),part+' grid column');
 assert(p.includes('grid-row:3;'),part+' shares one visual row');
}
const editor=rule(mobile,root+' #editor');
for(const value of ['height:var(--editor-height,40px);','min-height:40px;','max-height:168px;','padding:9px2px!important;'])
 assert(editor.includes(value),'mobile textarea geometry '+value);
assert(!editor.includes('white-space:nowrap'),'keep multiline draft content intact');
const touch=rule(mobile,root+' :is(#composer-plus-btn,#composer-mic-btn,#send)');
for(const t of ['width:var(--ui-control-touch,44px)!important;','min-height:var(--ui-control-touch,44px)!important;'])
 assert(touch.includes(t),'44px tap target '+t);

const wide=css.slice(css.indexOf('/* UI-268 desktop:'));
assert(wide.includes('@media(min-width:64rem)'));
const desktop=rule(wide,root+' #composerShell');
assert(desktop.includes('grid-template-columns:44pxminmax(0,1fr)44px44px;'));
assert(desktop.includes('grid-template-rows:autoautominmax(44px,auto);'));
const desktopEditor=rule(wide,root+' #editor');
for(const value of ['min-height:40px;','max-height:64px;','line-height:24px;'])
 assert(desktopEditor.includes(value),'desktop 1-2 text lines '+value);

const start=js.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=js.indexOf('const composerMeasureObserver=',start);
assert(start>0&&end>start,'canonical measurement + autoGrow owner');
const runtime=js.slice(start,end);
assert(runtime.includes("+'\\u200b'"),'measure real last line without extra forced newline');
assert(runtime.includes('Math.max(80,Math.min(168,Math.floor(visibleHeight*.35)))'),'mobile cap bounded to keyboard viewport');
assert(runtime.includes('const internalScroll=natural>maxHeight;'),'native overflow after cap');
assert(js.includes("composerMobileBreakpoint?.addEventListener?.('change'"),'recompute on breakpoint');
assert(js.includes('syncMeasureStyle({force:true,widthPx:editor.getBoundingClientRect().width});'),
 'mobile/web line-height remeasurement');
assert(js.includes("if(!composing&&!event.isComposing)ComposerDraftOwner.saveCurrent();"),
 'IME composition guard stays intact');
assert(html.includes('id="editor"')&&html.includes('rows="1"'));
assert(html.includes('id="composerFooter"')&&html.includes('id="attachmentTray"'));
assert(css.includes('#composerShell[data-audio-state="RECORDING"]'),
 'voice recording retains its dedicated surface');
assert(css.includes('#stageLayout[data-keyboard-open="true"]'),
 'VisualViewport input docking remains active');
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-multiline-editor-ui273-20261110';"),
 'new public PWA cache only');

const mm={matches:true};
const editorFake={
 value:'',placeholder:'Nhắn tin...',dataset:{},
 style:{setProperty(prop,value){this[prop]=value;}},
 getBoundingClientRect:()=>({width:160})
};
const measure={
 style:{setProperty(prop,value){this[prop]=value;},width:''},
 textContent:'',
 get scrollHeight(){
   const chars=String(this.textContent||'').split('\n');
   return 16+24*chars.reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/18)),0);
 }
};
const composerShell={dataset:{}};
const context=vm.createContext({
 editor:editorFake,composerShell,measure,window:{matchMedia:()=>mm,innerHeight:700},
 getComputedStyle:()=>({getPropertyValue:()=>''}),
 composerObserver:{},
 requestAnimationFrame:()=>{throw Error('no RAF expected')}
});
vm.runInContext(runtime,context);
const grow=()=>vm.runInContext("autoGrow({source:'typing'})",context);
grow();
assert.equal(editorFake.style['--editor-height'],undefined,'blank mobile remains 40px');
editorFake.value='tin dài '.repeat(20);
grow();
assert.equal(editorFake.dataset.internalScroll,'true','very long mobile draft uses native internal scrolling');
assert.equal(editorFake.style['--editor-height'],'168px','mobile grows up to 168px before internal scroll');
const draft=editorFake.value;
mm.matches=false;
editorFake.value='Một dòng';
grow();
assert.equal(editorFake.style['--editor-height'],'40px','single web line returns to 40px');
assert.equal(editorFake.dataset.internalScroll,'false');
editorFake.value='Dòng thứ nhất\nDòng thứ hai';
grow();
assert.equal(editorFake.style['--editor-height'],'64px','web grows to two visible rows');
editorFake.value='Dòng thứ nhất\nDòng thứ hai\nDòng thứ ba';
grow();
assert.equal(editorFake.style['--editor-height'],'64px','web never becomes a third visible row');
assert.equal(editorFake.dataset.internalScroll,'true','third line remains reachable inside textarea');
mm.matches=true;
grow();
assert.equal(editorFake.style['--editor-height'],'88px','return to mobile reveals three visible lines');
editorFake.value=draft;
grow();
assert.equal(editorFake.value,draft,'mode switch keeps original draft and caret owner');
for(const width of [320,360,375,390,430]){
 const usable=width-2*12-2*4-3*44-3*4-4;
 assert(usable>=140,'one-line textarea fits iPhone '+width);
}
console.log('UI-268 composer mobile 1 row, desktop 1-2 rows, native multiline IME/overflow and PWA PASS');
