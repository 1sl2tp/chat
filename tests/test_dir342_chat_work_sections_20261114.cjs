'use strict';
// DIR-342: source-and-pure-function regression only. No sends, bank writes,
// price edits, external calls or account changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const ncc=fs.readFileSync('ncc-invoice-admin.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const index=fs.readFileSync('index.source.html','utf8');

const REPORT_ID='fc3ec480-60d2-4749-b7af-5f4ae71eb14e';
const s=directory.indexOf('function matchesDirectory(item){');
const e=directory.indexOf('function syncDirectoryRows(',s);
assert(s>0&&e>s,'existing Admin filter owner retained');
const ctx=vm.createContext({String,Number,Map,
 normalizeText:v=>String(v||'').toLowerCase(),
 groupKey:v=>v||'other',
 isPinnedReportContact:v=>String(v?.id||'')===REPORT_ID
});
vm.runInContext(
 "let directorySection='chat';let query='';let filter='all';"+
 "let groupMap=new Map([['customer-1','customer'],['ncc-1','ncc']]);"+
 directory.slice(s,e)+
 "\nthis.match=matchesDirectory;this.section=v=>directorySection=v;"+
 "this.filter=v=>filter=v;this.query=v=>query=v;",ctx);
const bank={id:REPORT_ID,display_name:'TAPHOA · Báo cáo chuyển khoản'};
const customer={id:'customer-1',display_name:'C Sâm pl',has_unread:true};
const supplier={id:'ncc-1',display_name:'A Tùng',unread_count:2};
const sameName={id:'customer-2',display_name:'TAPHOA · Báo cáo chuyển khoản'};
assert(ctx.match(customer)&&ctx.match(supplier)&&ctx.match(sameName));
assert(!ctx.match(bank),'bank system contact is not a customer chat');
ctx.filter('unread');
assert(ctx.match(customer)&&ctx.match(supplier),'native unread signals work as before');
ctx.filter('ncc');
assert(ctx.match(supplier)&&!ctx.match(customer),'NCC account remains a chat participant');
ctx.section('work');
assert(ctx.match(bank)&&!ctx.match(customer)&&!ctx.match(supplier)&&!ctx.match(sameName),
 'Work shows only canonical bank report, never another account with a lookalike name');
ctx.query('không khớp');ctx.filter('customer');
assert(ctx.match(bank),'work ignores customer search filters and remains reachable');
ctx.section('chat');ctx.query('');ctx.filter('all');
assert(!ctx.match(bank)&&ctx.match(customer));
assert(ctx.match(supplier),'supplier chats remain in Chat');
assert(directory.includes("directorySection='chat';"),'account scoped default is chat');
assert(directory.includes("query='';filter='all';directorySection='chat';"),
 'auth change resets work section to protect account scope');
assert(directory.includes("data-contact-directory-section=\"chat\""));
assert(directory.includes("data-contact-directory-section=\"work\""));
assert(directory.includes("role=\"tablist\" aria-label=\"Trò chuyện hoặc Công việc\""));
assert(directory.includes("data-contact-work-ncc-slot"),'one NCC work tool slot');
assert(directory.includes("Chuyển khoản · Đối soát"));
assert(directory.includes("Sản phẩm · Phiếu NCC"));
assert(directory.includes("contact-directory-work-bank-heading[hidden]"));
assert(directory.includes("if(!restore)syncDirectoryRows({reorder:false,scrollToTop:true});"),
 'only deliberate section switches reset the directory scroll');
assert(directory.includes("const scrollAnchor=viewport?.capture?.(scrollHost,host)||null;"),
 'background contact updates keep the native viewport owner');
assert(directory.includes("document.addEventListener('v21-contact-store-change',()=>scheduleSync());"),
 'message/unread changes still update sidebar');
assert(!directory.includes("set_group',contact_group:'work'"),
 'work must not become a stored contact group');
assert(ncc.includes("const directorySlot=document.querySelector('[data-contact-work-ncc-slot]');"));
assert(ncc.includes("const reportSlot=report?.querySelector('[data-bank-report-ncc-slot]');"),'NCC moves onto the full report page');
assert(ncc.includes("if(!slot)return;"),'never fall back to showing NCC in the chat header');
assert(directory.includes("nav.insertBefore(workTools,host.nextSibling);"),'NCC appears after the bank report, not before it');
assert(directory.includes("workTools.hidden=directorySection!=='work';"),'work-only utility remains hidden in Chat');
assert(directory.includes('<summary class="contact-directory-work-summary">'),'optional NCC is closed until expanded');
assert(directory.includes("const workTools=document.createElement('details');"),'native compact disclosure without duplicated menu');
assert(directory.includes('Tiện ích khác'),'secondary utility label stays visible');
assert(directory.includes('data-contact-work-tools')&&directory.includes("document.querySelector('[data-contact-work-tools]')?.remove();"),'remove secondary area on logout');
assert(directory.includes('.contact-directory-tools[data-directory-section="work"]{display:none!important}'),'no empty top area on mobile Work');
assert(directory.indexOf('nav.insertBefore(bankHeading,host);')<directory.indexOf('nav.insertBefore(workTools,host.nextSibling);'),'primary before secondary');
assert(ncc.includes("if(existing.parentElement!==slot)slot.appendChild(existing);"));
assert(ncc.includes("slot.appendChild(button);"));
assert(!ncc.includes("tools.appendChild(button);"),'no duplicate NCC launcher in Chat');
assert(index.includes('data-top-tab="photos" data-nav-target="photos"'),
 'Photos stays accessible; do not remove a shipped customer feature');
assert(shell.includes('const PINNED_BANK_REPORT_CONTACT_ID='), 'bank route unchanged');
assert(directory.includes("row.hidden=!show;"), 'selection is a visibility filter, never data deletion');
console.log('DIR-342: Admin Chat vs Work, customer/NCC threads, bank report, Photos and auth/scroll ownership PASS');
