const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=code.indexOf('function messageTimestampMs(');
const end=code.indexOf('\nfunction stableMessageDomKey(',start);
assert(start>=0&&end>start,'missing canonical message-day helpers');
const helperCode=code.slice(start,end);
const context={
  window:{ChatConversationCore:require('../conversation-core.js')},
  store:{
    items:[],
    indexOfId(id){return this.items.findIndex(item=>String(item.id)===String(id));}
  }
};
vm.createContext(context);
vm.runInContext(
  "function stableMessageDomKey(message){return (message?.sender==='self'?'self':'remote')+':'+String(message?.clientId||message?.id||'');}\n"+helperCode,
  context
);

const today=new Date(2026,9,18,12,0,0).getTime();
const yesterday=new Date(2026,9,17,12,0,0).getTime();
const older=new Date(2026,9,16,12,0,0).getTime();
const now=today;
assert.equal(context.messageTimestampMs({createdAt:today}),today);
assert.equal(context.messageTimestampMs({createdAt:Math.floor(today/1000)}),Math.floor(today/1000)*1000);
assert.equal(context.messageTimestampMs({created_at:new Date(today).toISOString()}),today);
assert.equal(context.formatMessageDayLabel(today,{now}),'Hôm nay');
assert.equal(context.formatMessageDayLabel(yesterday,{now}),'Hôm qua');
assert.equal(
  context.formatMessageDayLabel(today,{now,includeDate:true}),
  'Hôm nay · '+new Date(today).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
);
assert(context.formatMessageDayLabel(older,{now}).includes('16/10/2026'),'older dates include weekday and full date');

const messages=[
  {id:'older',sender:'remote',createdAt:older},
  {id:'yesterday',sender:'remote',createdAt:yesterday},
  {id:'today-first',sender:'self',createdAt:today},
  {id:'today-next',sender:'remote',createdAt:today+3600000}
];
context.store.items=messages;
assert(context.messageDaySeparatorLabel(messages[0],{now}).includes('16/10/2026'));
assert.equal(context.messageDaySeparatorLabel(messages[1],{now}),'Hôm qua');
assert.equal(context.messageDaySeparatorLabel(messages[2],{now}),'Hôm nay');
assert.equal(context.messageDaySeparatorLabel(messages[3],{now}),'','no repeated divider within the same local day');
// Vietnam calendar ownership: the same UTC day can contain two different
// local days, and both desktop Chat and iOS PWA must group them identically.
const beforeVietnamMidnight=Date.parse('2026-10-21T16:50:00Z'); // 23:50
const afterVietnamMidnight=Date.parse('2026-10-21T17:10:00Z');  // 00:10 next day
assert.equal(context.messageDateKey(beforeVietnamMidnight),'2026-10-21');
assert.equal(context.messageDateKey(afterVietnamMidnight),'2026-10-22');
const crossMidnight=[
  {id:'vn-before',sender:'remote',createdAt:beforeVietnamMidnight},
  {id:'vn-after',sender:'remote',createdAt:afterVietnamMidnight}
];
context.store.items=crossMidnight;
assert(context.messageDaySeparatorLabel(crossMidnight[0],{now:afterVietnamMidnight}));
assert(context.messageDaySeparatorLabel(crossMidnight[1],{now:afterVietnamMidnight}));

// A floating date must disappear whenever a real inline day separator is
// within the conversation viewport, even if it belongs to another day.
const begin=code.indexOf('function inlineDaySeparatorVisible(');
const finish=code.indexOf('function updateMessageDayFloating()',begin);
assert(begin>=0&&finish>begin,'single-owner inline/floating date policy missing');
let markers=[];
context.messageWindow={querySelectorAll:()=>markers};
vm.runInContext(code.slice(begin,finish),context);
markers=[{getBoundingClientRect:()=>({top:210,bottom:239})}];
assert.equal(context.inlineDaySeparatorVisible(180,800),true,
  'inline marker owns day label when it enters the viewport');
markers=[{getBoundingClientRect:()=>({top:20,bottom:48})}];
assert.equal(context.inlineDaySeparatorVisible(180,800),false,
  'floating marker is allowed once the inline separator has scrolled away');

console.log('UI-156 message day labels, Vietnam date boundaries, and duplicate suppression PASS');
