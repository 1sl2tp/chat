'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {estimateMessageHeight,DataWindowModel}=require('../conversation-core.js');
const html=fs.readFileSync('index.source.html','utf8');
const core=fs.readFileSync('conversation-core.js','utf8');
const css=html.slice(html.indexOf('.message-sent-time{'),html.indexOf('}',html.indexOf('.message-sent-time{'))+1);
assert(css.includes('line-height:14px;'));
assert(css.includes('margin-top:3px;'));
const blockHeight=14+3;
assert.equal(blockHeight,17);
assert(core.includes('sentTimeHeight=Number.isFinite(sentTime)&&sentTime>0?17:0'),
  'virtual estimate must match the single real metadata block geometry');

const kinds=[
  {text:'hello'},
  {text:'image',media:{type:'image',width:840,height:600}},
  {text:'two files',media:{type:'gallery',items:[{},{}]}},
  {text:'document',media:{type:'file',kind:'file'}},
  {text:'audio',media:{type:'audio'}},
  {text:'voice file',media:{type:'file',kind:'audio'}}
];
for(const item of kinds){
  const unknown=estimateMessageHeight({...item,createdAt:0},350);
  const known=estimateMessageHeight({...item,createdAt:Date.parse('2026-10-29T01:00:00Z')},350);
  assert.equal(known-unknown,blockHeight,'metadata added exactly once for '+JSON.stringify(item.media||item.text));
  assert.equal(estimateMessageHeight({...item,createdAt:'invalid'},350),unknown);
  assert.equal(estimateMessageHeight({...item,created_at:'2026-10-29T01:00:00Z'},350),known);
  assert.equal(estimateMessageHeight({...item,createdAt:undefined},350),unknown);
}
const count=180;
const olderUnknown=Array.from({length:count},(_,i)=>({id:'m'+i,text:'A short message',createdAt:0}));
const olderKnown=olderUnknown.map((m,i)=>({...m,createdAt:Date.parse('2026-10-28T19:00:00Z')+i*1000}));
const view=new DataWindowModel({maxDomMessages:40});
const baseline=view.estimateSpacer(olderUnknown,0,120,350,new Map());
const updated=view.estimateSpacer(olderKnown,0,120,350,new Map());
assert.equal(updated-baseline,120*blockHeight,
  'offscreen 120-row spacer must account for every sent-time node');
const cache=new Map([['m0',88]]);
const cached=view.estimateSpacer(olderKnown,0,120,350,cache);
assert.equal(cached,updated-estimateMessageHeight(olderKnown[0],350)+88,
  'actual measured row remains the sole height-cache authority');
assert.equal(view.indexAtOffset(olderKnown,0,350,new Map()),0);
console.log('CHAT virtual spacer accounts for one true sent-time block, unknown time and cache precedence PASS');
