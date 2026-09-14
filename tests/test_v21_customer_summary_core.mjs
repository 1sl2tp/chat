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
    {name:'Bò',quantity:30,unit:'thùng'},
    {name:'Sim 5L',quantity:'2',unit:'thùng'},
    {name:'Mua 1kg',quantity:1,unit:null},
  ]
});
assert.deepEqual(parsed.items,[
  {name:'Bò',quantity:30,unit:'thùng',ambiguous:false},
  {name:'Sim 5L',quantity:2,unit:'thùng',ambiguous:false},
  {name:'Mua 1kg',quantity:1,unit:null,ambiguous:false},
]);
assert.equal(parsed.totalLines,3);
assert.deepEqual(parsed.totals,[
  {unit:'thùng',quantity:32},
  {unit:null,quantity:1},
]);

const text=core.buildCustomerHistoryText([
  {created_at:'2026-09-15T00:00:00Z',body:'2 sim 1l'},
  {created_at:'2026-09-15T00:01:00Z',body:'bỏ 1 sim 1l'},
]);
assert.match(text,/TIN 1/);
assert.match(text,/2 sim 1l/);
assert.match(text,/TIN 2/);
assert.match(text,/bỏ 1 sim 1l/);
assert.doesNotMatch(text,/ADMIN/i);

console.log('Customer summary core PASS');
