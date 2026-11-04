'use strict';
// CHAT-VN-SENDER-20261105: last activity is ordered by canonical instant,
// the preview identifies own sends, and civil days use UTC+7 on any device.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../conversation-core.js');
const engine=fs.readFileSync('v21-sync-engine.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261105062000_chat_sidebar_sender_preview_vn.sql','utf8');
assert(sql.includes("when m.sender_account_id=v_me then 'Bạn: '"));
assert(sql.includes('coalesce(coalesce(ma.created_at,m.created_at),a.created_at) desc'));
assert(sql.includes('SECURITY DEFINER'));
assert(!/\b(?:insert|update|delete)\s+(?:into|public\.)/i.test(sql),'read-only RPC');
assert.equal(core.vnCalendarDayKey('2026-11-04T16:59:59Z'),'2026-11-04');
assert.equal(core.vnCalendarDayKey('2026-11-04T17:00:00Z'),'2026-11-05');
const eBegin=engine.indexOf('function mediaPreviewLabel(');
const eEnd=engine.indexOf('function migrateLegacyCachedMediaBody(',eBegin);
assert(eBegin>=0&&eEnd>eBegin);
const getPreview=vm.runInNewContext(engine.slice(eBegin,eEnd)+'\nmessagePreviewContract;',{
 accountId:'admin',String,Array
});
const own={sender_account_id:'admin',body:'alo ông'};
const remote={sender_account_id:'friend',body:'alo ông'};
assert.equal(getPreview(own).preview_text,'Bạn: alo ông');
assert.equal(getPreview(remote).preview_text,'alo ông');
assert.equal(getPreview({...own,body:'',_media_assets:[{kind:'image'}]}).preview_text,'Bạn: Ảnh');
assert.equal(getPreview({...remote,body:'',_media_assets:[{kind:'image'}]}).preview_text,'Ảnh');
const pBegin=shell.indexOf('function contactPreview(');
const pEnd=shell.indexOf('function syncContactActiveState(',pBegin);
const preview=vm.runInNewContext(shell.slice(pBegin,pEnd)+'\ncontactPreview;',{
 bankReportContactView:()=>null,
 compactPreview:x=>String(x||'').replace(/\s+/g,' ').trim()
});
assert.equal(preview({preview_kind:'image',preview_text:'Bạn: Ảnh'}),'Bạn: Ảnh');
assert.equal(preview({preview_kind:'image',preview_text:'Ảnh'}),'Ảnh');
assert.equal(preview({preview_kind:'text',preview_text:'Bạn: alo ông'}),'Bạn: alo ông');
assert.equal(preview({preview_kind:'text',preview_text:'alo ông'}),'alo ông');
const tBegin=shell.indexOf('function formatContactTime(value,');
const tEnd=shell.indexOf('function contactPreview(',tBegin);
const fmt=vm.runInNewContext(shell.slice(tBegin,tEnd)+'\nformatContactTime;',{
 Date,Intl,window:{ChatConversationCore:core},bankReportContactView:()=>null
});
const now='2026-11-04T23:26:00Z'; // 05 Nov, 06:26 Vietnam
assert.equal(fmt('2026-11-04T23:26:00Z',{now}),'06:26');
assert.equal(fmt('2026-11-04T15:09:31Z',{now}),'Hôm qua');
assert.equal(fmt('2026-11-04T16:59:59Z',{now}),'Hôm qua');
assert.equal(fmt('2026-11-04T17:00:00Z',{now}),'00:00');
const dBegin=app.indexOf('function messageDateKey(timestamp){');
const dEnd=app.indexOf('function messageDaySeparatorLabel(',dBegin);
const d=vm.runInNewContext(app.slice(dBegin,dEnd)+'\n({messageDateKey,formatMessageDayLabel});',{
 Date,Intl,window:{ChatConversationCore:core}
});
assert.equal(d.messageDateKey('2026-11-04T23:26:00Z'),'2026-11-05');
assert.equal(d.formatMessageDayLabel(Date.parse('2026-11-04T15:09:31Z'),{now:new Date(now)}),'Hôm qua');
assert.equal(d.formatMessageDayLabel(Date.parse('2026-11-04T23:26:00Z'),{now:new Date(now)}),'Hôm nay');
assert(shell.includes("timeZone:'Asia/Ho_Chi_Minh'"));
assert(app.includes("timeZone:'Asia/Ho_Chi_Minh'"));
assert(shell.includes('giờ Việt Nam')&&app.includes('giờ Việt Nam'));
assert(engine.includes("preview_text:(String(mediaRow.owner_account_id||'')===context.accountId?'Bạn: ':'')"));
assert(engine.includes("const ownMedia=String(parent?.sender_account_id||payload.owner_account_id||'')===context.accountId"));
console.log('CHAT last-sender preview + exact UTC timestamps / Vietnam calendar PASS');
