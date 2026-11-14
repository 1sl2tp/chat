import assert from 'node:assert/strict';
import {reconcileInvoice} from '../supabase/functions/v21-ncc-ai-room/invoice-reconciliation.mjs';
const row=(price,quantity=1)=>({printed_name:'Mat hang',quantity,unit_price_vnd:price});
const r=reconcileInvoice({subtotal_vnd:100000,discount_amount_vnd:10000,total_payable_vnd:90000},[row(60000),row(40000)]);
assert.equal(r.summary.status,'verified');
assert.deepEqual(r.lines.map(x=>x.discount_line_vnd),[6000,4000]);
assert.equal(r.lines[0].net_unit_vnd,54000);
const p=reconcileInvoice({subtotal_vnd:300,discount_amount_vnd:1,total_payable_vnd:299},[row(100),row(100),row(100)]);
assert.deepEqual(p.lines.map(x=>x.discount_line_vnd),[1,0,0]);
assert.equal(p.lines.reduce((s,x)=>s+x.net_line_vnd,0),299);
const ten=reconcileInvoice({subtotal_vnd:100000,discount_percent:10,total_payable_vnd:90000},[row(20000,5)]);
assert.equal(ten.summary.discount_total_vnd,10000);
assert.equal(ten.summary.discount_source,'percent_estimate');
assert.equal(ten.lines[0].net_unit_vnd,18000);
assert.equal(ten.lines[0].discount_per_unit_vnd,2000);
const fees=reconcileInvoice({discount_amount_vnd:1000,shipping_fee_vnd:500,tax_vnd:100,total_payable_vnd:9600},[row(10000)]);
assert.equal(fees.summary.payable_calculated_vnd,9600);
const missing=reconcileInvoice({printed_total_vnd:90000,discount_amount_vnd:10000},[row(null,3),row(null,2)]);
assert.equal(missing.summary.status,'insufficient');
assert.equal(missing.summary.gross_lines_vnd,null);
assert(missing.lines.every(x=>x.net_unit_vnd===null));
const over=reconcileInvoice({subtotal_vnd:100,discount_amount_vnd:200,total_payable_vnd:0},[row(100)]);
assert.equal(over.summary.discount_total_vnd,null);
assert.equal(over.summary.status,'insufficient');
const disagree=reconcileInvoice({subtotal_vnd:30000,discount_amount_vnd:3000,total_payable_vnd:29000},[row(30000)]);
assert.equal(disagree.summary.status,'mismatch');
assert.equal(disagree.summary.difference_vnd,-2000);
const mismatch=reconcileInvoice({subtotal_vnd:10000,discount_amount_vnd:1000,total_payable_vnd:9000},
 [{quantity:2,unit_price_vnd:5000,line_total_vnd:9000}]);
assert.equal(mismatch.lines[0].row_warnings.length,1);
const fractions=reconcileInvoice({subtotal_vnd:300,discount_amount_vnd:1,total_payable_vnd:299},
 [{quantity:3,unit_price_vnd:100}]);
assert.equal(fractions.lines[0].discount_per_unit_vnd,.33);
const big=reconcileInvoice({subtotal_vnd:80000000000,discount_amount_vnd:12000000001,total_payable_vnd:67999999999},
 [row(50000000000),row(30000000000)]);
assert.equal(big.lines.reduce((n,x)=>n+x.discount_line_vnd,0),12000000001);
const inconsistent=reconcileInvoice({subtotal_vnd:1000,discount_amount_vnd:100,discount_percent:50,total_payable_vnd:900},[row(1000)]);
assert(inconsistent.summary.warnings.some(x=>x.includes('tỷ lệ')));
const absent=reconcileInvoice({total_payable_vnd:1000},[row(1000)]);
assert.equal(absent.summary.discount_total_vnd,null);
assert.equal(absent.summary.status,'insufficient');
const alreadyNet=reconcileInvoice({subtotal_vnd:100000,discount_amount_vnd:10000,total_payable_vnd:90000},
 [row(50000),row(40000)]);
assert.equal(alreadyNet.summary.line_totals_may_be_post_discount,true);
assert.equal(alreadyNet.summary.payable_calculated_vnd,null);
assert(alreadyNet.lines.every(x=>x.discount_line_vnd===null));
const outlier=reconcileInvoice({subtotal_vnd:172000,discount_amount_vnd:0,total_payable_vnd:172000},
 [{printed_name:'Milo to thuong',quantity:172,unit_price_vnd:1000}]);
assert(outlier.summary.warnings.some(x=>x.includes('số lượng lớn')));
console.log('NCC-009 discount math PASS');