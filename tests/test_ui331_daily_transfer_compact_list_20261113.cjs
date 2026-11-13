'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const start=js.indexOf('async function openDailyBankSummary(){');
const stop=js.indexOf('async function openReviewDialog(',start);
assert(start>0&&stop>start,'daily transfer dialog must remain isolated');
const dialog=js.slice(start,stop);
assert(dialog.includes("el('div','bank-review-form bank-daily-form')"));
assert(dialog.includes("client.rpc('chat_bank_daily_transfer_preview'"));
assert(dialog.includes("client.rpc('chat_bank_daily_transfer_send_manual'"));
assert(dialog.includes("p_app_session_id:auth.appSessionId,p_day:day,p_customer_id:recipient.customer_id"));
assert(dialog.includes("date.max=yesterday()"),'closed transfer day restriction must remain');
assert(dialog.includes("send.disabled=Boolean(recipient.sent||!recipient.eligible)"),
 'sent or opted-out recipients must not send again');
assert(dialog.includes("window.confirm('Gửi thông báo đối soát ngày '"),
 'manual sending still requires an explicit confirmation');
assert(dialog.includes("bankDialogIsCurrent(overlay,owner)"),
 'dialog ownership must protect against stale requests');
assert(dialog.includes("const row=el('div','bank-daily-customer');"));
assert(dialog.includes("row.dataset.delivery=recipient.sent?'sent':!recipient.eligible?'muted':'ready'"));
assert(dialog.includes("el('div','bank-daily-customer-info')"));
assert(dialog.includes("el('strong','bank-daily-customer-amount'"));
assert(dialog.includes("el('div','bank-daily-row-actions')"));
assert(dialog.includes("el('details','bank-daily-preview')"));
assert(dialog.includes("preview.appendChild(el('pre','',recipient.body||''))"));
assert(dialog.includes("append(row,detail,amount,actions);list.appendChild(row)"));
assert(dialog.includes("row.dataset.delivery='sent'"));
assert(!dialog.includes("recipient.transfer_count+' lượt · Tổng '+recipient.amount_thousands"),
 'avoid duplicate summary text in compact list');
const cut=css.indexOf('/* UI-331 — approved Model 2');
assert(cut>0);
const rules=css.slice(cut);
for(const expected of [
 '.bank-daily-form .bank-daily-customers',
 'gap:0;',
 '.bank-daily-form .bank-daily-customer',
 'grid-template-areas:"info amount" "actions actions"',
 'grid-template-columns:minmax(0,1fr) minmax(80px,max-content)',
 '.bank-daily-form .bank-daily-customer-amount',
 'font-variant-numeric:tabular-nums',
 '.bank-daily-form .bank-daily-row-actions',
 '.bank-daily-form .bank-daily-preview[open]',
 '.bank-daily-form .bank-daily-customer[data-delivery="sent"]',
 '.bank-daily-form .bank-daily-customer[data-delivery="muted"]',
 '.bank-daily-form .bank-daily-customer .bank-review-save.bank-daily-send:not(:disabled)',
 '@media(max-width:650px)',
 'max-height:min(88dvh,740px)',
 '@media(max-width:360px)',
 ':focus-visible'
])assert(rules.includes(expected),'missing compact dialog rule '+expected);
assert(!/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(?:taphoa_debt_ledger|chat_bank_bill_receipts)/i.test(dialog));
console.log('UI-331: compact daily transfer list, preview, per-customer status and manual-send guards PASS');
