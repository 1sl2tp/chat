'use strict';
// UI-256 — Restore ChatGPT-first visuals without changing any chat or business owners.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const composer=fs.readFileSync('mobile-chat-refresh.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const at=css.indexOf('/* UI-251 — WhatsApp-inspired mobile conversation hierarchy');
const owner=css.indexOf('/* UI-254 — WhatsApp-aligned directory dividers and typography');
assert(at>0&&owner>at,'retain the canonical mobile visual owner');
const mobile=css.slice(at),directory=css.slice(owner);
function rule(source,selector) {
 const start=source.indexOf(selector+'{');
 assert(start>=0,'Missing visual owner: '+selector);
 const from=start+selector.length+1;
 const end=source.indexOf('}',from);
 assert(end>from);
 return source.slice(from,end).replace(/\s+/g,'');
}
const root='#appShell[data-auth-state="authenticated"][data-route="chat"]';
const idle='#appShell[data-auth-state="authenticated"] #regionTop .top-mode-switch[data-contact-identity="false"]';
const switchRule=rule(mobile,idle);
for(const token of ['display:grid;','grid-template-columns:repeat(2,minmax(0,1fr));','width:min(100%,17.5rem);',
                    'min-height:48px;','justify-self:center;','border-radius:999px;'])
 assert(switchRule.includes(token),'centered ChatGPT-like pill: '+token);
const tabRule=rule(mobile,idle+' .top-mode-tab');
for(const token of ['position:static;','min-height:40px;','font-size:15px;','width:100%;'])
 assert(tabRule.includes(token),'both tabs stay in the segmented switch: '+token);
assert(!tabRule.includes('position:absolute;'),'Photos must not float into the right header rail');
const activeTab=rule(mobile,idle+' .top-mode-tab[aria-selected="true"]');
assert(activeTab.includes('background:var(--theme-surface-secondary)!important;'),
 'active tab uses the ChatGPT-like neutral capsule');
const search=rule(css.slice(css.indexOf('/* UI-240-MOBILE-DIRECTORY-RHYTHM-20261106')),'#appShell[data-auth-state="authenticated"] #shellNavigationLayer .contact-directory-search');
assert(search.includes('border-radius:999px!important;'),'directory search should be a calm pill');
const selected=rule(css,'#shellNavigationLayer .contact-directory-filter[data-active="true"]');
assert(selected.includes('background:var(--mobile-ui-soft)!important;')&&
 selected.includes('color:var(--theme-content-primary)!important;'));
const name=rule(directory,'#appShell[data-auth-state="authenticated"] #shellNavigationLayer .shell-contact-name');
assert(name.includes('font-size:15px;')&&name.includes('font-weight:600;'));
assert(rule(directory,'#appShell[data-auth-state="authenticated"] #shellNavigationLayer .shell-contact-row:not(:last-child)::after').includes('24%,transparent'));
assert(!mobile.includes('#d9f7df')&&!mobile.includes('#244b3a')&&!mobile.includes('#15372a'),
 'no WhatsApp green surfaces after the ChatGPT visual reset');
assert(!mobile.includes('.assistant-message-unit>.message-text{'),'incoming text stays on the reference canvas');
const outgoing=rule(mobile,root+' #messageWindow>.message-row[data-content-kind="text"] .user-message-unit>.message-text');
assert(outgoing.includes('var(--theme-surface-secondary)')&&outgoing.includes('color:var(--theme-content-primary)!important;'));
const compose=rule(composer,root+' #composerShell');
assert(compose.includes('grid-template-rows:autoautominmax(var(--ui-control-touch,44px),auto)var(--ui-control-touch,44px);'),
 'composer should have a full-width writing line above the action row');
const editor=rule(composer,root+' #editorWrap');
assert(editor.includes('grid-column:1/-1;')&&editor.includes('grid-row:3;'));
for(const id of ['composer-plus-btn','composer-mic-btn','send'])
 assert(rule(composer,root+' #'+id).includes('grid-row:4;'),'bottom action rail '+id);
assert(composer.includes('#composerShell[data-audio-state="RECORDING"]'),'recording geometry preserved');
assert(composer.includes('#stageLayout[data-keyboard-open="true"]'),'VisualViewport keyboard state unchanged');
for(const item of ['data-chat-quick="cash"','data-chat-quick="debt"','data-chat-quick="photos"','data-chat-quick="recent"',
                   'id="composer-mic-btn"','id="send" type="submit"','id="attachmentTray"'])
 assert(html.includes(item),'functional control preserved: '+item);
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-header-pill-ui257-20261107';"),
 'new public PWA epoch without deleting private caches');
console.log('UI-256 ChatGPT identity, directory, neutral bubbles, two-row composer and preserved keyboard/voice/business controls PASS');
