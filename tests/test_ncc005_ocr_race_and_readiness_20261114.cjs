'use strict';
// NCC-005: isolated UI flow; exercises the actual sendPhoto function with a
// mocked server. No customer messages, production images, DB writes or tokens.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('ncc-invoice-admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/v21-ncc-invoice/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261114061000_chat_ncc_supplier_invoice_intake.sql','utf8');
const webhook=fs.readFileSync('supabase/migrations/20261114062500_chat_ncc_event_driven_ocr.sql','utf8');
const preflight=fs.readFileSync('supabase/ncc-release-preflight-readonly.sql','utf8');
const a=src.indexOf('async function sendPhoto(panel){');
const b=src.indexOf('function ensurePhotoComposer(',a);
assert(a>0&&b>a,'canonical photo sender exists');
const sendSource=src.slice(a,b);
const makeHarness=({duplicate=false,pending=0,enabled=true,changeOwner=false,scanError=false}={})=>{
 const calls=[],results=[],notes=[];
 let owner='admin|session-a';
 let statuses=0;
 const panel={
  isConnected:true,
  querySelector(key){
   if(key==='[data-ncc-photo-file]')return {files:[{type:'image/jpeg',size:2048}]};
   return null;
  }
 };
 const env=vm.createContext({
  photoReady:()=>enabled,
  photoOwner:()=>owner,
  photoSync:()=>{},
  photoNote:(_panel,message)=>notes.push(message),
  fileAsBase64:async()=> 'fixture-base64',
  photoResult:(_panel,detail,id)=>results.push({detail,id}),
  call:async(action,data)=>{
   calls.push(action);
   if(action==='manual_upload')return {status:duplicate?'duplicate':'pending',id:'invoice-1'};
   if(action==='scan'){
    if(scanError)throw Error('scan unavailable');
    return {status:pending>0?'processing':'matched'};
   }
   if(action==='detail'){
    statuses++;
    if(changeOwner){owner='admin|session-b';return {document:{status:'processing'},lines:[]};}
    if(duplicate)return {document:{status:'duplicate'},lines:[]};
    const state=statuses<=pending?'processing':'matched';
    return {document:{status:state},lines:state==='matched'?
       [{row_no:1,printed_name:'Sua hop',quantity:2,unit_price_vnd:10000}]:[]};
   }
   throw Error('unexpected '+action);
  },
  window:{setTimeout:callback=>{callback();return 1;}},
  Promise,String,Array
 });
 vm.runInContext('let photoBusy=false;\n'+sendSource+'\nthis.sendPhoto=sendPhoto;',env);
 return {send:()=>env.sendPhoto(panel),calls,results,notes};
};
(async()=>{
 const ready=makeHarness();
 await ready.send();
 assert.deepEqual(ready.calls,['manual_upload','scan','detail']);
 assert.equal(ready.results.length,1);
 assert.equal(ready.results[0].detail.lines.length,1);
 const race=makeHarness({pending:3});
 await race.send();
 assert.equal(race.calls.filter(x=>x==='scan').length,1,'only one Admin scan call');
 assert.equal(race.calls.filter(x=>x==='detail').length,4,'bounded detail reads until ready');
 assert.equal(race.results[0].detail.document.status,'matched');
 const duplicate=makeHarness({duplicate:true});
 await duplicate.send();
 assert.deepEqual(duplicate.calls,['manual_upload','detail'],'duplicate never retriggers AI');
 const blocked=makeHarness({enabled:false});
 await blocked.send();
 assert.equal(blocked.calls.length,0,'server flag absent, send fails closed');
 const logout=makeHarness({pending:8,changeOwner:true});
 await logout.send();
 assert.equal(logout.results.length,0,'stale session never renders another Admin invoice');
 assert.equal(logout.calls.filter(x=>x==='detail').length,1,'no subsequent requests after logout');
 const failure=makeHarness({scanError:true});
 await failure.send();
 assert.equal(failure.results.length,1,'read saved invoice even when OCR is unavailable');

 assert(edge.includes("if(!claimed){"),'concurrent DB claim has a nonerror response');
 assert(edge.includes('latest.status,already_processing:true'),'losing scanner follows durable status');
 assert(edge.includes("!['image','photo'].includes(media.kind)"),'Chat photo and image both supported');
 assert(edge.includes("if(invoice.origin==='manual'&&!invoice.manual_storage_key)"),
   'typed invoice cannot run image OCR');
 assert(edge.includes("if(action==='scan'){"),'scan rejects terminal work');
 assert(edge.includes('return analyze(invoice);'),'OCR runs only when claimed');
 assert(migration.includes("new.kind not in ('image','photo')"));
 assert(webhook.includes("if new.status<>'pending' then return new;"));
 for(const token of ["select 'invoice_table'","select 'lines_table'","select 'media_bucket'","select 'invoice_rls'",
  "to_regclass('public.chat_ncc_invoices')"])assert(preflight.includes(token),'preflight '+token);
 assert(!/\b(insert|update|delete|drop|alter|create)\s+(table|into|trigger|function|schema|type)\b/i.test(
  preflight.replace(/--[^\n]*/g,'')),'preflight must remain read-only');
 assert(!edge.includes('chat_bank_app_collect')&&!edge.includes('taphoa_update_product_from_web'),
  'NCC never calls debt collection or price update');
 console.log('NCC-005: image+photo, one OCR claim, pending-result follow, duplicate and auth gates PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
