'use strict';
// UI-285 / CHAT-398: punctuation/predictive replacements at a soft-wrap must
// not resize the Composer twice or lose the native caret. Exercises the
// production autoGrow/width mirror, not an invented duplicate algorithm.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const mobile=fs.readFileSync('mobile-chat-refresh.css','utf8');
const begin=js.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=js.indexOf('const composerMeasureObserver=',begin);
assert(begin>=0&&end>begin,'canonical Composer autoGrow owner');
const owner=js.slice(begin,end);
assert.match(html,/#measure\{[\s\S]*?overflow-wrap:anywhere;/);
assert.match(mobile,/#appShell\[data-auth-state="authenticated"\]\[data-route="chat"\] #editor\{[\s\S]*?overflow-wrap:anywhere;/);
assert.match(owner,/'overflow-wrap','word-break','white-space','tab-size'/);
const writes=[];
let geometryReads=0;
let computedStyleReads=0;
const editor={value:'',placeholder:'Nhắn tin...',dataset:{},selectionStart:0,selectionEnd:0,
  style:{setProperty(k,v){this[k]=v;writes.push([k,v]);}},
  getBoundingClientRect(){geometryReads++;return{width:132,height:parseFloat(this.style['--editor-height'])||40};}};
const shell={dataset:{}};
const measure={style:{width:'',setProperty(k,v){this[k]=v;}},textContent:'',
 get scrollHeight(){
  // Exact textarea wrapping in the test model. At 132px a short sentence
  // wraps; at 330px it fits into a single line. Punctuation after expansion
  // may alter the browser's break opportunity but not remove a written line.
  const width=parseFloat(this.style.width)||132;
  const cap=Math.max(1,Math.floor((width-8)/8));
  const lines=String(this.textContent||'').split('\n');
  return 18+22*lines.reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/cap)),0);
 }};
const breakpoint={matches:true};
const env={editor,composerShell:shell,measure,
  window:{matchMedia:()=>breakpoint,visualViewport:{height:570},innerHeight:800},
  getComputedStyle:()=>{computedStyleReads++;return{getPropertyValue:p=>p==='overflow-wrap'?'anywhere':''};},
  requestAnimationFrame:()=>{throw Error('synchronous punctuation typing must not create a resize frame')},
  composerObserver:{},Math,Number,String,Boolean};
vm.createContext(env);vm.runInContext(owner,env);
const grow=()=>vm.runInContext("autoGrow({source:'typing'})",env);
function type(value){editor.value=value;editor.selectionStart=editor.selectionEnd=value.length;grow();}
type('Một câu đã đủ dài để xuống dòng');
assert.notEqual(shell.dataset.editorExpanded,'true','first wrap never swaps grid tracks');
assert.equal(measure.style.width,'132px','measure preserves the same native textarea width');
assert(Number.parseFloat(editor.style['--editor-height'])>40,'real wrapped text grows textarea');
assert.equal(writes.filter(([k])=>k==='--editor-height').length,1,
 'one text event changes native textarea height once');
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài');
const multi=Number.parseFloat(editor.style['--editor-height']);
assert(multi>40,'soft-wrap of long sentence grows for the full width');
const before=writes.filter(([k])=>k==='--editor-height').length;
const beforeGeometryReads=geometryReads;
const beforeStyleReads=computedStyleReads;
// A temporary change in wrapping opportunity (punctuation / iOS IME),
// even when the visible sentence length grows, cannot shrink a writing row.
measure.override=40;
const previousScrollHeight=Object.getOwnPropertyDescriptor(measure,'scrollHeight');
Object.defineProperty(measure,'scrollHeight',{get(){return this.override??previousScrollHeight.get.call(this);}});
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài.');
assert.equal(Number.parseFloat(editor.style['--editor-height']),multi,'period does not collapse the native editor while appending');
assert.equal(writes.filter(([k])=>k==='--editor-height').length,before,'period does not trigger another geometry writer');
assert.equal(geometryReads,beforeGeometryReads,'punctuation typing never forces textarea bounding-box layout');
assert.equal(computedStyleReads,beforeStyleReads,'punctuation typing reuses typography metrics');
assert.equal(editor.selectionStart,editor.value.length,'caret is browser-owned');
assert.equal(editor.value.endsWith('.'),true,'punctuation draft remains intact');
measure.override=null;
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài.\n');
assert(measure.textContent.endsWith('\n\u200b'),'only an intentional trailing newline needs a sentinel');
type('Một câu mới');
assert.equal(editor.style['--editor-height'],'40px','replacing text with a shorter draft may shrink');
type('');
assert.notEqual(shell.dataset.editorExpanded,'true','clearing never changes button tracks');
// CHAT-397: a Vietnamese composition session must leave provisional key events
// browser-owned. Only compositionend may measure the final composed text.
assert.match(js,/editor\.addEventListener\('compositionend',\(\)=>\{[\s\S]*?autoGrow\(\{source:'typing'\}\)/);
assert.match(js,/editor\.addEventListener\('input',event=>\{[\s\S]*?if\(!composing&&!event\.isComposing\)autoGrow\(\{source:'typing'\}\)/);
assert.match(js,/adjustForEditorHeightChange\(paintedDelta\)/,
 'keyboard positioning uses painted grid-row height, not raw text height');
assert.match(js,/Math\.max\(44,next\)-Math\.max\(44,previousHeight\)/,
 'keyboard-fixed composer immediately compensates for textarea height');
console.log('UI-285/CHAT-397/398 fixed width, punctuation, IME, keyboard anchoring PASS');
