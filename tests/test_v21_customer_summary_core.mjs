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

const history=core.buildConversationHistory([
  {created_at:'2026-09-15T00:00:00Z',sender_role:'customer',body:'Có ensure rẻ k a'},
  {created_at:'2026-09-15T00:00:10Z',sender_role:'admin',body:'Lấy mấy thùng?'},
  {created_at:'2026-09-15T00:00:20Z',sender_role:'customer',body:'2 a'},
]);
assert.match(history,/KHACH.*Có ensure rẻ k a/s);
assert.match(history,/ADMIN_CONTEXT.*Lấy mấy thùng\?/s);
assert.match(history,/KHACH.*2 a/s);

const hints=core.customerSpecificHints({username:'ngocle',display_name:'E Ngọc tt'});
assert.match(hints,/thùng/i);
assert.match(hints,/1/);
assert.match(hints,/mỗi màu/i);

console.log('Customer summary core PASS');
