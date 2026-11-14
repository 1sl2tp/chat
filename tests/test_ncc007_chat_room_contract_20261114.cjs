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
 'function checkStatus(hash,owner)','async function open(options={})','async function submit()',
 'const owner=accountSession()','visibleHashes=new Set()','room.hidden=false;opened=true;',
 'const history=await api("history")','if(!isAdmin()){close();purge();}',
 'Bấm + chọn ảnh · AI tự đọc ngay',
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

/* WORK-365: exercise the two real Work tabs without DOM, network or money writes.
   The existing bank report stays the only finance owner. */
const vm=require('node:vm');
const start=ui.indexOf('let workReport=null,workBankPanel=null,workSupplierPanel=null,workSection="bank";');
const end=ui.indexOf('function mount(){',start);
assert(start>0&&end>start,'WORK-365 controller exists in the NCC presentation owner');
const workControls=['bank','supplier'].map(kind=>({
  dataset:{bankWorkTab:kind},attrs:{},tabIndex:-1,
  setAttribute(name,value){this.attrs[name]=String(value)}
}));
const report={dataset:{workSection:'bank'},hidden:false,scrollTop:80,querySelectorAll(){return workControls}};
const bankPanel={hidden:false},supplierPanel={hidden:true,isConnected:true};
const stage={dataset:{bankReportActive:'true'}};
let authorized=true,opened=0,closed=0,returnedMobile=0,returnedDesktop=0;
let mobileReturn=true;
const work=vm.createContext({
 document:{getElementById:id=>id==='stageLayout'?stage:null},
 window:{
  V21WorkCustomerSummary:{showMobileDirectory:()=>{returnedMobile++;return mobileReturn}},
  ChatAppShell:{NavigationCommand:{
   clearActiveContact(){returnedDesktop++},openChat(){returnedDesktop++}
  }}
 },
 isAdmin:()=>authorized,
 open:({inlineHost}={})=>{opened++;work.embeddedHost=inlineHost},
 close:()=>{closed++;work.embeddedHost=null},
 String,Boolean
});
vm.runInContext(ui.slice(start,end)+
 "\nthis.configure=()=>{workReport=this.report;workBankPanel=this.bankPanel;workSupplierPanel=this.supplierPanel};"+
 "\nthis.show=showWorkTab;this.reset=resetWorkTabsIfInactive;this.back=backToChats;",work);
work.report=report;work.bankPanel=bankPanel;work.supplierPanel=supplierPanel;work.configure();
assert.equal(work.show('supplier'),true,'Nhập hàng must be directly selectable');
assert.equal(report.dataset.workSection,'supplier');
assert.equal(bankPanel.hidden,true,'bank content hidden rather than deleted');
assert.equal(supplierPanel.hidden,false,'supplier content shown inside work');
assert.equal(opened,1,'NCC uses the single existing room');
assert.equal(workControls[1].attrs['aria-selected'],'true');
assert.equal(work.show('supplier'),true);
assert.equal(opened,1,'reselecting supplier never requests duplicate AI history');
assert.equal(work.show('bank'),true);
assert.equal(bankPanel.hidden,false);
assert.equal(supplierPanel.hidden,true);
assert.equal(closed,1,'switching to bank detaches supplier room');
authorized=false;
assert.equal(work.show('supplier'),false,'normal users may not open Admin work');
authorized=true;
assert.equal(work.show('supplier'),true);
report.hidden=true;work.reset();
assert.equal(report.dataset.workSection,'bank','leaving report restores default work tab');
assert.equal(supplierPanel.hidden,true);
report.hidden=false;
work.back();
assert.equal(returnedMobile,1,'back to Chat directory reuses existing mobile navigation');
mobileReturn=false;
work.back();
assert.equal(returnedDesktop,2,'desktop fallback returns to Chat without new route');
assert(ui.includes('aria-controls="bankWorkBankPanel"'));
assert(ui.includes('aria-controls="bankWorkSupplierPanel"'));
assert(ui.includes('Quay lại Trò chuyện'));
assert(ui.includes('>Chuyển khoản</button>'));
assert(ui.includes('>Nhập hàng</button>'));
assert(css.includes('.ncc-ai-room[data-embedded=true]'));
assert(!ui.includes('setInterval('),'no new polling or duplicate message transport');
console.log('WORK-365: inline supplier and bank tabs, role gates, state and Chat return PASS');
