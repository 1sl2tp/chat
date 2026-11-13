import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nameKey,invoiceDate,documentKey,validatePrintedInvoice,matchSupplierLine,previewInvoice} from '../supplier-invoice-core.mjs';

const sender='supplier-1';
const product={product_code:'P001',product_name:'Sữa chua ít đường',input_price_basis:'thung',input_price_vnd:100000,is_active:true};
const line={printedName:'sua chua it duong',printedUnit:'thung',quantity:2,unitPriceVnd:105000,lineTotalVnd:210000};
const invoice={classification:'supplier_invoice',date:'13/11/2026',invoiceNumber:'033791',printedTotalVnd:210000,lines:[line]};

test('Vietnamese product names normalize but do not collapse distinct variants',()=>{
 assert.equal(nameKey('Sữa chua ít đường'),nameKey('sua chua it duong'));
 assert.notEqual(nameKey('sua chua it dg'),nameKey('sua chua k dg'));
});
test('invoice date is calendar strict; date+number scoped to supplier, hash fallback',()=>{
 assert.equal(invoiceDate('13/11/2026'),'2026-11-13');
 assert.equal(invoiceDate('31/02/2026'),null);
 assert.equal(documentKey({senderId:sender,date:'13/11/2026',invoiceNumber:' 033791 '}),'ncc:supplier-1:2026-11-13:033791');
 assert.notEqual(documentKey({senderId:'another',date:'13/11/2026',invoiceNumber:'033791'}),
   documentKey({senderId:sender,date:'13/11/2026',invoiceNumber:'033791'}));
 assert.equal(documentKey({senderId:sender,imageHash:'a'.repeat(64)}),'ncc:supplier-1:sha256:'+ 'a'.repeat(64));
 assert.equal(documentKey({senderId:sender}),null);
});
test('only real printed supplier invoice with matched arithmetic can be used',()=>{
 assert.equal(validatePrintedInvoice(invoice).ok,true);
 assert.equal(validatePrintedInvoice({...invoice,classification:'bank_transfer'}).reason,'not_supplier_invoice');
 assert.equal(validatePrintedInvoice({...invoice,printedTotalVnd:200000}).reason,'total_mismatch_or_missing');
 assert.equal(validatePrintedInvoice({...invoice,date:'31/11/2026'}).reason,'date_unverified');
 assert.equal(validatePrintedInvoice({...invoice,lines:[{...line,lineTotalVnd:1}]}).reason,'line_arithmetic_or_ocr_uncertain');
});
test('exact name and explicit unit permit a conservative price suggestion',()=>{
 const result=previewInvoice(invoice,[product],[],sender);
 assert.equal(result.ready,true);assert.equal(result.matched,1);
 assert.equal(result.rows[0].product_code,'P001');assert.equal(result.rows[0].costVnd,105000);
 assert.equal(result.rows[0].deviationPercent,5);
});
test('unknown unit or similar product requires manual selection and never guessed conversion',()=>{
 const missing=matchSupplierLine({...line,printedUnit:''},[product],[],sender);
 assert.equal(missing.status,'manual');
 const ambiguous=matchSupplierLine(line,[product,{...product,product_code:'P002'}],[],sender);
 assert.equal(ambiguous.status,'manual');
});
test('a supplier-specific, manually curated alias can convert units; large price jump still needs review',()=>{
 const alias=[{chat_account_id:sender,supplier_name_key:nameKey('sua chua it dg'),
   supplier_unit_key:'hop',product_code:'P001',unit_factor:2}];
 const matched=matchSupplierLine({...line,printedName:'sua chua it dg',printedUnit:'hop',unitPriceVnd:210000},
   [product],alias,sender);
 assert.equal(matched.status,'matched');assert.equal(matched.costVnd,105000);
 assert.equal(matchSupplierLine({...line,unitPriceVnd:150000},[product],[],sender).reason,'price_jump');
 assert.equal(matchSupplierLine({...line,printedName:'sua chua it dg',printedUnit:'hop'},
   [product],alias,'other-supplier').status,'manual');
});
