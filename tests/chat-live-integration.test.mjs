import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ChatScreen keeps mock fallback but accepts an optional live conversation source', () => {
  const source = read('src/chat/chat-screen.ts');
  assert.match(source, /conversationSource\?:\s*ChatConversationSource/);
  assert.match(source, /new LiveConversationSession/);
  assert.match(source, /if \(this\.options\.conversationSource\)/);
  assert.match(source, /mockConversation/);
  assert.match(source, /this\.#live\?\.stop\(\)/);
});

test('reply keeps origin message id while composer still renders preview copy', () => {
  const screen = read('src/chat/chat-screen.ts');
  const composer = read('src/chat/composer.ts');
  assert.match(screen, /setReply\([^,]+,\s*message\.id\)/s);
  assert.match(composer, /replyToId\?: string/);
  assert.match(composer, /#replyId/);
  assert.match(composer, /replyToId:\s*this\.#replyId/);
});

test('live send is optimistic sending while mock send remains sent', () => {
  const source = read('src/chat/chat-screen.ts');
  assert.match(source, /status:\s*this\.options\.conversationSource\s*\?\s*'sending'\s*:\s*'sent'/);
  assert.match(source, /void this\.#live\.send\(message, \{ imageFiles: payload\.imageFiles, file: payload\.file, audioFile: payload\.audioFile \}\)/);
});
