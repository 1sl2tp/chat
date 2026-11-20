'use strict';
// CHAT-384 / CHAT-398: stable composer geometry under a synthetic
// VisualViewport. No production messages, tokens, network or browsers.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const admin=fs.readFileSync('admin-composer-actions.js','utf8');
const directory=fs.readFileSync('work-customer-summary.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const start=source.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=source.indexOf('const composerMeasureObserver=',start);
assert(start>=0&&end>start,'existing production measurement function');
const runtime=source.slice(start,end);
const view={height:550};
const mobile={matches:true};
const layout={dataset:{}};
const textarea={
  value:'',placeholder:'Nhắn tin...',style:{setProperty(key,val){this[key]=val;}},
  dataset:{},selectionStart:0,selectionEnd:0,
  getBoundingClientRect(){
    return{width:166,
      height:parseFloat(this.style['--editor-height'])||40};
  }
};
const mirror={textContent:'',style:{width:'',setProperty(key,value){this[key]=value;}},
  get scrollHeight(){
    const width=parseFloat(this.style.width)||166;
    const chars=Math.max(1,Math.floor((width-8)/8));
    const count=String(this.textContent||'').split('\n')
      .reduce((total,line)=>total+Math.max(1,Math.ceil(line.length/chars)),0);
    return 16+24*count;
  }
};
const ctx=vm.createContext({
  editor:textarea,measure:mirror,composerShell:layout,
  window:{matchMedia:()=>mobile,visualViewport:view,innerHeight:800},
  getComputedStyle:()=>({getPropertyValue:()=>'',lineHeight:'24px'}),
  regionTop:{getBoundingClientRect:()=>({height:56})},
  bottomContainer:{getBoundingClientRect:()=>({
    height:12+
      (parseFloat(textarea.style['--editor-height'])||40)
  })},
  composerObserver:{},Math,Number,String,Boolean,
  requestAnimationFrame(){throw Error('typing must not add an animation-frame writer')}
});
vm.runInContext(runtime,ctx);
const grow=(kind='typing')=>vm.runInContext("autoGrow({source:"+JSON.stringify(kind)+"})",ctx);
function type(value){
  textarea.value=value;
  textarea.selectionStart=textarea.selectionEnd=value.length;
  grow();
}
grow();
assert.notEqual(layout.dataset.editorExpanded,'true');
type('Một dòng');
assert.notEqual(layout.dataset.editorExpanded,'true');
type('Dòng một\nDòng hai');
assert.notEqual(layout.dataset.editorExpanded,'true','two lines share same action row');
assert.equal(textarea.style['--editor-height'],'64px','two lines visible without second toolbar');
type('Dòng một\nDòng hai\nDòng ba');
assert.notEqual(layout.dataset.editorExpanded,'true','third line never changes action tracks');
assert.equal(textarea.style['--editor-height'],'88px');
type('Dòng một\nDòng hai\nDòng ba.');
assert.notEqual(layout.dataset.editorExpanded,'true','punctuation cannot change action layout');
type('Dòng một\nDòng hai');
assert.notEqual(layout.dataset.editorExpanded,'true','deleting lines leaves the rail anchored');
assert.equal(textarea.style['--editor-height'],'64px');
type('Tin dài '.repeat(90));
assert.notEqual(layout.dataset.editorExpanded,'true');
assert.equal(textarea.style['--editor-height'],'144px','long draft cap independent of keyboard height');
assert.equal(textarea.dataset.internalScroll,'true');
assert.equal(ctx.composerTextHeightLimit(300,56,56),52,
  '300px viewport still retains 128px for Messages');
view.height=300;
grow('visual-viewport');
assert.equal(textarea.style['--editor-height'],'52px','keyboard budget includes action rail');
assert.equal(textarea.dataset.internalScroll,'true');
assert(300-56-56-52-8>=128,'Messages fit above on-screen keyboard');
type('A\nB');
assert.notEqual(layout.dataset.editorExpanded,'true');
assert.equal(textarea.style['--editor-height'],'52px',
  'small keyboard viewport clamps even two text lines instead of hiding messages');
assert.equal(textarea.dataset.internalScroll,'true');
view.height=550;
grow('visual-viewport');
assert.equal(textarea.style['--editor-height'],'64px');
assert.equal(textarea.dataset.internalScroll,'false');
type('');
assert.notEqual(layout.dataset.editorExpanded,'true');
assert.equal(textarea.style['--editor-height'],'40px');
assert.match(css,/max-height:144px;/);
assert(!css.includes('data-editor-expanded'),'mobile width never changes at line threshold');
assert.match(source,/syncMeasureStyle\(\{force:true,widthPx:editor\.getBoundingClientRect\(\)\.width\}\);\s*autoGrow\(\{source:'context-switch'\}\)/,
  'each contact restores its own draft geometry');
assert.match(directory,/if\(document\.activeElement\?\.id==='editor'\)document\.activeElement\.blur\(\);/,
  'back to directory blurs the composer before changing customer');
assert.match(directory,/navigation\(\)\?\.clearActiveContact\?\.\(\)/);
assert.match(admin,/bar\.hidden=!visible\|\|compact;/,
  'no second business toolbar on mobile');
assert.match(admin,/openQuickCash,\s*openRecentSales,/,
  'existing confirmed cash flow remains available via menu');
assert.match(shell,/if\(action==='search'\)window\.V21ConversationSearch\?\.open\?\.\(\)/);
for(const action of ['search','photos','cash','debt']){
 assert(html.includes('data-chat-header-action="'+action+'"'),
  'one mobile overflow contains '+action);
}
console.log('CHAT-384/398 stable 1/2/3+ lines, keyboard budget, draft isolation PASS');
