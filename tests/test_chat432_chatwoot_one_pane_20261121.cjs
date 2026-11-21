'use strict';
// CHAT-432 — approved single-pane wireframe: one header, one directory
// navigation owner, existing CallFocus and overflow, no work-route resurrection.
// Read-only contract: no real calls, messages, RPC, timers or browser navigation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
const css=read('mobile-ui-polish.css');
const refresh=read('mobile-chat-refresh.css');
const source=read('index.source.html');
const shell=read('shell.js');
const directory=read('contact-directory-admin.js');
const app=read('app.js');
const work=read('work-customer-summary.js');
const block=css.slice(css.indexOf('/* CHAT-339 / CHAT-432'),css.indexOf('/* UI-341'));
assert(block.includes('/* CHAT-339 / CHAT-432'));
assert(block.includes('.top-mode-switch[data-contact-identity="true"]'));
assert(block.includes('.top-mode-contact-avatar{\n    display:none!important;'));
assert(block.includes('.top-mode-tab[data-top-tab="photos"]{\n    display:none!important;'));
assert(block.includes('.call-focus-slot[data-call-ui-state="idle"]:not([hidden])'));
assert(block.includes('flex:0 0 88px;'));
assert(block.includes('.call-focus-slot[data-call-ui-state="idle"] .call-focus-button{\n    display:grid!important;'));
assert(block.includes('order:1;'));
assert(block.includes('order:2;'));
assert(block.includes('.chat-header-actions{'));
assert(block.includes('.chat-header-more{'));
assert(block.includes('width:44px;'), '44pt touch controls retained');
assert(block.includes('.top-mode-switch[data-directory-owner="true"]'));
assert(block.includes('grid-template-columns:minmax(0,1fr)!important;'),
 'only selected conversation gets one-column top identity');
assert(!block.includes('.top-mode-switch[data-directory-owner="true"] .top-mode-tab[data-top-tab="photos"]{\n    display:none'),
 'directory preserves canonical Chat/Work choices');
assert(!/position:\s*fixed|position:\s*sticky/.test(block),
 'visual header cannot own viewport or scroll');
assert(shell.includes('const WORK_ENABLED=false;'),
 'do not silently re-enable disabled work backend');
assert(shell.includes('function renderCallFocus(){'));
assert(shell.includes('CallCommand.start(activeContact?.id,activeContact?.name);'));
assert(shell.includes("if(action==='photos')NavigationCommand.openPhotos();"));
assert(shell.includes("if(action==='search')window.V21ConversationSearch?.open?.();"));
assert(shell.includes("if(action==='cash'&&authState==='AUTHENTICATED'"));
assert(shell.includes("if(action==='debt'&&authState==='AUTHENTICATED'"));
assert(directory.includes('data-contact-directory-section="work"'),
 'work navigation remains in the existing directory owner');
assert(directory.includes('function syncMobileDirectoryHeader()'));
assert(work.includes("if(label)label.textContent='Trò chuyện';"),
 'directory identity retains the original accessible wording');
assert(refresh.includes('[data-chat-header-mode="typing"]'));
assert(refresh.includes('.call-focus-slot[data-call-ui-state="idle"]{\n    display:none!important;'),
 'typing still prioritizes input, not idle header icons');
for(const id of ['regionTop','scrollRoot','messageWindow','composerShell','composerActionMenu']){
 assert(source.includes('id="'+id+'"'),id+' must keep one production DOM instance');
}
assert(app.includes('stageLayout.dataset.keyboardOpen=String(keyboardOpen)'));
assert(!/fetch\(|XMLHttpRequest|supabase\.|setInterval\(/.test(block));
console.log('CHAT-432 one-pane header, call/menu, directory owner, keyboard and work guards: PASS');
