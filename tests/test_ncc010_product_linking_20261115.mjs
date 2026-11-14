// NCC-010: isolated identity tests. No database, product-price writes or AI calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import {linkInvoiceLines,normalizeProductName} from "../supabase/functions/v21-ncc-ai-room/product-linking.mjs";
const catalog=[
 {product_code:"HT-000001",product_name:"Sua Fami can xi",is_active:true,deleted_at:null},
 {product_code:"HT-000002",product_name:"Banh na thanh",is_active:true,deleted_at:null},
 {product_code:"HT-000003",product_name:"Fami can xi 200ml",is_active:true,deleted_at:null},
 {product_code:"HT-000004",product_name:"Sua Fami can xi",is_active:true,deleted_at:null},
 {product_code:"HT-000005",product_name:"Da dau",is_active:false,deleted_at:null}
];
assert.equal(normalizeProductName("Sữa  Fami – CanXi"),"sua fami canxi");
assert.equal(normalizeProductName("Đậu đen 1kg"),"dau den 1kg");
const line={row_no:1,printed_name:"Sữa Fami can xi",quantity:5,
 unit_price_vnd:143000,discount_per_unit_vnd:3000,net_unit_vnd:140000};
let result=linkInvoiceLines([line],catalog,[],[]);
assert.equal(result[0].status,"ambiguous","same canonical name under multiple codes cannot auto-link");
assert.equal(result[0].product_code,null);
assert.equal(result[0].invoice_purchase_unit_vnd,140000,"use verified net unit after invoice discount");
assert.equal(result[0].invoice_price_basis,"after_discount");

const unambiguous=linkInvoiceLines([
 {row_no:2,printed_name:"Bánh na thanh",unit_price_vnd:12000,net_unit_vnd:null}
],catalog,[],[]);
assert.equal(unambiguous[0].status,"suggested","accent-insensitive exact match is a suggestion, not approval");
assert.equal(unambiguous[0].product_code,"HT-000002");
assert.equal(unambiguous[0].invoice_purchase_unit_vnd,12000);
assert.equal(unambiguous[0].invoice_price_basis,"printed_before_discount");

const aliases=[{alias_key:"sua fami can xi",product_code:"HT-000001"}];
const translations=[{product_code:"HT-000001",vietnamese_name:"Sữa Fami bổ sung canxi"}];
result=linkInvoiceLines([line],catalog,aliases,translations);
assert.equal(result[0].status,"linked");
assert.equal(result[0].matched_by,"admin_approved_alias");
assert.equal(result[0].product_code,"HT-000001");
assert.equal(result[0].product_name,"Sua Fami can xi");
assert.equal(result[0].vietnamese_name,"Sữa Fami bổ sung canxi");
assert.equal(result[0].printed_name,"Sữa Fami can xi");
assert.equal(result[0].invoice_purchase_unit_vnd,140000);

result=linkInvoiceLines([{row_no:3,printed_name:"Sữa Fami can xi"}],catalog,[],translations);
assert.equal(result[0].status,"ambiguous","Vietnamese label must not erase duplicate catalog identity");
const fuzzy=linkInvoiceLines([{row_no:4,printed_name:"Fami can xi 200ml thung"}],catalog,[],[]);
assert.notEqual(fuzzy[0].status,"linked","fuzzy words must never create a confirmed link");
const unknown=linkInvoiceLines([{row_no:5,printed_name:"Mặt hàng chưa rõ",unit_price_vnd:null,net_unit_vnd:null}],catalog,[],[]);
assert.equal(unknown[0].status,"unmatched");
assert.equal(unknown[0].invoice_purchase_unit_vnd,null);
const invalidAlias=linkInvoiceLines([line],catalog,[{alias_key:"sua fami can xi",product_code:"HT-999999"}],[]);
assert.notEqual(invalidAlias[0].status,"linked","stale alias cannot link a deleted/nonexistent product");
const ui=fs.readFileSync("ncc-ai-room.js","utf8");
const edge=fs.readFileSync("supabase/functions/v21-ncc-ai-room/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261115010000_ncc010_product_aliases_vietnamese_names.sql","utf8");
for(const marker of ["Mã SP","Tên sản phẩm","Tên tiếng Việt","Tên hàng trên phiếu",
 "api(\"link_product\"","Xác nhận liên kết","Giá nhập chỉ để đối chiếu"])
 assert(ui.includes(marker),"missing Admin UI "+marker);
for(const marker of ["requireAdmin(req)","if(!admin)return fail(\"admin_required\",403)",
 "if(action===\"link_product\")return handleLinkProduct(admin.id,body)",
 ".from(\"taphoa_products\")",".from(\"chat_ncc_product_aliases\")",
 "product_mapping_ready:Boolean(identity)","product_code_not_found","product_alias_conflict"])
 assert(edge.includes(marker),"missing guard "+marker);
for(const marker of ["ENABLE ROW LEVEL SECURITY","REVOKE ALL",
 "REFERENCES public.taphoa_products(product_code)","PRIMARY KEY",
 "approved_by uuid NOT NULL"])
 assert(migration.includes(marker),"missing schema protection "+marker);
for(const forbidden of ["taphoa_update_product_from_web","chat_bank_app_collect",
 ".from(\"v21_messages\")",".update({input_price_vnd"])
 assert(!edge.includes(forbidden),"forbidden product/finance write "+forbidden);
console.log("NCC-010 canonical three-name product identity and safe Admin mapping PASS");
