'use strict';
// CHAT NEXT Phase 2 — visual-only customer header/conversation/composer candidate.
// Never modify realtime, messages, virtual list height, keyboard or financial UI.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('chat-next-conversation.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const flag='#appShell[data-chat-next-ui="on"][data-auth-state="authenticated"][data-route="chat"]';
assert(css.includes(flag),'must require authenticated CHAT NEXT preview');
const subjects=css.split('\n').filter(line=>/^\s*#appShell/.test(line));
assert(subjects.length>=5,'expected explicit opt-in selectors');
for(const row of subjects)assert(row.includes(flag),'no candidate style may leak to default Chat');
assert(html.includes('href="./chat-next-conversation.css"'));
assert(html.includes('data-build-source="chat-next-conversation.css"'));
assert(html.indexOf('href="./chat-next-conversation.css"')>html.indexOf('href="./chat-next-inbox.css"'));
assert(shell.includes("get('chatnext')==='1'"),'candidate must be opt-in URL');
assert(css.includes('--chat-message-sent-bg:var(--chat-next-sent);'));
assert(css.includes('--chat-message-received-bg:var(--chat-next-received);'));
assert(css.includes('var(--theme-surface-primary)'),'adapt to light/dark app theme');
assert(css.includes('#regionTop'),'header is a presentation-only change');
assert(css.includes('#composerShell'),'composer surface is visual-only');
assert(css.includes('#composerShell[data-can-send="true"] #send:not(:disabled)'));
assert(css.includes('@media (max-width:63.999rem)'));
assert(css.includes('min-width:0'),'name must shrink, action buttons never clip');
assert(css.includes('prefers-reduced-motion:reduce'));
assert(!css.includes('#messageWindow'),'do not take ownership of virtualized messages');
assert(!css.includes('grid-template-rows:'),'do not redefine conversation layout tracks');
assert(!css.includes('scrollTop'),'no scroll anchor intervention');
assert(!css.includes('position:fixed'),'no keyboard overlay reparenting');
for(const banned of ['fetch(', 'setInterval(', 'supabase.functions', 'v21_sync_pull', 'bank-', 'object-fit:cover!important;']) {
 assert(!css.includes(banned),'phase-2 style cannot take runtime/business ownership: '+banned);
}
assert(app.includes('const editor=document.getElementById(\'editor\')'));
assert(shell.includes('const WORK_ENABLED=false;'),'phase 2 cannot enable a disabled Work route');
console.log('CHAT NEXT phase-2 opt-in conversation: safe scope, native colors and unchanged message/keyboard owners PASS');
