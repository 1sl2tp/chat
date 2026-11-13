'use strict';
// CHAT-339 — Web/PWA navigation, in-app forwarding, media actions and audio
// capability. No real message or call is sent by this contract test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
const html=read('index.source.html');
const shell=read('shell.js');
const css=read('mobile-ui-polish.css');
const forward=read('message-forward.js');
const forwardCss=read('message-forward.css');
const app=read('app.js');
const sw=read('sw.js');

const header=html.slice(html.indexOf('id="regionTop"'),html.indexOf('<!-- UX-192:'));
assert(header.includes('data-chat-header-more aria-label="Tùy chọn hội thoại"'));
assert(header.includes('aria-haspopup="menu" aria-expanded="false" aria-controls="chatHeaderActionMenu"'));
for(const kind of ['photos','audio','video']){
  assert(header.includes('data-chat-header-action="'+kind+'"'));
}
assert(/data-chat-header-action="video" disabled aria-disabled="true"/.test(header),
  'unimplemented video transport must not be advertised as working');
assert(header.includes('Gọi video <small>Chưa hỗ trợ</small>'));
assert(header.includes('id="chatCallFocus"'), 'live call controls retained');
assert(header.includes('data-call-secondary-button'), 'incoming decline retained');
assert(/call-focus-icon-call[^>]*>[\s\S]*M7\.2 4\.5/.test(header),
  'desktop call icon cannot claim video for an audio-only call');

assert(shell.includes('function toggleChatHeaderMenu()'));
assert(shell.includes('function closeChatHeaderMenu('));
assert(shell.includes("if(action==='photos')NavigationCommand.openPhotos();"));
assert(shell.includes("if(action==='audio'&&requireAuthenticatedCommand())"));
assert(shell.includes("CallCommand.start(activeContact?.id,activeContact?.name);"));
assert(shell.includes("if(event.key==='Escape'&&closeChatHeaderMenu({restoreFocus:true}))"));
assert(shell.includes("presentation.state!=='idle'"), 'live call UI dismisses header menu');
assert(!shell.includes("if(action==='video')CallCommand.start("),
  'video must not start an audio call');

const mobile=css.slice(css.indexOf('/* CHAT-339'));
assert(mobile.includes('@media(max-width:63.999rem)'));
assert(mobile.includes('.call-focus-button{'));
assert(mobile.includes('display:none!important;'));
assert(mobile.includes('.chat-header-action-menu{'));
assert(mobile.includes('top:calc(100% + 8px);'));
assert(mobile.includes('min-height:46px;'));
assert(mobile.includes('grid-template-columns:minmax(0,1fr)!important;'));
assert(!/position:\s*fixed|position:\s*sticky/.test(mobile),
  'header menu must not become an independent scroll/viewport owner');

assert(forward.includes('Chuyển tiếp</h2>'));
assert(forward.includes('Chọn người nhận trong danh bạ Chat'));
assert(forward.includes("const result=await window.V21SyncEngine?.forwardMessage?.({"));
assert(forward.includes("if(!result?.ok)throw new Error('forward_not_confirmed');"),
  'silent optional-call fallback must not claim delivery');
assert(forward.includes('window.V21ContactStore?.snapshot?.()'));
assert(forward.includes("String(message?.text||'').replace(/\\s+/g,' ').trim().slice(0,160)"));
assert(forwardCss.includes('grid-template-rows:auto auto auto minmax(0,1fr) auto;'));
assert(forwardCss.includes('.message-forward-overlay[data-mobile-keyboard="true"]'));

const viewer=app.slice(app.indexOf('function forwardableCurrentImageViewerMessage(){'),
  app.indexOf('function renderImageViewerFilters(){'));
assert(viewer.includes("assets.length===1"),'viewer may forward only selected single-photo message');
assert(viewer.includes("window.V21MessageForward?.open?.(source)"));
assert(viewer.includes("return shareMessageMedia({media});"),'OS share remains separate');
assert(!viewer.includes('return Boolean(window.V21MessageForward.open(source));'),
  'share action must not redirect to contact picker');
assert(app.includes("forwardItem.textContent='Chuyển tiếp trong Chat';"));
assert(app.includes("if(canNativeShareFiles()){\n    const shareItem="));
assert(app.includes("saveText.textContent='Tải ảnh';"));

assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-header-forward-chat339-20261113';"));
console.log('CHAT-339 header/forward/image/keyboard/Web-PWA owner contract PASS');
