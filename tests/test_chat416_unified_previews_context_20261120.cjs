'use strict';
// CHAT-416: shared presentation-only casing + conservative ChatGPT-like layout.
// Offline assertions: never dispatch notifications or write real messages.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const caseSource=read('chat-message-case.js');
const shell=read('shell.js');
const sw=read('sw.js');
const app=read('app.js');
const html=read('index.source.html');
const css=read('chat-context-layout.css');
const search=read('conversation-search.js');
const forward=read('message-forward.js');
const toast=read('admin-push-controller.js');
const caseContext={};
vm.runInNewContext(caseSource,caseContext);
const fmt=caseContext.V21ChatMessageCase;
assert.equal(typeof fmt.previewCase,'function');
const cases=[
 ['CHỦ NHẬT CHỊ NGHỈ','Chủ nhật chị nghỉ'],
 ['CHỊ CÓ NHÉ','Chị có nhé'],
 ['e gửi đơn hết rồi đó a xem nhe','E gửi đơn hết rồi đó a xem nhe'],
 ['Bạn: e gửi đơn hết rồi đó a xem nhe','Bạn: E gửi đơn hết rồi đó a xem nhe'],
 ['Bạn: CHỦ NHẬT CHỊ NGHỈ','Bạn: Chủ nhật chị nghỉ'],
 ['Bạn: ẢNH','Bạn: Ảnh'],
 ['ẢNH','Ảnh'],
 ['Bạn: QR 20/11/2026 STK 123456','Bạn: QR 20/11/2026 STK 123456'],
 ['Bạn: https://Example.COM/DG12?Token=ABC OK','Bạn: https://Example.COM/DG12?Token=ABC ok'],
 ['Chú ý DG123 và mã SKU5','Chú ý DG123 và mã SKU5'],
];
for(const [input,expected] of cases){
 assert.equal(fmt.previewCase(input),expected,'preview '+input);
 assert.equal(fmt.previewCase(fmt.previewCase(input)),expected,'stable preview '+input);
}
const contactStart=shell.indexOf('function contactPreview(item){');
const contactEnd=shell.indexOf('\nfunction syncContactActiveState(',contactStart);
assert(contactStart>0&&contactEnd>contactStart);
const ctx={
 window:{V21ChatMessageCase:fmt,V21NormalizeDisplayEmoticons:x=>x},
 bankReportContactView:()=>null,
 compactPreview:x=>String(x||'').replace(/\s+/g,' ').trim()
};
vm.runInNewContext(shell.slice(contactStart,contactEnd)+';globalThis.contactPreview=contactPreview;',ctx);
const record={preview_text:'Bạn: CHỦ NHẬT CHỊ NGHỈ',preview_kind:'text'};
assert.equal(ctx.contactPreview(record),'Bạn: Chủ nhật chị nghỉ');
assert.equal(record.preview_text,'Bạn: CHỦ NHẬT CHỊ NGHỈ','DB projection stays untouched');
assert.equal(ctx.contactPreview({preview_text:'Bạn: ẢNH',preview_kind:'image'}),'Bạn: Ảnh');
assert.equal(ctx.contactPreview({preview_text:'CHỊ CÓ NHÉ',preview_kind:'text'}),'Chị có nhé');
assert(shell.includes('renderMobileChatDrawerRecents()')&&shell.includes("row.querySelector('.shell-contact-preview')"),
 'mobile recent and unread list reuse one contact preview');
assert(search.includes('V21ChatMessageCase?.previewCase?.(hit.preview)'),
 'search previews use the same formatter');
assert(forward.includes('V21ChatMessageCase?.previewCase?.(raw)'),
 'forward preview uses same formatter');
assert(toast.includes('V21ChatMessageCase?.previewCase?.(rawPreview)'),
 'foreground toasts use same formatter');
assert(sw.includes("importScripts('./chat-message-case.js')"),
 'OS push worker imports the very same source as browser');
const swCtx={};
swCtx.self=swCtx;
vm.createContext(swCtx);
swCtx.importScripts=path=>{
 assert.equal(path,'./chat-message-case.js');
 vm.runInContext(caseSource,swCtx);
};
const swHeader=sw.slice(0,sw.indexOf('const RELEASE_VERSION='));
vm.runInContext(swHeader,swCtx);
assert.equal(swCtx.chatPushDisplayPreview('CHỊ CÓ NHÉ'),'Chị có nhé');
assert.equal(swCtx.chatPushDisplayPreview('Bạn: ẢNH'),'Bạn: Ảnh');
const dirtySource=sw.slice(sw.indexOf('function notifyMessageDirty('),sw.indexOf("\nself.addEventListener('message'"));
vm.runInContext(dirtySource,swCtx);
const posted=[];
swCtx.notifyMessageDirty([{postMessage:x=>posted.push(x)}],{
 kind:'message',conversation_id:'conv',contact_id:'kh',message_id:'one',
 title:'C Sâm pl',body:'CHỦ NHẬT CHỊ NGHỈ'
});
assert.equal(posted[0].body,'Chủ nhật chị nghỉ');
assert.equal(posted[0].title,'C Sâm pl','proper name must not be auto-lowercased');
assert(sw.includes("kind==='message'?")&&sw.includes("chatPushDisplayPreview(payload.body||'Tin nhắn mới')"),
 'only chat-message lockscreen previews are re-cased, bank/calls stay intact');
assert(/const SHELL_CACHE_EPOCH='pwa-chat-(?:ui|img)?[0-9]+-[a-z0-9-]+-[0-9]{8}'/u.test(sw)&&
 sw.includes("const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH")&&
 sw.includes("key.startsWith('taphoa-chat-shell-')")&&
 !sw.includes("indexedDB.deleteDatabase("),
 'PWA cache must rotate only the public shell, never private drafts/outbox');
assert(html.includes('data-build-source="chat-context-layout.css"'),
 'contextual stylesheet participates in canonical build');
assert(html.indexOf('data-build-source="chat-context-layout.css"')>
 html.indexOf('data-build-source="chatgpt-ab-conversation.css"'),
 'context visual skin must follow A/B chat design');
assert(app.includes('const contextHeading=source.includes'),
 'explicit labels only, no guessed tasks');
assert(app.includes('message-rich-section-title'));
assert(css.includes('.message-rich-section-title'));
assert(css.includes('.message-day-order-wrap .incoming-brief-columns'));
assert(!/position\s*:\s*(fixed|sticky)|scrollTop\s*=|overflow-y\s*:/.test(css),
 'visual layout may not own scroll or keyboard');
console.log('CHAT-416 casing, push, all preview surfaces and contextual reading: PASS');
