import assert from 'node:assert/strict';
import {buildNotificationPayload} from '../supabase/functions/v21-admin-push/push-core.mjs';

const payload=buildNotificationPayload({
  outbox_id:'o-copy',
  message_id:'m-copy',
  conversation_id:'c-copy',
  sender_account_id:'u-copy',
  sender_display_name:'test',
  body:'hi',
  media:[]
});

assert.equal(payload.title,'test','notification title is sender name only');
assert.equal(payload.body,'hi','notification body is message content only');
assert.equal(Object.prototype.hasOwnProperty.call(payload,'timestamp'),false,'OS owns notification date/time presentation');
assert.equal(Object.prototype.hasOwnProperty.call(payload,'app_name'),false,'payload must not add a redundant app-name line');
console.log('admin web push notification copy PASS');
