'use strict';
// CHAT-444: screenshot-derived ChatGPT visual grammar on the *existing* CRM screen.
// Tests the HTML/CSS owner and safe Web/PWA public-shell delivery, no real chats.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.source.html');
const visual=read('chatgpt-ab-conversation.css');
const shared=read('ui-foundation.css');
const sw=read('sw.js');
const app=read('app.js');
const sprite=read('ui-library/icons-2027.svg');
const version=html.match(/<meta name="app-release-version" content="([^"]+)"/)?.[1];
assert.ok(/^V\\d+\\.\\d+\\.\\d+$/.test(version),'canonical release meta must exist');
assert.ok(sw.includes("const RELEASE_VERSION='"+version+"'"));
assert.ok(app.includes("releaseVersion:'"+version+"'"));
const epoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1];
assert.ok(/^pwa-chat-[a-z0-9-]+$/.test(epoch),'public PWA shell needs a release cache epoch');
assert.notEqual(epoch,'pwa-chat-ui444-reference-composer-20261124',
 'changed composer CSS must rotate the previous PWA shell');
assert.ok(sw.includes("'./ui-library/icons-2027.svg'"),
 'shared canonical icon sprite must be available to installed PWA offline');
assert.ok(sprite.includes('id="ui-icon-clipboard"'));
for(const name of ['composerShell','composerForm','editor','composer-plus-btn','composer-mic-btn','send','regionTop','messageWindow','scrollRoot']){
 assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1,name+' must keep one original owner');
}
assert.ok(visual.includes('CHAT-444 · iPhone side-by-side reference'));
assert.ok(visual.includes('border-radius:999px!important;'));
assert.ok(visual.includes('background:var(--cgpt-composer-surface-primary)!important;'));
assert.ok(visual.includes('background:transparent!important;'), 'inner buttons cannot repaint separate disks');
assert.ok(!visual.includes('grid-column:2 / 4;'), 'no second fake capsule behind editor/microphone');
assert.ok(visual.includes('.assistant-message-unit:not([data-shared-list="true"])>.message-text:not([hidden])'));
assert.ok(visual.includes('background:transparent!important;'), 'incoming reading lane unboxed');
assert.ok(visual.includes('background:var(--chat-message-sent-bg)!important;'), 'outgoing neutral bubble');
assert.ok(shared.includes('.top-mode-switch[data-contact-identity="true"] .top-mode-tab[data-top-tab="chat"]>.crm-tab-icon'), 'no duplicate customer icon beside avatar/name');
assert.ok(html.includes('data-crm-secondary-tab-icon'), 'shared Chat/Work tab continues to own its own icon');
assert.ok(html.includes('data-chat-header-action="cash"')&&html.includes('data-chat-header-action="debt"'), 'CRM finance actions remain in customer menu');
assert.ok(html.includes('data-work-summary-root'), 'Work view remains linked to selected conversation');
console.log('CHAT-444: ChatGPT screenshot layout + CRM buttons + public PWA version/asset PASS');
