'use strict';
// CHAT-445 — prevent iOS long-draft clipping and huge keyboard dock.
// No messages, uploads, network or customer data are used in this regression.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const base=fs.readFileSync('mobile-chat-refresh.css','utf8');
const polish=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const ownEditor=base.slice(base.indexOf('#appShell[data-auth-state="authenticated"][data-route="chat"] #editor{'));
assert.match(ownEditor.slice(0,500),/padding:9px 2px!important;/);
assert.match(ownEditor.slice(0,500),/line-height:22px;/);
assert.match(ownEditor.slice(0,500),/max-height:150px;/);
// mobile-ui-polish.css is loaded later and has more specificity; it MUST agree.
const later=polish.slice(polish.indexOf('#appShell[data-auth-state="authenticated"][data-route="chat"] #stageLayout:not([data-bank-report-active="true"]) #editor{'));
assert.match(later.slice(0,450),/line-height:22px;/);
assert(source.indexOf('./mobile-chat-refresh.css')<source.indexOf('./mobile-ui-polish.css'));
assert(app.includes('cssWholeLineCap'),'runtime clamps to actual CSS rather than overflowing it');
assert(app.includes('keyboardOpen?40+3*lineHeight:Infinity'),'keyboard leaves conversation visible');
const start=app.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=app.indexOf('const composerMeasureObserver=',start);
assert(start>0&&end>start,'test the actual production height owner');
let natural=300, heightReads=0, styleReads=0, cssLine=22, cssCap=150;
const editor={
 value:'Một thông báo dài bằng tiếng Việt. '.repeat(40),
 placeholder:'Nhắn tin...',dataset:{},style:{setProperty(k,v){this[k]=v;}},
 getBoundingClientRect(){heightReads++;return{width:170,height:parseFloat(this.style['--editor-height'])||40};}
};
const measure={textContent:'',style:{width:'',setProperty(k,v){this[k]=v;}},get scrollHeight(){return natural;}};
const mm={matches:true};
const vv={height:570};
const keyboard={open:true,adjustForEditorHeightChange(){}};
const context=vm.createContext({
 editor,measure,window:{matchMedia:()=>mm,visualViewport:vv,innerHeight:780},
 getComputedStyle(){styleReads++;return{lineHeight:cssLine+'px',maxHeight:cssCap+'px',getPropertyValue(){return'';}};},
 KeyboardInsetAdapter:keyboard,composerObserver:{},
 requestAnimationFrame(){throw Error('no layout animation during native typing');}
});
vm.runInContext(app.slice(start,end),context);
const grow=source=>vm.runInContext("autoGrow({source:'"+source+"'})",context);
grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'106px','keyboard open: exactly four 22px lines');
assert.equal(editor.dataset.internalScroll,'true','extra text scrolls in the native textarea');
assert.equal(editor.value.includes('tiếng Việt'),true,'never truncate or rewrite draft');
const beforeHeightReads=heightReads, beforeStyleReads=styleReads;
editor.value+=' thêm hàng';
grow('typing');
assert.equal(editor.style['--editor-height'],'106px','forward typing cannot move the keyboard dock');
assert.equal(heightReads,beforeHeightReads,'typing cannot force a geometry read');
assert.equal(styleReads,beforeStyleReads,'typing cannot force a style read');
keyboard.open=false;
grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'150px','keyboard closed: six complete 22px rows');
cssLine=24;cssCap=150;
grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'136px','a future 24px override cannot clip the fifth text line');
cssLine=22;cssCap=150;natural=40;editor.value='OK';
grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'40px','short draft returns to compact controls');
assert.equal(editor.dataset.internalScroll,'false','no inner scroll for one line');
console.log('CHAT-445 final CSS line metrics, keyboard compactness, internal scroll, IME geometry PASS');
