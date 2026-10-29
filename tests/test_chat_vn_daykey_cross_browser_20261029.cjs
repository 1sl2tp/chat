'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const coreSource=fs.readFileSync('conversation-core.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');

// Emulate browsers/locales where Intl.format() does NOT use YYYY-MM-DD.
// formatToParts still provides semantic year/month/day with stable labels.
let formatCalls=0,partCalls=0;
class HostileIntlFormatter {
  constructor(locale,options){this.inner=new Intl.DateTimeFormat(locale,options);}
  format(){formatCalls++;return '10/29/2026';}
  formatToParts(value){partCalls++;return this.inner.formatToParts(value);}
}
const fake={Intl:{DateTimeFormat:HostileIntlFormatter},Date,bankReportContactView:()=>null};
const ctx=vm.createContext(fake);
ctx.window=ctx;
vm.runInContext(coreSource,ctx);
assert(ctx.ChatConversationCore?.vnCalendarDayKey,'shared VN calendar primitive is exported');
const key=ctx.ChatConversationCore.vnCalendarDayKey;
assert.equal(key('2026-10-28T16:59:00Z'),'2026-10-28'); // 23:59 VN
assert.equal(key('2026-10-28T17:00:00Z'),'2026-10-29'); // 00:00 VN
assert.equal(key('2026-12-31T16:59:00Z'),'2026-12-31');
assert.equal(key('2026-12-31T17:00:00Z'),'2027-01-01');
assert.equal(key('2028-02-28T17:01:00Z'),'2028-02-29');
for(const v of [null,undefined,'',0,'bad date',NaN])assert.equal(key(v),'');
assert.equal(formatCalls,0,'calendar primitive must never parse locale-specific format() text');
assert(partCalls>=5,'calendar primitive reads year/month/day typed parts');

// Run actual production projections using the same core owner.
function block(source,from,to){
  const i=source.indexOf(from),j=source.indexOf(to,i+from.length);
  assert(i>=0&&j>i,'production owner block '+from);
  return source.slice(i,j);
}
vm.runInContext(
 block(shell,'function formatContactTime(value,','function contactPreview(')+
 '\nglobalThis.sidebarTime=formatContactTime;',ctx);
vm.runInContext(
 block(app,'function messageDateKey(timestamp){','function messageDaySeparatorLabel(')+
 '\nglobalThis.messageDay=messageDateKey;globalThis.messageLabel=formatMessageDayLabel;',ctx);
const today='2026-10-28T17:01:00Z';
const previous='2026-10-28T16:59:00Z';
const now='2026-10-28T18:30:00Z';
assert.equal(ctx.sidebarTime(today,{now}),'00:01');
assert.equal(ctx.sidebarTime(previous,{now}),'Hôm qua');
assert.equal(ctx.messageDay(Date.parse(today)),key(today));
assert.equal(ctx.messageDay(Date.parse(previous)),key(previous));
assert.equal(ctx.messageLabel(Date.parse(today),{now:new Date(now)}),'Hôm nay');
assert.equal(ctx.messageLabel(Date.parse(previous),{now:new Date(now)}),'Hôm qua');
assert.equal(ctx.messageDay(0),'');
assert.equal(ctx.messageDay(Date.parse('invalid')),'');
assert.equal(ctx.sidebarTime('invalid',{now}),'');
assert.equal(formatCalls,0,'neither app nor sidebar relies on Intl.format() date order');
assert(app.includes('return window.ChatConversationCore.vnCalendarDayKey(stamp);'));
assert(shell.includes('window.ChatConversationCore.vnCalendarDayKey(value)'));
assert(!shell.includes("new Intl.DateTimeFormat('en-CA'"));
assert(!app.includes("new Intl.DateTimeFormat('en-CA'"));
console.log('CHAT canonical VN day owner: hostile Intl locale, Safari-style order, cross-layer date parity PASS');
