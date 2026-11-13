import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMissedChatCallPayload} from '../supabase/functions/v21-admin-push/push-core.mjs';
const row={outbox_id:'outbox',source_kind:'v21_call',source_id:'call-1',contact_id:'customer-1',contact_name:'Xe E Hoàng 6.8t'};
const p=buildMissedChatCallPayload(row);
assert.equal(p.kind,'missed_chat_call');
assert.equal(p.contact_id,'customer-1');
assert.equal(p.tag,'missed-chat-call:call-1');
assert.match(p.title,/Cuộc gọi nhỡ/);
assert.match(p.body,/Xe E Hoàng 6.8t/);
assert.ok(!JSON.stringify(p).includes('0987654321'));
const client=readFileSync('contact-phone-admin.js','utf8');
const sw=readFileSync('sw.js','utf8');
const control=readFileSync('admin-push-controller.js','utf8');
const page=readFileSync('index.source.html','utf8');
for(const token of ['v21_admin_contact_phone',"input.type='tel'","window.location.href='tel:'",'v21-missed-call-push-open'])assert.ok(client.includes(token),token);
assert.ok(client.includes('box-sizing:border-box;width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px'),
  'phone callback icon shares a 44px hitbox with video call');
assert.ok(client.includes('.call-focus-slot:not([data-call-ui-state="idle"]) .v21-phone-header-button{display:none!important}'),
  'private callback control cannot crowd active call controls');
assert.ok(client.includes('function phoneContextActive(id,account){'));
assert.ok(client.includes("String(current()?.id||'')===String(id)"));
assert.ok(client.includes('if(!overlay.isConnected||!phoneContextActive(id,account)||String(au().appSessionId||'')!==session)'),
  'late phone replies must not expose a previous customer');
assert.ok(client.includes("document.addEventListener('v21-active-contact-change',()=>{dismiss();clearNotice();attach()});"));
assert.ok(page.includes('contact-phone-admin.js'));
assert.ok(page.indexOf('contact-phone-admin.js')<page.indexOf('admin-push-controller.js'));
assert.ok(sw.includes("kind==='missed_chat_call'"));
assert.ok(sw.includes('push_missed_chat_call'));
assert.ok(control.includes('v21-missed-call-push-open'));
console.log('CALL-186 iOS callback and missed Chat Push PASS');