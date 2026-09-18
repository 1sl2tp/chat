import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const corePath=path.join(root,'supabase/functions/v21-customer-summary-scan/summary-core.mjs');
assert.equal(fs.existsSync(corePath),true,'customer summary core must exist');
const core=await import(pathToFileURL(corePath).href);

const parsed=core.normalizeSummaryPayload({
  items:[
    {name:'Bò',quantity:30,unit:'thùng',source:'text',raw_evidence:'30 thùng bò'},
    {name:'Sim 5L',quantity:'2',unit:'thùng',source:'text',raw_evidence:'2 thùng sim 5 lít'},
    {name:'Comfort xanh lá',quantity:null,unit:'thùng',source:'text',raw_evidence:'Thùng comfort xanh lá, xanh dương',ambiguous:true},
  ]
});
assert.deepEqual(parsed.items,[
  {name:'Bò',quantity:30,unit:'thùng',source:'text',rawEvidence:'30 thùng bò',ambiguous:false,inferred:false},
  {name:'Sim 5L',quantity:2,unit:'thùng',source:'text',rawEvidence:'2 thùng sim 5 lít',ambiguous:false,inferred:false},
  {name:'Comfort xanh lá',quantity:null,unit:'thùng',source:'text',rawEvidence:'Thùng comfort xanh lá, xanh dương',ambiguous:true,inferred:false},
]);
assert.equal(parsed.totalLines,3);
assert.deepEqual(parsed.totals,[{unit:'thùng',quantity:32}]);

// Regression: when a customer writes an explicit leading quantity and a bare number at the end,
// do not steal the trailing number from the product name and reinterpret it as quantity.
const preserved=core.normalizeSummaryPayload({
  items:[
    {name:'sim',quantity:2,unit:null,source:'text',raw_evidence:'1 sim 2',ambiguous:true},
    {name:'nép',quantity:2,unit:null,source:'text',raw_evidence:'1 nép 2',ambiguous:true},
    {name:'nép',quantity:1,unit:null,source:'text',raw_evidence:'1 nép 1',ambiguous:true},
    {name:'mezan',quantity:5,unit:null,source:'text',raw_evidence:'1 mezan 5',ambiguous:true},
    {name:'Bánh tipo',quantity:2,unit:'thùng',source:'text',raw_evidence:'lấy 2 thùng bánh tipo gói đánh nhầm bánh koro'},
  ]
});
assert.deepEqual(
  preserved.items.map(({name,quantity})=>({name,quantity})),
  [
    {name:'sim 2',quantity:1},
    {name:'nép 2',quantity:1},
    {name:'nép 1',quantity:1},
    {name:'mezan 5',quantity:1},
    {name:'bánh tipo gói',quantity:2},
  ],
  'summary must preserve product suffixes/codes and only remove explicit correction commentary'
);

// Regression: product-defining customer words must survive even if the model shortened
// both name and rawEvidence. Conversation fillers such as "nhé" must not become product names.
const differentiated=core.normalizeSummaryPayload({
  items:[
    {name:'mộc Châu',quantity:2,unit:'thùng',source:'text',raw_evidence:'2 thùng mộc Châu'},
    {name:'Ensure',quantity:2,unit:'thùng',source:'text+admin-context',raw_evidence:'Có ensure rẻ k a ... 2 a'},
    {name:'Gạo ichi',quantity:null,unit:null,source:'text',raw_evidence:'Gạo ichi',ambiguous:true},
    {name:'bò',quantity:5,unit:'thùng',source:'text',raw_evidence:'5 bò'},
    {name:'ngôi sao',quantity:2,unit:'thùng',source:'text',raw_evidence:'2 ngôi sao'},
  ]
},[
  {sender_role:'customer',body:'Hai thùng mì lô tô và 2 thùng mộc Châu bé nhé'},
  {sender_role:'customer',body:'Có ensure rẻ k a'},
  {sender_role:'admin',body:'Lấy mấy thùng?'},
  {sender_role:'customer',body:'2 a'},
  {sender_role:'customer',body:'Gạo ichi to nhỏ'},
  {sender_role:'customer',body:'5 bò to ít đường'},
  {sender_role:'customer',body:'2 ngôi sao xanh lá'},
]);
assert.deepEqual(
  differentiated.items.map(({name})=>name),
  ['mộc Châu bé','Ensure rẻ','Gạo ichi to nhỏ','bò to ít đường','ngôi sao xanh lá'],
  'summary must preserve size/price/sugar/color differentiators from customer-authored text'
);
assert.equal(differentiated.items[0].rawEvidence,'Hai thùng mì lô tô và 2 thùng mộc Châu bé nhé');
assert.equal(/nhé/i.test(differentiated.items[0].name),false,'conversation filler must not be appended to product name');


const sourceOrdered=core.normalizeSummaryPayload({
  items:[
    {name:'bột omo 5.1kg',quantity:2,source:'text',raw_evidence:'2 bột omo 5.1kg'},
    {name:'danisa 681',quantity:2,source:'text',raw_evidence:'2 danisa 681'},
    {name:'sài gòn đào',quantity:10,source:'text',raw_evidence:'10 sài gòn đào'},
  ]
},[
  {id:'old-order',created_at:'2026-09-16T00:00:00Z',sender_role:'customer',body:'2 bột omo 5.1kg'},
  {id:'admin-context',created_at:'2026-09-17T00:00:00Z',sender_role:'admin',body:'ok a'},
  {id:'latest-order',created_at:'2026-09-18T00:00:00Z',sender_role:'customer',body:'2 danisa 681\n10 sài gòn đào'},
]);
assert.equal(sourceOrdered.items[0].sourceMessageId,'old-order');
assert.equal(sourceOrdered.items[0].sourceMessageIndex,0);
assert.equal(sourceOrdered.items[1].sourceMessageId,'latest-order');
assert.equal(sourceOrdered.items[1].sourceMessageIndex,2);
assert.equal(sourceOrdered.items[2].sourceMessageId,'latest-order');
assert.equal(sourceOrdered.items[2].sourceMessageIndex,2);
assert.equal(sourceOrdered.items[1].sourceCreatedAt,'2026-09-18T00:00:00Z');

const history=core.buildConversationHistory([
  {created_at:'2026-09-15T00:00:00Z',sender_role:'customer',body:'Có ensure rẻ k a'},
  {created_at:'2026-09-15T00:00:10Z',sender_role:'admin',body:'Lấy mấy thùng?'},
  {created_at:'2026-09-15T00:00:20Z',sender_role:'customer',body:'2 a'},
]);
assert.match(history,/KHACH.*Có ensure rẻ k a/s);
assert.match(history,/ADMIN_CONTEXT.*Lấy mấy thùng\?/s);
assert.match(history,/KHACH.*2 a/s);
assert.match(core.MASTER_PROMPT,/Admin.*ghi chú|ghi chú.*Admin/i,'admin self-notes must be explicitly excluded from contextual inference');

const hints=core.customerSpecificHints({username:'ngocle',display_name:'E Ngọc tt'});
assert.match(hints,/thùng/i);
assert.match(hints,/1/);
assert.match(hints,/mỗi màu/i);

console.log('Customer summary core PASS');
