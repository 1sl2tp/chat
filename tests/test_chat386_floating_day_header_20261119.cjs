'use strict';
// CHAT-386: reproduce the screenshot regression without reading private chats.
// The floating date pill must never cover text while the Header height is 0.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
new vm.Script(src);
const get=(begin,end)=>{
 const a=src.indexOf(begin),b=src.indexOf(end,a);
 assert(a>=0&&b>a,'source owner intact: '+begin);
 return src.slice(a,b);
};
const reducer=get('function setAdaptiveHeaderMode(','\nfunction resetAdaptiveHeaderForContext()');
const float=get('function updateMessageDayFloating(){','\nfunction scheduleMessageDayFloatingUpdate()');
const traces={hide:0,updates:0,anchors:0};
const sandbox={
 appShell:{dataset:{}}, viewport:{mode:'USER_AWAY'},
 scrollRoot:{scrollTop:230,scrollHeight:1700,clientHeight:600},
 adaptiveHeaderEligible:()=>true,
 firstVisibleAnchor:()=>({id:'sample-msg'}),restoreAnchor:()=>{traces.anchors++},
 distanceFromTail:()=>420,setScrollTop:()=>{},
 hideMessageDayFloating:({immediate})=>{assert.equal(immediate,true);traces.hide++},
 scheduleMessageDayFloatingUpdate:()=>{traces.updates++}
};
vm.runInNewContext(
 "const ADAPTIVE_HEADER_MODES={NORMAL:'normal',READING:'reading',TYPING:'typing'};\n"+
 "const VIEWPORT_STATES={USER_AWAY:'USER_AWAY',FOLLOW_TAIL:'FOLLOW_TAIL'};\n"+
 "let adaptiveHeaderMode='normal',adaptiveHeaderPeek=false;\n"+
 reducer+"\n"+float+
 "\nthis.change=setAdaptiveHeaderMode; this.float=updateMessageDayFloating;",
 sandbox
);
assert.equal(sandbox.change('reading'),true);
assert.equal(sandbox.appShell.dataset.chatHeaderMode,'reading');
assert.equal(traces.hide,1,'hide day chip synchronously, not one frame later');
assert.equal(traces.anchors,1,'existing viewport anchor remains sole writer');
assert.equal(traces.updates,0,'reading state must not re-open day chip');
assert.equal(sandbox.float(),false,'day chip update refuses zero-height header');
assert.equal(traces.hide,2,'repeated scroll keeps chip hidden and aria state closed');
assert.equal(sandbox.change('reading',{peek:true}),true);
assert.equal(traces.hide,3,'floating day stays hidden even when header peeks');
assert.equal(traces.updates,0);
assert.equal(sandbox.change('normal'),true);
assert.equal(sandbox.appShell.dataset.chatHeaderMode,'normal');
assert.equal(traces.updates,1,'normal state restores existing day-chip owner');
assert.equal(traces.anchors,2,'reading-to-normal preserves visible message');
assert.match(css,/#appShell\[data-auth-state="authenticated"\]\[data-route="chat"\]\[data-chat-header-mode="reading"\] #messageDayFloating\{\s*display:none!important;/);
assert.match(html,/id="messageDayFloating"/);
assert.match(html,/class="message-day-floating-label"/);
assert.match(html,/message-day-separator/);
assert.match(css,/--header-height:0px/);
assert.match(css,/--header-height:44px/);
assert.match(css,/--header-height:48px/);
console.log('CHAT-386: no date/message overlap while reading, restoring on exit PASS');
