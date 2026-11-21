'use strict';
// CHAT-421: sparse B-left/A-right clocks. Text only; never alter timestamps.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('chatgpt-ab-conversation.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const core=require('../conversation-core.js');
const start=app.indexOf('function conversationClockModes(items){');
const end=app.indexOf('function mediaVisualSignature(',start);
assert(start>=0&&end>start,'production helper must sit after stable key');
const fn=vm.runInNewContext(app.slice(start,end)+'\nconversationClockModes;',{
 messageTimestampMs(m){
  const v=m?.createdAt||0;
  return typeof v==='number'?v:Date.parse(v)||0;
 },
 messageDateKey(ms){return core.vnCalendarDayKey(ms);},
 stableMessageDomKey(m){return (m.sender==='self'?'self':'remote')+':'+m.id;}
});
const make=(id,sender,hour,more={})=>({
 id,sender,kind:'text',createdAt:'2026-11-20T'+hour+':00+07:00',...more
});
const sequence=[
 make('a','remote','06:46'),
 make('b','remote','06:46'),
 make('c','remote','06:47'),
 make('d','remote','06:51'),
 make('e','remote','06:52'),
 make('f','self','06:57'),
 make('g','remote','06:57')
];
const result=fn(sequence);
const modes=sequence.map(x=>result.get((x.sender==='self'?'self':'remote')+':'+x.id));
assert.deepEqual(modes,['full','compact','compact','full','compact','full','full'],
 'first clock per 5-minute same-sender group, reset at sender change');
assert.equal(result.size,sequence.length);
const oneMore=make('h','remote','06:58');
assert.equal(fn([...sequence,oneMore]).get('remote:h'),'compact');
assert.equal(fn([...sequence,make('h','remote','07:03')]).get('remote:h'),'full',
 'no endless suppression over hours');
const crossing=[
 make('before','remote','23:59'),
 {...make('after','remote','00:01'),createdAt:'2026-11-21T00:01:00+07:00'}
];
assert.deepEqual([...fn(crossing).values()],['full','full'],
 'midnight in Vietnam must start a visible clock');
const special=[
 make('text1','remote','06:00'),
 make('media','remote','06:01',{media:{type:'image',assetId:'x'}}),
 make('text2','remote','06:02'),
 make('sent','self','06:04',{status:'sending'}),
 make('retry','self','06:05',{status:'failed'}),
 make('reply','self','06:06',{replyTo:{id:'abc'}}),
 make('normal','self','06:07'),
 make('unknown','self','06:08',{createdAt:0}),
 make('restored','self','06:09')
];
const specialModes=[...fn(special).values()];
assert.deepEqual(specialModes,
 ['full','full','compact','full','full','full','compact','full','full'],
 'media, failed, pending, replies and absent times remain explicit');
const dup=[make('a','remote','06:46'),make('b','remote','06:47')];
const first=fn(dup);
assert.equal(first.get('remote:b'),'compact');
assert.equal(dup[1].createdAt,'2026-11-20T06:47:00+07:00',
 'pure view helper cannot modify message timestamp or status');

// Virtualized windows must use whole store, not only the window slice.
assert(app.includes('const clockModes=conversationClockModes(store.items);'));
assert(app.includes("node.dataset.timeMode=clockMode;"));
assert(app.includes('dirty.add(node); // measured height updates without scrollTop writes'));
assert(!/syncMessageTimeNode\([^)]*,[^)]*,[^)]*\)/.test(app),
 'single canonical time metadata owner unchanged');
assert(css.includes('[data-time-mode="compact"]'));
assert(css.includes('clip-path:inset(50%)!important'));
assert(css.includes('padding-bottom:7px!important'));
assert(css.includes('.assistant-message-unit:not([data-shared-list="true"])'));
assert(css.includes('.user-message-unit:not([data-shared-list="true"])'));
assert(html.includes('data-build-source="chatgpt-ab-conversation.css"'));
assert(!/position\s*:\s*(?:fixed|sticky)|scrollTop\s*=/.test(css));
assert(app.includes("time.setAttribute('aria-label',timeMeaning+full+' · giờ Việt Nam')"),
 'every compact row still has accessible exact send time');
assert(app.includes("unit.title=clockMode==='compact'?(time?.title||''):''"),
 'individual time available on hover without an extra rendered timestamp');
console.log('CHAT-421 sparse chronological A/B times + Vietnam day + virtualization + safe metadata: PASS');
