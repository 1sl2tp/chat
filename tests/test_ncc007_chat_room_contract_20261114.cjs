'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('ncc-ai-room.js','utf8');
const css=fs.readFileSync('ncc-ai-room.css','utf8');
const backend=fs.readFileSync('supabase/functions/v21-ncc-ai-room/index.ts','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-ncc-ai-room-edge.yml','utf8');
const legacy=fs.readFileSync('ncc-invoice-admin.js','utf8');
for(const source of ['ncc-ai-room.js','ncc-ai-room.css'])assert(html.includes('data-build-source="'+source+'"'));
for(const marker of ['NCC AI','data-ncc-room-file','data-ncc-room-send','data-ncc-room-back','function appendAdmin(',
 'function appendTable(','Đã trích xuất','Sao chép bảng','Ảnh trùng','duplicate:true',
 'function checkStatus(hash,owner)','async function open()','async function submit()',
 'const owner=accountSession()','visibleHashes=new Set()','room.hidden=false;opened=true;',
 'const history=await api("history")','if(!isAdmin()){close();purge();}',
 'Gửi ảnh phiếu nhập để AI tạo bảng hàng',
 'Chỉ Admin · Không tự ghi giá vốn hay công nợ'])assert(ui.includes(marker),marker);
assert(!ui.includes("chat_bank_app_collect"));
for(const marker of ['.ncc-ai-room[hidden]{display:none!important}','height:100dvh',
 'env(safe-area-inset-bottom','overflow-x:auto'])assert(css.includes(marker),marker);
for(const marker of ['async function requireAdmin(','.eq("role","admin")','.is("locked_at",null)',
 'db.auth.getUser(token)','const BUCKET="v21-media"','function mimeVerified(',
 'const LIMIT_BYTES=4000000','crypto.subtle.digest("SHA-256"',
 'const saved=await getSaved(adminId,hash)','duplicate:true,status:"duplicate"',
 'return handleSend(admin.id,body)','return handleStatus(admin.id,body)',
 'return handleHistory(admin.id)','const lock=await db.storage.from(BUCKET).upload(',
 'contentType:"text/plain",upsert:false','responseMimeType:"application/json"',
 'Deno.env.get("GEMINI_API_KEY")','status:classification==="supplier_invoice"',
 'date:text(raw?.date,30)||null'])assert(backend.includes(marker),marker);
for(const marker of ['chat_bank_app_collect','taphoa_update_product_from_web',
 'chat_ncc_invoices','chat_ncc_invoice_lines','.from("v21_messages")',
 'create table','ALTER TABLE'])assert(!backend.includes(marker),'forbidden backend '+marker);
assert(legacy.includes('if(window.V21NccAiRoom){window.V21NccAiRoom.mount?.();return;}'));
assert(workflow.includes('GITHUB_REF" != "refs/heads/main"'));
assert(workflow.includes('SUPABASE_ACCESS_TOKEN: '+'$'+'{{ secrets.SUPABASE_ACCESS_TOKEN }}'));
assert(workflow.includes('node --check ncc-ai-room.js'));
assert(workflow.includes('supabase functions deploy v21-ncc-ai-room'));
for(const marker of ['supabase db push','supabase migration up','v21-bank-bill-event'])
 assert(!workflow.includes(marker),'deploy must not touch '+marker);
console.log('NCC-007: independent Admin OCR room, private Storage duplicate, no DB schema change PASS');
