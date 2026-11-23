'use strict';
// CHAT-440 — public-shell notification policy, not a live Push send.
// The runtime SW+controller tests exercise the four foreground/background
// cases. This structural test keeps the ownership boundaries stable.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sw=fs.readFileSync('sw.js','utf8');
const ui=fs.readFileSync('admin-push-controller.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const app=fs.readFileSync('app.js','utf8');

assert(sw.includes('const deliveredMessagePushIds=new Set();'));
assert(sw.includes("if(kind==='message'&&messageId)"),'only actual message IDs may be deduped');
assert(sw.includes('deliveredMessagePushIds.size>150'),'bounded SW memory');
assert(sw.includes('getNotifications?.({tag})'),'survive SW restart if Notification Center persists');
assert(sw.includes('state.directoryVisible!==true'),'only the visible THREAD owns same-conversation suppression');
assert(sw.includes("if(readingSame||visibleMobileChat)return;"),'do not OS-banner while visibly reading mobile Chat');
assert(sw.includes('const timeout=setTimeout(()=>finish(null),700);'),'iOS keyboard/unlock live foreground reply must get enough time');
assert(sw.includes("if(client?.visibilityState==='hidden')return null"),'lock/background must not use stale foreground state');
assert(sw.includes("state.visible!==true)return null"),'only live visible state suppresses OS banner');
assert(sw.includes("if(kind==='message'&&messageId){\n      deliveredMessagePushIds.add(messageId);"));
assert(sw.includes("kind==='call_invite'||missedPush||friendPush"),'call/friend OS alerts remain separate');
assert(ui.includes("dataset?.mobileDirectory==='true'"),'directory has distinct presented state');
assert(ui.includes("if(route==='chat'&&!directoryVisible&&contactId)"),'never inherit active chat identity while in directory');
assert(ui.includes('if(current.directoryVisible)return;'),'unread preview row wins over duplicate toast');
assert(ui.includes('messageToastSeen.has(messageId)'),'in-app toast idempotency remains');
assert(sw.includes("RELEASE_VERSION='V21.72.80'"));
assert(sw.includes("SHELL_CACHE_EPOCH='pwa-chat-ui441-ios-multi-photo-selection-20261123'"));
assert(source.includes('<meta name="app-release-version" content="V21.72.80">'));
assert(app.includes("releaseVersion:'V21.72.80'"));
console.log('CHAT-440 context-aware foreground/locked/directory push policy PASS');
