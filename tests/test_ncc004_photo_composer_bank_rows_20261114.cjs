'use strict';
// UI-348 / NCC-004: source & pure owner contract; no user images/DB/API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ui=fs.readFileSync('ncc-invoice-admin.js','utf8');
const bank=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const edge=fs.readFileSync('supabase/functions/v21-ncc-invoice/index.ts','utf8');
const start=ui.indexOf('function photoReady(){');
const end=ui.indexOf('function photoNote(',start);
assert(start>0&&end>start,'one readiness/session owner');
let isAdmin=true,isReady=false;
const session={state:'AUTHENTICATED',account:{id:'admin-a',role:'admin'},appSessionId:'session-a'};
const ctx=vm.createContext({
 admin:()=>isAdmin,
 auth:()=>({snapshot:()=>session}),
 window:{V21ContactDirectoryAdmin:{nccEnabled:()=>isReady}},
 String
});
vm.runInContext(ui.slice(start,end)+'\nthis.ready=photoReady;this.owner=photoOwner;',ctx);
assert.equal(ctx.ready(),false,'backend disabled is never treated as ready');
assert.equal(ctx.owner(),'admin-a|session-a');
isReady=true;
assert.equal(ctx.ready(),true,'enabled Admin can submit');
isAdmin=false;
assert.equal(ctx.ready(),false,'non Admin cannot submit');
assert.equal(ctx.owner(),'','non Admin cannot read Admin session owner');
isAdmin=true;session.appSessionId='';
assert.equal(ctx.owner(),'','missing auth session fails closed');

assert(ui.includes('data-ncc-photo-file')&&ui.includes('data-ncc-photo-preview'));
assert(ui.includes('data-ncc-photo-send')&&ui.includes('data-ncc-photo-result'));
assert(ui.includes("const base64=await fileAsBase64(file)"));
const send=ui.slice(ui.indexOf('async function sendPhoto(panel){'),ui.indexOf('function ensurePhotoComposer(',ui.indexOf('async function sendPhoto(panel){')));
const uploadAt=send.indexOf("call('manual_upload'");
const scanAt=send.indexOf("call('scan'");
const detailAt=send.indexOf("call('detail'");
assert(uploadAt>0&&scanAt>uploadAt&&detailAt>scanAt,'upload then AI scan then read table');
assert(send.includes('if(photoBusy||!photoReady())return;'),'send is not enabled by local label');
assert(send.includes("owner===photoOwner()"),'session switch suppresses stale results');
assert(send.includes("if(status!=='duplicate')"),'duplicate never consumes second AI scan');
assert(send.includes('photoResult(panel,detail,id)'),'server lines, never fabricated OCR rows');
assert(send.includes('file.size>4000000'),'image cap maintained');
assert(ui.includes('URL.revokeObjectURL(photoPreviewUrl)'),'image preview resources released');
assert(ui.includes('panel.dataset.ready=String(ready)'),'visible capability reflects server readiness');
assert(!send.includes('chat_bank_app_collect')&&!send.includes('taphoa_update_product_from_web'),
 'image parsing does not write customer debt or product cost');
assert(edge.includes("if(action==='manual_upload')"));
assert(edge.includes("if(action==='scan')return analyze(invoice);"));
assert(edge.includes("if(action==='detail')"));
assert(edge.includes('validatePrintedInvoice(raw)'),'server validates printed invoice');
assert(html.includes('data-bank-report-ncc-slot'));
assert(css.includes('/* NCC-004: compact Chat-like photo entry'));
assert(css.includes('.ncc-photo-result-table'));
assert(css.includes('@media(max-width:360px)'));
assert(bank.includes("tr.dataset.bankCollectedStatus=g.matched>0?'Đã ghi thu':'Chưa ghi thu'"));
console.log('UI-348 + NCC-004: stable two rows and guarded photo -> AI -> table, with offline/role/session safety PASS');
