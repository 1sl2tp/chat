'use strict';
// UI-246 — directory preview must render emoticons consistently with
// message bubbles, without modifying canonical messages or links.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const appStart=app.indexOf('const DISPLAY_EMOTICONS=Object.freeze(');
const appEnd=app.indexOf('const MESSAGE_LINK_RE=',appStart);
assert(appStart>=0&&appEnd>appStart,'canonical Chat display mapping exists');
const a={window:{}};
vm.createContext(a);
vm.runInContext(app.slice(appStart,appEnd),a);
assert.equal(typeof a.window.V21NormalizeDisplayEmoticons,'function');
assert(source.indexOf('data-build-source="app.js"')<source.indexOf('data-build-source="shell.js"'),
  'app.js must publish display mapping before shell.js');
const shellStart=shell.indexOf('function compactPreview(value){');
const shellEnd=shell.indexOf('function syncContactActiveState(){',shellStart);
assert(shellStart>=0&&shellEnd>shellStart,'sidebar preview owner exists');
const s={window:a.window,bankReportContactView:()=>null};
vm.createContext(s);
vm.runInContext(shell.slice(shellStart,shellEnd)+'\nglobalThis.preview=contactPreview;',s);
const fixtures=[
  ['Bạn: a cảm ơn em :)','Bạn: a cảm ơn em 🙂'],
  ['  Chào  :)   ', 'Chào 🙂'],
  ['Bạn: vui quá :D','Bạn: vui quá 😄'],
  ['Khỏe không ;)','Khỏe không 😉'],
  ['Rất buồn :(','Rất buồn 🙁'],
  ['Thử :P','Thử 😛'],
  ['Hơi ngại :~','Hơi ngại 😅'],
  ['https://app.taphoa.xyz/kh/?kh=abc&tab=no','https://app.taphoa.xyz/kh/?kh=abc&tab=no'],
  ['Lịch 09:13','Lịch 09:13'],
  ['Đã có 🙂','Đã có 🙂']
];
for(const [input,expected] of fixtures){
  const item={preview_kind:'text',preview_text:input};
  assert.equal(s.preview(item),expected,'preview '+input);
  assert.equal(item.preview_text,input,'preview must not rewrite canonical text');
}
assert.equal(s.preview({preview_kind:'image',preview_text:'Bạn: :)'}),'Bạn: Ảnh');
assert.equal(s.preview({preview_kind:'audio',preview_text:'Bạn: :)'}),'Bạn: Ghi âm');
assert.equal(s.preview({preview_kind:'file',preview_text:'Bạn: :)'}),'Bạn: Tệp');
assert.equal(s.preview({preview_text:''}),'Chưa có tin nhắn');
assert(shell.includes('const previewText=contactPreview(item);'));
assert.equal(shell.split('const previewText=contactPreview(item);').length-1,2,
  'initial row and realtime row patch must use the same preview');
assert(shell.includes('preview.textContent='),'preview is text only, not HTML');
const shellEpoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'';
assert(shellEpoch.startsWith('pwa-chat-')&&shellEpoch!=='pwa-chat-time-media-edge-ui245-20261106');
console.log('UI-246 directory emoticons: text/message parity, no data mutation, initial/realtime/PWA PASS');
