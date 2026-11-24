'use strict';
// CHAT-446: photo-derived mobile Composer geometry, no message/network/DB writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const prefix='#appShell[data-auth-state="authenticated"][data-route="chat"]';
const narrow=css.slice(css.indexOf('@media (max-width:63.999rem), (pointer:coarse) {'),css.indexOf('/* UI-268 desktop:'));
function rule(name){
 const k=narrow.indexOf(prefix+' '+name+'{');
 assert(k>=0,'existing child owner '+name);
 return narrow.slice(k,narrow.indexOf('}',k)).replace(/\s+/g,'');
}
const shell=rule('#composerShell');
assert(shell.includes('grid-template-rows:autoautominmax(40px,auto)minmax(var(--ui-control-touch,44px),auto);'));
assert(shell.includes('grid-template-columns:var(--ui-control-touch,44px)minmax(0,1fr)var(--ui-control-touch,44px)var(--ui-control-touch,44px);'));
const wrap=rule('#editorWrap');
assert(wrap.includes('grid-column:1/-1;'),'text spans full capsule width');
assert(wrap.includes('grid-row:3;'));
assert(wrap.includes('padding:010px!important;'),'text aligns with both capsule edges');
for(const [id,column] of [['#composer-plus-btn',1],['#composer-mic-btn',3],['#send',4]]){
 const r=rule(id);
 assert(r.includes('grid-column:'+column+';'));
 assert(r.includes('grid-row:4;'),'controls never move on newline');
}
assert.equal((html.match(/id="editor"/g)||[]).length,1);
assert(html.includes('rows="1"'));
assert(app.includes('const paintedDelta=mobile'),'different physical mobile/desktop dock');
assert(app.includes('?next-previousHeight'),'mobile full editor delta');
assert(app.includes('KeyboardInsetAdapter.adjustForEditorHeightChange(paintedDelta)'),
 'existing VisualViewport owner remains sole positioning code');
assert(sw.includes("RELEASE_VERSION='V21.72.83'"));
assert(sw.includes('pwa-chat-ui446-full-width-composer-20261124'));
const begin=app.indexOf('const COMPOSER_MEASURE_STYLE_PROPS=[');
const end=app.indexOf('const composerMeasureObserver=',begin);
assert(begin>0&&end>begin);
let natural=40, viewportHeight=570, correction=0;
const keyboard={open:true,adjustForEditorHeightChange(delta){correction+=delta;}};
const editor={
 value:'',placeholder:'Nhắn tin...',dataset:{},style:{setProperty(k,v){this[k]=v;}},
 getBoundingClientRect(){return{width:310,height:parseFloat(this.style['--editor-height'])||40};}
};
const mirror={textContent:'',style:{width:'',setProperty(k,v){this[k]=v;}},get scrollHeight(){return natural;}};
const context=vm.createContext({
 editor,measure:mirror,composerObserver:{},KeyboardInsetAdapter:keyboard,
 window:{matchMedia:()=>({matches:true}),visualViewport:{get height(){return viewportHeight;}},innerHeight:780},
 getComputedStyle:()=>({lineHeight:'22px',maxHeight:'150px',getPropertyValue:()=>''}),
 regionTop:{getBoundingClientRect:()=>({height:44})},
 bottomContainer:{getBoundingClientRect:()=>({height:44+(parseFloat(editor.style['--editor-height'])||40)+8})},
 requestAnimationFrame:()=>{throw Error('no layout animation while typing');}
});
vm.runInContext(app.slice(begin,end),context);
const grow=source=>vm.runInContext("autoGrow({source:'"+source+"'})",context);
grow('visual-viewport');
natural=84;editor.value='Dòng 1\nDòng 2\nDòng 3';
grow('typing');
assert.equal(editor.style['--editor-height'],'84px','three lines visible');
assert.equal(correction,44,'mobile dock changes by full editor delta');
natural=300;editor.value+=' thêm chữ dài'.repeat(30);
grow('typing');
assert.equal(editor.style['--editor-height'],'106px','four rows at keyboard open');
assert.equal(editor.dataset.internalScroll,'true');
assert.equal(correction,66,'no 4px bounce');
const draft=editor.value;
keyboard.open=false;grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'150px','closed keyboard allows six rows');
assert.equal(editor.value,draft,'native draft unchanged');
viewportHeight=300;keyboard.open=true;grow('visual-viewport');
assert.equal(editor.dataset.internalScroll,'true','short viewport keeps native scroll');
natural=40;editor.value='Xin chào';grow('visual-viewport');
assert.equal(editor.style['--editor-height'],'40px','one line compact');
assert.equal(editor.dataset.internalScroll,'false');
console.log('CHAT-446 full-width editor, footer, keyboard cap and stable caret PASS');
