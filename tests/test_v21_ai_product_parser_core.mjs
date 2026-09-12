import assert from 'node:assert/strict';
import {
  splitCustomerSegments,
  parseCustomerText,
  parseCustomerTextDetailed,
} from '../supabase/functions/v21-ai-product-parser/parser-core.mjs';

function lines(text){
  return parseCustomerText(text).map(row=>row.line);
}

assert.deepEqual(splitCustomerSegments('1 cung,1 mem'),['1 cung','1 mem']);
assert.deepEqual(splitCustomerSegments('1,5 sim'),['1,5 sim']);
assert.deepEqual(splitCustomerSegments('1 sim / 2 mem;3 det\n4 cung'),['1 sim','2 mem','3 det','4 cung']);

assert.deepEqual(lines('2 thùng sim'),['2 Sim']);
assert.deepEqual(lines('2 th sim'),['2 Sim']);
assert.deepEqual(lines('2t sim'),['2 Sim']);
assert.deepEqual(lines('sim 2 th'),['2 Sim']);
assert.deepEqual(lines('sim 1 2'),['2 Sim 1']);
assert.deepEqual(lines('sim den 1 3'),['3 Sim den 1']);
assert.deepEqual(lines('2 sim 1'),['2 Sim 1']);

assert.deepEqual(lines('333 lon 2'),['2 333 lon']);
assert.deepEqual(lines('1664 blanc 2'),['2 1664 blanc']);
assert.deepEqual(lines('584 nha trang 2'),['2 584 nha trang']);
assert.deepEqual(lines('3 cô gái 2'),['2 3 cô gái']);
assert.deepEqual(lines('7days 2'),['2 7days']);
assert.deepEqual(lines('2 chew 3'),['3 2 chew']);
assert.deepEqual(lines('555 det 2'),['2 555 det']);
assert.deepEqual(lines('3 miền 2'),['2 3 miền']);
assert.deepEqual(lines('7 up 2'),['2 7 up']);

assert.deepEqual(lines('555 det'),[]);
assert.deepEqual(lines('3 mien'),[]);
assert.deepEqual(lines('7 up'),[]);
assert.deepEqual(lines('cung 1 det 1'),[]);
assert.deepEqual(lines('cung 1 det 1 mem 1'),[]);

assert.deepEqual(lines('sim: 1 den, 2 xanh'),[]);
assert.deepEqual(lines('cung = cung, 2 sim'),[]);
assert.deepEqual(lines('cung, 2 sim'),[]);
assert.deepEqual(lines('2 sim / mem'),[]);

assert.deepEqual(
  parseCustomerTextDetailed('5 dẹt'),
  {lines:[{quantity:5,productName:'Dẹt',line:'5 Dẹt'}],confirmations:[]},
);
assert.deepEqual(
  parseCustomerTextDetailed('1 cứng'),
  {lines:[{quantity:1,productName:'Cứng',line:'1 Cứng'}],confirmations:[]},
  'parser only splits SL + raw name; it must not ask tobacco/business questions',
);

console.log('chat input-only SL + name parser contract PASS');
