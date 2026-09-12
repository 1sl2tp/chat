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
assert.deepEqual(lines('3 ko đường'),['3 Không đường'],'part 1 normalizes the standalone shorthand ko -> không before catalog search');
assert.deepEqual(lines('2 bịch không'),['2 Bịch không'],'bịch is a product-form key and must survive part 1 for prioritized catalog search');
assert.deepEqual(lines('2 bich khong'),['2 Bich khong'],'unaccented bich is also preserved as a product-form key');

assert.deepEqual(lines('333 lon 2'),['2 333 lon']);
assert.deepEqual(lines('1664 blanc 2'),['2 1664 blanc']);
assert.deepEqual(lines('584 nha trang 2'),['2 584 nha trang']);
assert.deepEqual(lines('3 cô gái 2'),['2 3 cô gái']);
assert.deepEqual(lines('7days 2'),['2 7days']);
assert.deepEqual(lines('2 chew 3'),['3 2 chew']);
assert.deepEqual(lines('555 det 2'),['2 555 det']);
assert.deepEqual(lines('3 miền 2'),['2 3 miền']);
assert.deepEqual(lines('7 up 2'),['2 7 up']);
assert.deepEqual(lines('9 hat 2'),['2 9 hat'],'9 hat is a protected numeric-leading catalog phrase; the trailing 2 is quantity');

assert.deepEqual(lines('555 det'),[]);
assert.deepEqual(lines('3 mien'),[]);
assert.deepEqual(lines('7 up'),[]);
assert.deepEqual(lines('cung 1 det 1'),[]);
assert.deepEqual(lines('cung 1 det 1 mem 1'),[]);

assert.deepEqual(
  lines('sim: 1 den, 2 xanh'),
  ['1 Sim den','2 Sim xanh'],
  'colon is shared-parent syntax inside part 1, not a reason to drop the whole message',
);
assert.deepEqual(lines('cung = cung, 2 sim'),[]);
assert.deepEqual(lines('cung, 2 sim'),[]);
assert.deepEqual(lines('2 sim / mem'),[]);

assert.deepEqual(
  lines('3 chua có đường\n3 ít đường\n3 nha đam có\n3 ko đường\nprobi to : 3 có đường, 2 ít, 2 vq\nProbi bé : 3 có, 2 dưa'),
  [
    '3 Chua có đường',
    '3 Ít đường',
    '3 Nha đam có',
    '3 Không đường',
    '3 Probi to có đường',
    '2 Probi to ít',
    '2 Probi to vq',
    '3 Probi bé có',
    '2 Probi bé dưa',
  ],
  'one multi-line customer message must be fully split and normalized before catalog search runs',
);

assert.deepEqual(
  lines('Ok anh\nT2 cho em 2t chân gà 1 cửu ca\n2t chân đôi ana\n4t kẹo 3viên\nKẹo bigbag 120g 3t\nHương dương mỹ vị 1ba0\nMít sấy hoà phát 1t\n2t bánh pò bịch\n1t 3ngăn'),
  [
    '2 Chân gà',
    '1 Cửu ca',
    '2 Chân đôi ana',
    '4 Kẹo 3viên',
    '3 Kẹo bigbag 120g',
    '1 Hương dương mỹ vị',
    '1 Mít sấy hoà phát',
    '2 Bánh pò bịch',
    '1 3ngăn',
  ],
  'normal order clusters must survive a greeting and a short order preface, including two items on one line',
);

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
