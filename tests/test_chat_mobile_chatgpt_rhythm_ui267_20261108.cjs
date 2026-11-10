'use strict';
// UI-267: fix the real iPhone directory + conversation screenshot geometry
// without forking UI state, chat data, realtime or native/PWA implementations.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const composer=fs.readFileSync('mobile-chat-refresh.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker='/* UI-267 — ChatGPT-first iPhone rhythm';
assert.equal(css.split(marker).length-1,1);
const owned=css.slice(css.indexOf(marker));
assert(owned.startsWith(marker)&&owned.trimEnd().endsWith('}'),'last mobile geometry layer');
function rule(src,selector){
 const start=src.indexOf(selector+'{');
 assert(start>=0,'missing selector '+selector);
 const end=src.indexOf('}',start);
 assert(end>start);
 return src.slice(start,end).replace(/\s+/g,'');
}
const root='#appShell[data-auth-state="authenticated"]';
const chat=root+'[data-route="chat"]';
const vars=rule(owned,root);
assert(vars.includes('--header-height:56px;'));
const actions=rule(owned,chat+' #chatQuickActions>button');
assert(actions.includes('min-height:44px;')&&actions.includes('height:44px;'));
assert(actions.includes('font-size:12px;')&&actions.includes('white-space:nowrap;'));
assert(rule(owned,chat+' #chatQuickActions:not([hidden])').includes('min-height:48px;'));
assert(rule(owned,chat+' #chatQuickActions>button>span svg').includes('stroke:currentColor;'));
for(const action of ['cash','debt','photos','recent']){
 const re=new RegExp('data-chat-quick="'+action+'"[^>]*><span aria-hidden="true"><svg viewBox="0 0 24 24">');
 assert(re.test(html),'outline icon with existing business handler '+action);
}
const item=rule(owned,root+' #shellNavigationLayer .contact-directory-tools');
assert(item.includes('padding:3px6px5px!important;'),'directory tools need less dead top space');
const filters=rule(owned,root+' #shellNavigationLayer .contact-directory-filter');
assert(filters.includes('min-height:44px!important;'),'filters retain 44px accessible touch targets');
assert(rule(owned,root+' #shellNavigationLayer .contact-directory-filter-more').includes('min-height:44px;'),
 'extra filters toggle remains at least 44px');
assert(css.includes('height:60px!important;')&&css.includes('grid-template-columns:40px minmax(0,1fr);'),
 'stable 60px rows and 40px avatars are not rewritten');
assert(css.includes('data-mobile-directory')||css.includes('data-mobile-keyboard'),
 'directory keyboard owner must remain');
assert(owned.includes('margin-top:5px!important;')&&owned.includes('margin-top:13px!important;'),
 'consistent grouping for same sender and changed sender');
assert(owned.includes('.message-day-separator::before,')&&owned.includes('opacity:.48;'),
 'day separator has faint real rules instead of floating alone');
assert(css.includes('padding-bottom:25px!important;'),'in-bubble time and virtual scroll estimate remain paired');
assert(app.includes("time.className='message-sent-time'"),'no duplicate time nodes');
assert(shell.includes("const showIdleCall=route==='chat'&&hasContact;"),'live call owner untouched');
const mobileComposer=rule(composer,chat+' #composerShell');
assert(mobileComposer.includes('grid-template-rows:autoautominmax(var(--ui-control-touch,44px),auto);'));
const editor=rule(composer,chat+' #editor');
assert(editor.includes('min-height:40px;')&&editor.includes('padding:9px2px!important;'));
for(const id of ['composer-plus-btn','composer-mic-btn','send']){
 assert(composer.includes('#'+id),'no missing composer control');
}
assert(composer.includes('width:var(--ui-control-touch,44px)!important;'),
 'all plus/mic/send controls keep 44px targets');
assert(composer.includes('#stageLayout[data-keyboard-open="true"]'),
 'VisualViewport soft keyboard geometry stays owned elsewhere');
assert(html.includes('id="chatCallFocus"')&&html.includes('id="chatQuickActions"'));
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-multiline-editor-ui273-20261110';"),
 'public PWA shell release, not account IndexedDB caches');
console.log('UI-267 screenshot-driven ChatGPT mobile contact, conversation, business controls and keyboard PASS');
