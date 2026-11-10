'use strict';
// UI-285: iPhone: punctuation/predictive replacements around a soft-wrap must
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
const editor={value:'',placeholder:'Nhắn tin...',dataset:{},selectionStart:0,selectionEnd:0,
  style:{setProperty(k,v){this[k]=v;writes.push([k,v]);}},
  getBoundingClientRect(){return{width:shell.dataset.editorExpanded==='true'?330:132};}};
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
  getComputedStyle:()=>({getPropertyValue:p=>p==='overflow-wrap'?'anywhere':''}),
  requestAnimationFrame:()=>{throw Error('synchronous punctuation typing must not create a resize frame')},
  composerObserver:{},Math,Number,String,Boolean};
vm.createContext(env);vm.runInContext(owner,env);
const grow=()=>vm.runInContext("autoGrow({source:'typing'})",env);
function type(value){editor.value=value;editor.selectionStart=editor.selectionEnd=value.length;grow();}
type('Một câu đã đủ dài để xuống dòng');
assert.equal(shell.dataset.editorExpanded,'true','first real wrap expands once');
assert.equal(measure.style.width,'330px','first expanded frame is already measured at actual textarea width');
assert.equal(editor.style['--editor-height']||'40px','40px','no interim tiny-width 2-line height is painted');
assert(!writes.some(([k,v])=>k==='--editor-height'&&v!=='40px'),
 'expansion cannot first paint a stale 132px textarea height');
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài');
const multi=Number.parseFloat(editor.style['--editor-height']);
assert(multi>40,'soft-wrap of long sentence grows for the full width');
const before=writes.filter(([k])=>k==='--editor-height').length;
// A temporary change in wrapping opportunity (punctuation / iOS IME),
// even when the visible sentence length grows, cannot shrink a writing row.
measure.override=40;
const previousScrollHeight=Object.getOwnPropertyDescriptor(measure,'scrollHeight');
Object.defineProperty(measure,'scrollHeight',{get(){return this.override??previousScrollHeight.get.call(this);}});
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài.');
assert.equal(Number.parseFloat(editor.style['--editor-height']),multi,'period does not collapse the native editor while appending');
assert.equal(writes.filter(([k])=>k==='--editor-height').length,before,'period does not trigger another geometry writer');
assert.equal(editor.selectionStart,editor.value.length,'caret is browser-owned');
assert.equal(editor.value.endsWith('.'),true,'punctuation draft remains intact');
measure.override=null;
type('Một câu đã đủ dài để xuống dòng. Và có thêm một câu khá dài.\n');
assert(measure.textContent.endsWith('\n\u200b'),'only an intentional trailing newline needs a sentinel');
type('Một câu mới');
assert.equal(editor.style['--editor-height'],'40px','replacing text with a shorter draft may shrink');
type('');
assert.equal(shell.dataset.editorExpanded,'false','clearing restores one-row compact Composer');
console.log('UI-285 punctuation soft wrap + one-pass width + native caret + no-height bounce PASS');
