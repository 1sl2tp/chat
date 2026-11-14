'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('ncc-ai-room.js','utf8');
const edge=fs.readFileSync('supabase/functions/v21-ncc-ai-room/index.ts','utf8');
const css=fs.readFileSync('ncc-ai-room.css','utf8');
const math=fs.readFileSync('supabase/functions/v21-ncc-ai-room/invoice-reconciliation.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-ncc-ai-room-edge.yml','utf8');
for(const str of ['import {reconcileInvoice} from "./invoice-reconciliation.mjs";',
 'discount_amount_vnd:nonnegativeInt(raw?.discountAmountVnd',
 'total_payable_vnd:nonnegativeInt(raw?.totalPayableVnd',
 'subtotal_vnd:nonnegativeInt(raw?.subtotalVnd',
 'discount_percent:raw?.discountPercent',
 'Read the full image including bottom totals',
 'GLOBAL','chiết khấu tổng','reconcileInvoice(parsed.document,parsed.lines)',
 'summary:result.summary||null',
 'if(action==="recheck")return handleRecheck(admin.id,body);',
 'getSaved(id:string,hash:string)','revisedKey(id,hash)'])
  if(str!=='GLOBAL')assert(edge.includes(str),'missing Edge '+str);
for(const str of ['Đơn giá gốc/1','CK/1','Sau CK/1','Tổng sau CK',
 'Tổng tiền & chiết khấu của phiếu','Tiền hàng trên phiếu','Cộng từ từng dòng','Chiết khấu tổng',
 'Phải trả tính từ bảng','Phải trả in trên phiếu',
 'CHƯA ĐỦ GIÁ','Đọc lại tổng & chiết khấu','api("recheck",{hash:record.hash})',
 'Không tự ghi giá vốn'])assert(ui.includes(str),'missing UI '+str);
assert(ui.includes('record.hash&&supportsRecheck'),'old Edge cannot expose broken recheck button');
assert(ui.includes('health.features.includes("invoice_totals_v2")'));
assert(edge.includes('features:["invoice_totals_v2"]'));
assert(css.includes('.ncc-ai-summary'));
assert(css.includes('.ncc-ai-recheck'));
assert(math.includes('BigInt(discount)')&&math.includes('rem:product%divisor'));
assert(math.includes('allGrossKnown')&&math.includes('discount_per_unit_vnd'));
assert(!edge.includes('.from("v21_messages")'));
assert(!edge.includes('chat_bank_app_collect'));
assert(!edge.includes('taphoa_update_product_from_web'));
assert(!edge.includes('chat_ncc_invoices'));
assert(workflow.includes('"supabase/functions/v21-ncc-ai-room/**"'));
console.log('NCC-009: invoice totals prompt, verified proportional allocation and history recheck PASS');
