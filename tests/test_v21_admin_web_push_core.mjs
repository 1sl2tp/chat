import assert from 'node:assert/strict';
import {summarizeNotification,isGoneStatus,retryDelaySeconds,buildNotificationPayload} from '../supabase/functions/v21-admin-push/push-core.mjs';

assert.equal(summarizeNotification({body:'  Xin chào  ',media:[]}), 'Xin chào');
assert.equal(summarizeNotification({body:'',media:[{kind:'image'}]}), 'Ảnh');
assert.equal(summarizeNotification({body:'',media:[{kind:'audio'}]}), 'Ghi âm');
assert.equal(summarizeNotification({body:'',media:[{kind:'file',file_name:'bao-gia.pdf'}]}), 'bao-gia.pdf');
assert.equal(summarizeNotification({body:'Cuộc gọi nhỡ',media:[]}), 'Cuộc gọi nhỡ');
assert.equal(isGoneStatus(404),true);
assert.equal(isGoneStatus(410),true);
assert.equal(isGoneStatus(500),false);
assert.equal(retryDelaySeconds(1),10);
assert.equal(retryDelaySeconds(5),160);
assert.equal(retryDelaySeconds(6),300);
const payload=buildNotificationPayload({outbox_id:'o1',message_id:'m1',conversation_id:'c1',sender_account_id:'u1',sender_display_name:'Cha yêu',body:'Xin chào',media:[]});
assert.equal(payload.title,'Cha yêu');
assert.equal(payload.tag,'chat:c1');
assert.equal(payload.contact_id,'u1');
console.log('admin web push core PASS');
