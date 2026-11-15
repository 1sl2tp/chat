import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../../../supabase/functions/v21-telegram-directory-status/index.ts',import.meta.url),'utf8');
test('Telegram directory status uses only canonical Chat accounts',()=>{
  assert.match(src,/\/rest\/v1\/v21_accounts/);
  assert.match(src,/role.*eq\.user/);
  assert.match(src,/deleted_at.*is\.null/);
  assert.doesNotMatch(src,/zalo_contacts|zalo_user_links|createForumTopic|sendMessage|getUpdates/);
});
test('read-only status contains no external write or personal identity response',()=>{
  assert.doesNotMatch(src,/method:\s*['"]POST|method:\s*['"]PATCH|service_role_key\s*=|telegram_chat_id/);
  assert.match(src,/activeChatAccounts/);
  assert.match(src,/topicsCreatedByThisFunction:0/);
  assert.match(src,/importedZaloContacts:0/);
});
