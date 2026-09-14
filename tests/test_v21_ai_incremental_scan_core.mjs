import assert from 'node:assert/strict';
import {
  sortSourcesBySequence,
  sourcesAfterCursor,
  buildScanSourceText,
} from '../supabase/functions/v21-order-scan/scan-core.mjs';

const rows=[
  {sourceSeq:12,messageId:'m12',text:'2 sc nep cam',createdAt:'2026-09-15T00:00:01Z'},
  {sourceSeq:10,messageId:'m10',text:'2 sua chua chan chau duong den',createdAt:'2026-09-15T00:00:03Z'},
  {sourceSeq:11,messageId:'m11',text:'3 ko duong bich',createdAt:'2026-09-14T23:59:59Z'},
];

assert.deepEqual(
  sortSourcesBySequence(rows).map(row=>row.sourceSeq),
  [10,11,12],
  'source ordering must follow stable source_seq, never timestamp ordering',
);

assert.deepEqual(
  sourcesAfterCursor(rows,10).map(row=>row.sourceSeq),
  [11,12],
  'cursor must exclude every already processed source sequence',
);

assert.equal(
  buildScanSourceText(sourcesAfterCursor(rows,10)),
  '3 ko duong bich\n\n2 sc nep cam',
  'scan input must contain only new messages in source sequence and preserve literal text without metadata numbers',
);

console.log('incremental AI scan core contract PASS');
