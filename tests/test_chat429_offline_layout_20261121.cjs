'use strict';
// CHAT-429: iPhone PWA must render the conversation without tailwindcdn connectivity.
// Offline, the same inlined critical layout and hidden telemetry must still exist.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const local=html.match(/<style id="chat-critical-local-layout">([\s\S]*?)<\/style>/)?.[1];
assert(local,'Chat shell needs local CSS before remote Tailwind CDN');
assert(html.indexOf('chat-critical-local-layout')<html.indexOf('cdn.tailwindcss.com'));
for(const token of [
 '.hidden,[hidden]{display:none!important}',
 '#modeLabel{display:none!important}',
 '#appShell .flex{display:flex}',
 '#appShell .flex-1{flex:1 1 0%}',
 '#appShell #stageLayout{',
 '#appShell #scrollRoot{',
 '#appShell #regionTop{',
 '#appShell #main{',
 '#appShell #thread{',
 '#appShell #threadContent{',
 '#appShell #composerInteractive{'
]) assert(local.includes(token),'Missing offline-critical layout rule: '+token);
assert(html.includes('id="modeLabel" class="sr-only" aria-hidden="true"'));
assert(!html.includes('#scrollRoot::before'),'old scroll spacer broke app viewport');
assert(!html.includes('data-chat-ios-standalone'),'remove untested iOS status override');
assert(html.includes('name="apple-mobile-web-app-status-bar-style" content="default"'));
const version=html.match(/name="app-release-version" content="([^"]+)"/)?.[1];
assert(version&&app.includes("releaseVersion:'"+version+"'"),'app runtime version');
assert(sw.includes("RELEASE_VERSION='"+version+"'"),'PWA service worker version');
console.log('CHAT-429 offline-critical layout and hidden-scroll-state PASS');
