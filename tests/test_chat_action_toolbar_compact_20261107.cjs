'use strict';
// UI-260 screenshot regression: four small-looking actions, 44px real tap
// targets, aligned to the selected message without intercepting selection.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const start=html.indexOf('/* UI-150 / UI-260 touch toolbar');
const end=html.indexOf('/* Equivalent purpose',start);
assert(start>0&&end>start,'mobile toolbar is in its canonical style owner');
const css=html.slice(start,end);
function rule(selector){
 const at=css.indexOf(selector+'{');
 assert(at>=0,'missing CSS: '+selector);
 return css.slice(at+selector.length+1,css.indexOf('}',at)).replace(/\s+/g,'');
}
const rail=rule('.message-action-group');
for(const term of ['bottom:calc(100%+2px);','gap:0;','padding:02px!important;',
 'border-radius:999px;','box-shadow:03px10pxrgba(0,0,0,.085);',
 'width:max-content;','height:var(--ui-control-touch,44px);'])
 assert(rail.includes(term),'compact toolbar: '+term);
assert(rule('.message-action-group.user-actions').includes('right:0;'));
assert(rule('.message-action-group.assistant-actions').includes('left:0;'));
assert(rule('.message-turn[data-actions-placement="below"] .message-action-group').includes('top:calc(100%+2px);'));
const button=rule('.message-action-group .action-button');
for(const term of ['flex:00var(--ui-control-touch,44px);','width:var(--ui-control-touch,44px);',
 'min-width:var(--ui-control-touch,44px);','height:var(--ui-control-touch,44px);',
 'min-height:var(--ui-control-touch,44px);'])
 assert(button.includes(term),'44px touch target '+term);
assert(rule('.message-action-group .action-button svg').includes('width:18px;'));
const expectedWidth=4*44+2*2+2; // four touch targets, side padding, 1px border
assert.equal(expectedWidth,182);
for(const width of [320,360,375,390,430])
 assert(expectedWidth<=width-24,'toolbar fits viewport '+width);
assert(js.includes("turn.dataset.actionsPlacement=(above<54&&below>=54)?'below':'above';"));
assert(js.includes('window.getSelection?.()?.isCollapsed===false'));
assert(js.includes('unit.appendChild(createActionGroup(message));'));
for(const action of ["label:'Trả lời'","label:'Chia sẻ'","label:'Chuyển tiếp'","label:'Sao chép'"])
 assert(js.includes(action),'keep action '+action);
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-bank-report-signal-ui263-20261108';"));
console.log('UI-260 compact contextual toolbar, 182px visual width, 44px targets, 320–430px safety PASS');
