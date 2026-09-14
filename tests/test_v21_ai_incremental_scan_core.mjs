import assert from 'node:assert/strict';
import {
  selectContiguousBatch,
  buildSourceEnvelope,
  materializeScanLines,
} from '../supabase/functions/v21-order-auto-scan/scan-core.mjs';

const messages=[
  {id:'m10',messageSeq:10,body:'Nhe',imageCount:0},
  {id:'m11',messageSeq:11,body:'2 sua chua\n3 ko duong bich',imageCount:0},
  {id:'m12',messageSeq:12,body:'',imageCount:2},
  {id:'m13',messageSeq:13,body:'5 xx pori',imageCount:0},
];

assert.deepEqual(
  selectContiguousBatch(messages,{maxMessages:3,maxChars:200,maxImages:2}).map(row=>row.messageSeq),
  [10,11,12],
  'batch must be a contiguous source prefix and never reorder messages',
);

const envelope=buildSourceEnvelope(messages.slice(0,2));
assert.ok(envelope.includes('[MSG_SEQ=10;MSG_ID=m10]'));
assert.ok(envelope.includes('[MSG_SEQ=11;MSG_ID=m11]'));
assert.ok(envelope.indexOf('MSG_SEQ=10')<envelope.indexOf('MSG_SEQ=11'));
assert.ok(envelope.includes('3 ko duong bich'));

const rows=materializeScanLines([
  {sourceMessageSeq:11,sourceLineNo:2,quantity:3,name:'ko duong bich',rawText:'3 ko đường bịch'},
  {sourceMessageSeq:11,sourceLineNo:1,quantity:2,name:'sua chua',rawText:'2 sữa chua'},
  {sourceMessageSeq:13,sourceLineNo:1,quantity:5,name:'xx pori',rawText:'5 xx pori'},
],new Map([
  [11,{id:'m11',messageSeq:11}],
  [13,{id:'m13',messageSeq:13}],
]));

assert.deepEqual(rows.map(row=>[row.source_message_seq,row.source_line_no,row.quantity,row.name]),[
  [11,1,2,'sua chua'],
  [11,2,3,'ko duong bich'],
  [13,1,5,'xx pori'],
]);
assert.equal(rows[1].source_message_id,'m11');
assert.equal(rows[1].raw_text,'3 ko đường bịch');

assert.throws(()=>materializeScanLines([
  {sourceMessageSeq:99,sourceLineNo:1,quantity:1,name:'x',rawText:'1 x'},
],new Map([[11,{id:'m11',messageSeq:11}]])),/scan_source_invalid/);

console.log('incremental AI scan core contract PASS');
