import assert from 'node:assert/strict';
import { splitCustomerSegments, parseCustomerText } from '../supabase/functions/v21-ai-product-parser/parser-core.mjs';

{
  assert.deepEqual(
    splitCustomerSegments('T2 cho em 2t chân gà 1 cửu ca'),
    ['T2 cho em 2t chân gà 1 cửu ca'],
    'a later number without a real separator must remain inside the same product name segment',
  );
}

{
  assert.deepEqual(
    parseCustomerText('T2 cho em 2t chân gà 1 cửu ca'),
    [{quantity:2,productName:'Chân gà 1 cửu ca',line:'2 Chân gà 1 cửu ca'}],
  );
}

{
  assert.deepEqual(
    parseCustomerText('2 bịch hướng dương\n- 2 bát 1.8kg, 2 bát 1kg, 2 bát 454\n5 có / 5 ko / 5 nha đam / 3 ít'),
    [
      {quantity:2,productName:'Hướng dương',line:'2 Hướng dương'},
      {quantity:2,productName:'Bát 1.8kg',line:'2 Bát 1.8kg'},
      {quantity:2,productName:'Bát 1kg',line:'2 Bát 1kg'},
      {quantity:2,productName:'Bát 454',line:'2 Bát 454'},
      {quantity:5,productName:'Có',line:'5 Có'},
      {quantity:5,productName:'Ko',line:'5 Ko'},
      {quantity:5,productName:'Nha đam',line:'5 Nha đam'},
      {quantity:3,productName:'Ít',line:'3 Ít'},
    ],
  );
}

{
  assert.deepEqual(
    parseCustomerText('2t chân đôi ana\n4t kẹo 3viên\nKẹo bigbag 120g 3t\nHương dương mỹ vị 1ba0\nMít sấy hoà phát 1t\n2t bánh pò bịch\n1t 3ngăn'),
    [
      {quantity:2,productName:'Chân đôi ana',line:'2 Chân đôi ana'},
      {quantity:4,productName:'Kẹo 3viên',line:'4 Kẹo 3viên'},
      {quantity:3,productName:'Kẹo bigbag 120g',line:'3 Kẹo bigbag 120g'},
      {quantity:1,productName:'Hương dương mỹ vị',line:'1 Hương dương mỹ vị'},
      {quantity:1,productName:'Mít sấy hoà phát',line:'1 Mít sấy hoà phát'},
      {quantity:2,productName:'Bánh pò bịch',line:'2 Bánh pò bịch'},
      {quantity:1,productName:'3ngăn',line:'1 3ngăn'},
    ],
  );
}

{
  assert.deepEqual(
    parseCustomerText('Thế cho c 2 sữa chua chân châu đường đen\n3 ko đường bịch\n2 sc nếp cẩm\n5 vnm ít đường bé\n5 milo to 180 có dg\nNhé'),
    [
      {quantity:2,productName:'Sữa chua chân châu đường đen',line:'2 Sữa chua chân châu đường đen'},
      {quantity:3,productName:'Ko đường bịch',line:'3 Ko đường bịch'},
      {quantity:2,productName:'Sc nếp cẩm',line:'2 Sc nếp cẩm'},
      {quantity:5,productName:'Vnm ít đường bé',line:'5 Vnm ít đường bé'},
      {quantity:5,productName:'Milo to 180 có dg',line:'5 Milo to 180 có dg'},
    ],
  );
}

{
  assert.deepEqual(
    parseCustomerText('Probi to : 4 có, 2 ít, 2 việt quất'),
    [
      {quantity:4,productName:'Probi to có',line:'4 Probi to có'},
      {quantity:2,productName:'Probi to ít',line:'2 Probi to ít'},
      {quantity:2,productName:'Probi to việt quất',line:'2 Probi to việt quất'},
    ],
    'text before colon is a shared input prefix for comma-separated children',
  );
}

{
  assert.deepEqual(
    parseCustomerText('Sữa chua: 5 có / 5 ko / 3 ít'),
    [
      {quantity:5,productName:'Sữa chua có',line:'5 Sữa chua có'},
      {quantity:5,productName:'Sữa chua ko',line:'5 Sữa chua ko'},
      {quantity:3,productName:'Sữa chua ít',line:'3 Sữa chua ít'},
    ],
  );
}

console.log('local SL + name parser contract PASS');
