'use strict';
// UI-258: two distinct bubble surfaces, no media/realtime or viewport mutation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.source.html','utf8');
const mobile=fs.readFileSync('mobile-ui-polish.css','utf8');
const refresh=fs.readFileSync('mobile-chat-refresh.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const root='#appShell[data-auth-state="authenticated"][data-route="chat"] #messageWindow>.message-row[data-content-kind="text"] ';
function rule(css,selector){
 const start=css.indexOf(selector+'{');
 assert(start>=0,'Missing selector: '+selector);
 return css.slice(start+selector.length+1,css.indexOf('}',start)).replace(/\s+/g,'');
}
const sent=rule(mobile,root+'.user-message-unit>.message-text');
const received=rule(mobile,root+'.assistant-message-unit>.message-text');
assert(sent.includes('background:var(--chat-message-sent-bg)!important;'));
assert(received.includes('background:var(--chat-message-received-bg)!important;'));
assert(sent.includes('color:var(--theme-content-primary)!important;'));
assert(received.includes('color:var(--theme-content-primary)!important;'));
assert(html.includes('--chat-message-sent-bg:color-mix(in srgb,#78aef8 10%,var(--theme-surface-primary));'));
assert(html.includes('--chat-message-received-bg:var(--theme-surface-secondary);'));
// Reference screenshot: muted pastel around #EEF3FE on a #FCFCFC canvas.
// Ten percent #78aef8 mixed into the canvas keeps all RGB channels within 3.
const base=[252,252,252],blue=[120,174,248],expected=[238,243,254];
const mixed=base.map((value,i)=>Math.round(value*.9+blue[i]*.1));
assert(mixed.every((value,i)=>Math.abs(value-expected[i])<=3),
  'sent bubble should match ChatGPT-like pale blue, not saturated UI-258 blue');
assert(rule(html,'.user-message-unit>.message-text').includes('background:var(--chat-message-sent-bg);'));
assert(rule(html,'.assistant-message-unit>.message-text').includes('background:var(--chat-message-received-bg)!important;'));
assert(rule(refresh,'#appShell[data-auth-state="authenticated"][data-route="chat"] .assistant-message-unit>.message-text').includes('background:var(--chat-message-received-bg)!important;'));
const start=mobile.indexOf('/* UI-258: each conversation side has one theme-aware color owner');
assert(start>0);
const section=mobile.slice(start,mobile.indexOf('/* Respect the existing 17px',start));
assert(!section.includes('.message-media-shell'),'do not recolor media cards');
assert(mobile.includes('padding-bottom:25px!important;'),'preserve timestamp footer');
assert(html.includes('.user-message-unit .file-message-card{'));
assert(html.includes('.assistant-message-unit .audio-message-card{'));
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-notice-settings-ui262-20261108';"));
console.log('UI-258 blue sent / gray received bubbles for Web/PWA and preserved media/time PASS');
