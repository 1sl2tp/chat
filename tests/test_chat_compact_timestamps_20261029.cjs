'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const shell=fs.readFileSync('shell.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const mobile=fs.readFileSync('mobile-ui-polish.css','utf8');

// A long group name must surrender width to the separate fixed time rail.
// Selecting, hovering, or keyboard focusing the row must never hide the time.
const styles=html.slice(html.indexOf('.shell-contact-copy{'),html.indexOf('.shell-profile-overlay{'));
assert(styles.includes('grid-template-columns:minmax(0,1fr) 52px'));
assert(styles.includes('.shell-contact-name{grid-column:1;grid-row:1;min-width:0;'));
assert(styles.includes('text-overflow:ellipsis'));
assert(styles.includes('.shell-contact-time{grid-column:2;grid-row:1;'));
assert(!/\.shell-contact-(?:row[^\n]* )?time[^\n]*opacity:0/.test(styles),
  'contact time may never disappear on active, hover, focus');
assert(styles.includes('top:auto;')&&styles.includes('bottom:3px;')&&styles.includes('transform:none;'),
  'manage control must move to the second row instead of the time');
assert(mobile.includes('grid-template-columns:minmax(0,1fr) 56px'),
  'mobile keeps an independent time column');

// Execute the exact directory formatter even if the browser's local TZ
// disagrees with the canonical Asia/Ho_Chi_Minh message-day owner.
const localStart=shell.indexOf('function formatContactTime(value,');
const localEnd=shell.indexOf('function contactPreview(',localStart);
assert(localStart>=0&&localEnd>localStart);
let report=null;
const context=vm.createContext({
  Date,Intl,bankReportContactView:()=>report
});
vm.runInContext(shell.slice(localStart,localEnd)+
  '\nglobalThis.fmt=formatContactTime;globalThis.setTime=setContactTimeNode;',context);
const sameDay='2026-10-28T18:40:00Z'; // 01:40 29 Oct in VN
const now='2026-10-28T20:10:00Z';     // 03:10 29 Oct in VN
assert.equal(context.fmt(sameDay,{now}), '01:40');
assert.equal(context.fmt('2026-10-28T16:30:00Z',{now}),'Hôm qua',
  '23:30 VN previous day is yesterday, even if browser timezone differs');
assert.equal(context.fmt('bad',{now}),'');
const attrs={};
const time={textContent:'',title:'',dateTime:'',
  setAttribute(name,value){attrs[name]=value;},
  removeAttribute(name){delete attrs[name];if(name==='datetime')this.dateTime='';}
};
context.setTime(time,{latest_at:sameDay});
assert.equal(time.textContent,'01:40');
assert(time.title.includes('29/10/2026'));
assert.equal(time.dateTime,sameDay);
assert(attrs['aria-label'].includes('Tin gần nhất'));
context.setTime(time,{latest_at:null});
assert.equal(time.textContent,'');
assert.equal(time.title,'');
report={instant:'2026-10-29T01:20:00Z',time:'Đã xem 29/10 08:20'};
context.setTime(time,{latest_at:'2026-10-19T00:00:00Z'});
assert.equal(time.textContent,'08:20','long report label is shown in full tooltip, not in narrow rail');
assert.equal(time.title,'Đã xem 29/10 08:20');

// The canonical message timestamp controls both compact text and media
// overlay. Unknown sent time must never be replaced by viewer opening time.
const stampStart=app.indexOf('function messageTimestampMs(message){');
const stampEnd=app.indexOf('function messageDateKey(timestamp){',stampStart);
assert(stampStart>=0&&stampEnd>stampStart);
const stampScope=vm.createContext({Date,Intl,document:{
  createElement(tag){assert.equal(tag,'time');return{
    className:'',dateTime:'',textContent:'',title:'',attrs:{},
    setAttribute(k,v){this.attrs[k]=v;},
    remove(){this.removed=true;}
  }}
}});
vm.runInContext(app.slice(stampStart,stampEnd)+
  '\nglobalThis.set=syncMessageTimeNode;globalThis.parse=messageTimestampMs;',stampScope);
let child=null;
const unit={
  querySelector(){return child;},
  appendChild(node){child=node;}
};
stampScope.set(unit,{createdAt:'2026-10-29T01:10:00Z'});
assert.equal(child.textContent,'08:10');
assert.equal(child.dateTime,'2026-10-29T01:10:00.000Z');
assert(child.title.includes('29/10/2026'));
const same=child;
stampScope.set(unit,{createdAt:'2026-10-29T01:12:00Z'});
assert.equal(child,same,'update same node, no duplicated metadata');
assert.equal(child.textContent,'08:12');
stampScope.set(unit,{});
assert.equal(child.removed,true,'unknown time is removed, not falsely rendered');
assert.equal(stampScope.parse({}),0);
assert(html.includes('.message-sent-time{')&&html.includes('font-size:12px'));
assert(app.includes('syncMessageTimeNode(unit,message);'));
assert.equal((app.match(/syncMessageTimeNode\(unit,message\);/g)||[]).length,2,
  'both initial render and message patch share one timestamp owner');
assert(!app.includes('createdAt:message?.createdAt||Date.now()'),
  'media cannot guess sent time from the viewer clock');
assert((app.match(/createdAt:messageTimestampMs\(message\)/g)||[]).length>=4);
console.log('CHAT long names, permanent time, VN timestamps, media truth and compact message metadata PASS');
