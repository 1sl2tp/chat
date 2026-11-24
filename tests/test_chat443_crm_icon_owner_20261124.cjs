'use strict';
// CHAT-443: Chat CRM = one conversation owner + customer context + work module.
// Icon is a visual child of an existing button, never a second action owner.
// Runtime, chat sending, data access, browser network and business logic unchanged.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const html=read('index.source.html');
const sprite=read('ui-library/icons-2027.svg');
const iconOwner=read('ui-icons.js');
const directory=read('contact-directory-admin.js');
const work=read('work-customer-summary.js');
const css=read('ui-foundation.css');

const symbols=new Set([...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map(m=>m[1]));
assert.ok(symbols.size>=60,'canonical 2027 icon library must be retained, not redrawn in Chat');
const uses=[...html.matchAll(/href="\.\/ui-library\/icons-2027\.svg#([^"]+)"/g)].map(m=>m[1]);
assert.ok(uses.length>=10,'CRM header/tab icons should use the shared library asset');
for(const symbol of uses)assert.ok(symbols.has(symbol),'missing canonical 2027 icon: '+symbol);
assert.ok(symbols.has('ui-icon-clipboard')&&symbols.has('ui-icon-image'),
  'same CRM navigation control must be able to change between Work and Photos');
assert.match(html,/data-crm-tab-owner="conversation-navigation"/);
assert.match(html,/data-crm-secondary-tab-icon/);
assert.match(html,/data-crm-secondary-tab-label/);
assert.match(directory,/querySelector\?\.\('\[data-crm-secondary-tab-label\]'\)/);
assert.match(directory,/querySelector\?\.\('use\[data-crm-secondary-tab-icon\]'\)/);
assert.match(directory,/visible\?'clipboard':'image'/);
assert.doesNotMatch(directory,/if\(right\.textContent!==wanted\)right\.textContent=wanted;\s*right\.setAttribute/,
  'do not erase a canonical SVG child when changing the secondary tab');

for(const action of ['profile','phone','photos','search','cash','debt','audio','video']){
 const match=html.match(new RegExp('<button[^>]*data-chat-header-action="'+action+'"[^>]*>([\\s\\S]*?)<\\/button>'));
 assert.ok(match,'must retain existing CRM action owner '+action);
 assert.match(match[1],/ui-library\/icons-2027\.svg#ui-icon-/,'action '+action+' must reuse canonical icon');
 assert.match(match[1],/aria-hidden="true"/,'icon must not replace accessible button name');
}
for(const id of ['composer-plus-btn','composer-mic-btn','send']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Composer '+id+' remains a single owner');
}
assert.match(html,/id="workThreadView"/);
assert.match(html,/data-work-summary-root/);
assert.match(directory,/data-contact-directory-section="chat"/);
assert.match(directory,/data-contact-directory-section="work"/);
assert.match(work,/function renderOverview\(/);
assert.match(css,/\.crm-ui-icon/);
assert.match(css,/pointer-events:none/);

const env={window:{},document:{}};
vm.runInNewContext(iconOwner,env,{filename:'ui-icons.js'});
const icons=env.window.V21Icons;
assert.equal(typeof icons.libraryMarkup,'function');
assert.equal(typeof icons.libraryNode,'function');
assert.match(icons.libraryMarkup('wallet',{size:20}),/icons-2027\.svg#ui-icon-wallet/);
assert.match(icons.libraryMarkup('wallet',{size:20}),/aria-hidden="true"/);
assert.equal(icons.libraryMarkup('wallet\" onload=\"alert(1)'),'', 'untrusted icon name must not produce markup');
assert.equal(typeof icons.markup,'function','existing ChatGPT-aligned composer icon owner is not replaced');

console.log('CHAT-443 Chat CRM canonical 2027 icons, same button owners and dynamic Work/Photos identity PASS');
