'use strict';
// UI-255: verified component inventory + one canonical mobile visual owner.
// Avoid skinning over the same selector; validate actual established layout.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const begin=css.indexOf('/* UI-251 — WhatsApp-inspired mobile conversation hierarchy');
const mid=css.indexOf('/* UI-252 — mobile header geometry');
const end=css.indexOf('/* UI-253 — suppress duplicated Photos');
const owner=css.indexOf('/* UI-254 — WhatsApp-aligned directory dividers and typography');
assert(begin>=0 && mid>begin && end>mid && owner>end);
const older=css.slice(begin,mid);
const latest=css.slice(owner);
const header=css.slice(mid,end);
// Keep exactly one late mobile name/preview/time owner, not a cycle of overrides.
for(const selector of ['.shell-contact-name{','.shell-contact-preview{','.shell-contact-time{']){
  assert(!older.includes(selector),'UI-251 should not override UI-254: '+selector);
  assert(latest.includes(selector),'UI-254 should own directory typography: '+selector);
}
assert(!older.includes('.shell-contact-row:not([data-active="true"])'),
  'UI-251 must not define an independent full-bleed row separator');
// Header name must NOT sit in the center of a flex-grow label beside the avatar.
const tabLabel='#appShell[data-auth-state="authenticated"][data-route="chat"] #regionTop .top-mode-switch[data-contact-identity="true"] [data-chat-tab-label]{';
const labelAt=header.indexOf(tabLabel);
assert(labelAt>=0);
const labelStyle=header.slice(labelAt,header.indexOf('}',labelAt)).replace(/\s+/g,'');
for(const term of ['flex:11auto;','text-align:start;','min-width:0;','font-size:16px;','text-overflow:ellipsis;']){
  assert(labelStyle.includes(term),'header label consistency: '+term);
}
// Two independent screens and an existing business surface, not new routes.
assert(html.includes('data-top-tab="chat"'));
assert(html.includes('data-top-tab="photos"'));
assert(html.includes('id="chatQuickActions"'));
for(const op of ['cash','debt','photos','recent'])
  assert(html.includes('data-chat-quick="'+op+'"'),'retail shortcut preserved: '+op);
for(const filter of ['all','customer','cm','friend','other'])
  assert(directory.includes('data-contact-directory-filter="'+filter+'"'),'directory filter retained: '+filter);
assert(directory.includes('body.insertBefore(tools,nav);'),'tools remain above the only scrolling list');
assert(shell.includes('copy.append(title,preview,time);'),'contact metadata order unchanged');
assert(shell.includes("const showIdleCall=route==='chat'&&hasContact;"),
  'call buttons remain canonical, no fork');
assert(css.includes('SPEC-CHAT-MOBILE-DIRECTORY-VV-20261101'),
  'VisualViewport keyboard protection retained');
assert(css.includes('UI-253 — suppress duplicated Photos shortcut'),
  'do not reintroduce the duplicate Photos header');
const status=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1];
assert.equal(status,'pwa-chat-bank-report-signal-ui263-20261108',
  'ship one new PWA shell without clearing private caches');
console.log('UI-255 header title/album, directory owner uniqueness, filters, business actions and keyboard continuity PASS');
