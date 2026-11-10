'use strict';
// UI-273: iOS composer auto-growth and action rail under wrapped text.
// Contract: native textarea retains its draft/caret, 44px buttons stay visible,
// viewport cap prevents keyboard occlusion, and clear restores compact layout.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile-chat-refresh.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
const mobile=css.slice(css.indexOf('@media (max-width:63.999rem), (pointer:coarse) {'));
const selector='#appShell[data-auth-state="authenticated"][data-route="chat"]';
function rule(selectorText){
  const start=mobile.indexOf(selectorText+'{');
  assert(start>=0,'missing CSS '+selectorText);
  return mobile.slice(start,mobile.indexOf('}',start)).replace(/\s+/g,'');
}
const editor=rule(selector+' #editor');
assert(editor.includes('height:var(--editor-height,40px);'));
assert(editor.includes('max-height:168px;'));
assert(editor.includes('white-space:pre-wrap;'));
assert(editor.includes('overflow-wrap:anywhere;'));
const expanded=rule(selector+' #composerShell[data-editor-expanded="true"]');
assert(expanded.includes('grid-template-rows:autoautominmax(40px,auto)44px;'));
const wrap=rule(selector+' #composerShell[data-editor-expanded="true"] #editorWrap');
assert(wrap.includes('grid-column:1/-1;')&&wrap.includes('grid-row:3;'));
const rail=rule(selector+' #composerShell[data-editor-expanded="true"] :is(#composer-plus-btn,#composer-mic-btn,#send)');
assert(rail.includes('grid-row:4;'),'all three 44px actions move below text');
assert(html.includes('rows="1"'),'use the existing native textarea, not a contenteditable fork');
assert(js.includes("window.visualViewport?.addEventListener?.('resize'"),'keyboard and rotation resize cap');

const start=js.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=js.indexOf('const composerMeasureObserver=',start);
assert(start>0&&end>start);
const script=js.slice(start,end);
const editorState={value:'',placeholder:'Nhắn tin...',dataset:{},selectionStart:0,selectionEnd:0,
  style:{setProperty(k,v){this[k]=v;}},
  getBoundingClientRect(){return{width:this.width};},width:170
};
const measure={textContent:'',style:{width:'',setProperty(k,v){this[k]=v;}},
  get scrollHeight(){
    const width=parseFloat(this.style.width)||170;
    const capacity=Math.max(1,Math.floor((width-8)/8));
    const lines=String(this.textContent||'').split('\n');
    const count=lines.reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/capacity)),0);
    return mm.matches?18+22*count:16+24*count;
  }
};
const shell={dataset:{}};
const visualViewport={height:540};
const mm={matches:true};
const context=vm.createContext({
 editor:editorState,composerShell:shell,measure,
 window:{matchMedia:()=>mm,visualViewport,innerHeight:680},
 getComputedStyle(){return{getPropertyValue(){return'';}};},
 composerObserver:{},requestAnimationFrame(){throw Error('unexpected RAF');}
});
vm.runInContext(script,context);
const grow=()=>vm.runInContext("autoGrow({source:'typing'})",context);
function type(text){
  editorState.value=text;
  editorState.selectionStart=editorState.selectionEnd=text.length;
  grow();
}
grow();
assert.notEqual(shell.dataset.editorExpanded,'true','empty composer stays compact');
type('Xin chào');
assert.notEqual(shell.dataset.editorExpanded,'true','short input stays on one row');
assert.equal(editorState.style['--editor-height'],undefined,'short draft needs no forced grow');
type('Đoạn văn dài cần hiển thị đầy đủ trên iPhone');
assert.equal(shell.dataset.editorExpanded,'true','soft-wrapped second line expands input');
assert(Number.parseFloat(editorState.style['--editor-height'])>40,'textarea grows vertically');
assert.equal(editorState.dataset.internalScroll,'false','short paragraph remains fully visible');

// A wider expanded textarea can wrap fewer lines than the compact version.
// The action row must NOT collapse and re-expand as the user types.
editorState.width=350;
vm.runInContext('syncMeasureStyle({widthPx:editor.getBoundingClientRect().width});autoGrow()',context);
assert.equal(shell.dataset.editorExpanded,'true','no layout oscillation after width change');
const lengthy='Viết nội dung dài nhiều dòng để kiểm tra khả năng theo dõi vị trí con trỏ trên iPhone. '.repeat(16);
type(lengthy);
assert.equal(editorState.style['--editor-height'],'168px','mobile cap exposes multiple text rows');
assert.equal(editorState.dataset.internalScroll,'true','beyond cap scroll only the textarea');
assert.equal(editorState.value,lengthy,'draft contents preserved');
assert.equal(editorState.selectionStart,lengthy.length,'caret not rewritten');
visualViewport.height=300;
grow();
assert.equal(editorState.style['--editor-height'],'105px','keyboard shrinks max editor height');
assert.equal(editorState.dataset.internalScroll,'true');
type('Dòng một\nDòng hai');
assert.equal(shell.dataset.editorExpanded,'true','explicit newlines remain visible');
assert.equal(editorState.dataset.internalScroll,'false','two-line draft never requires internal scroll');
type('');
assert.equal(shell.dataset.editorExpanded,'false','empty draft returns to compact row');
assert.equal(editorState.style['--editor-height'],'40px');
mm.matches=false;
type('Desktop 1\nDesktop 2');
assert.equal(shell.dataset.editorExpanded,'false','desktop unchanged by iPhone action layout');
assert.equal(editorState.style['--editor-height'],'64px','desktop existing two-line cap intact');
console.log('UI-273 mobile textarea wraps, auto-grows, caps with keyboard, preserves caret, expands rail and restores compact PASS');
