import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
const userLinkSql=fs.readFileSync(new URL('../../../supabase/migrations/20260911_zalo_user_link_bridge.sql',import.meta.url),'utf8');
const splitSql=fs.readFileSync(new URL('../../../supabase/migrations/20261005111750_split_zalo_text_media_delivery.sql',import.meta.url),'utf8');

test('Zalo outbound is event-driven with startup catch-up only',()=>{
  assert.match(server,/void pollOutbound\(\);/);
  assert.doesNotMatch(server,/ZALO_FALLBACK_POLL_MS/);
  assert.doesNotMatch(server,/outboundTimer=setInterval/);
});

test('outbound Chat to Zalo is only enqueued for linked recipients',()=>{
  assert.match(splitSql,/from public\.zalo_user_links l[\s\S]*where l\.chat_account_id=v_peer and l\.linked_by_account_id=v_message\.sender_account_id/);
  assert.match(splitSql,/if v_link\.chat_account_id is null or v_message\.created_at<v_link\.linked_at then return new; end if;/);
  assert.match(userLinkSql,/from public\.zalo_user_links l[\s\S]*where l\.chat_account_id=v_peer[\s\S]*linked_by_account_id=new\.sender_account_id/);
});

test('inbound Zalo text/media only enters Chat when a Zalo link exists',()=>{
  assert.match(userLinkSql,/select \* into v_link[\s\S]*from public\.zalo_user_links[\s\S]*where zalo_id=v_zalo_id/);
  assert.match(userLinkSql,/if v_link\.chat_account_id is null or v_event_at < v_link\.linked_at then[\s\S]*return null/);
  assert.match(server,/const target=await messageGateway\.mediaTarget\(event\);[\s\S]*if\(!target\?\.needed\)[\s\S]*return;/);
  assert.match(server,/bridged=await messageGateway\.ingestText\(event\)/);
});
