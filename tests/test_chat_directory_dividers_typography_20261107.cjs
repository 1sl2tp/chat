'use strict';
// UI-254 screenshot-informed compact list and inset line; no logic changes.
const assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker='UI-254 — WhatsApp-aligned directory dividers and typography';
assert.equal(css.split(marker).length-1,1,'one CSS owner');
const ui=css.slice(css.indexOf(marker));
assert(ui.includes('@media(max-width:63.999rem){'),'desktop must remain unchanged');
const prefix='#appShell[data-auth-state="authenticated"] #shellNavigationLayer ';
function rule(s){
  const at=ui.indexOf(prefix+s+'{');
  assert(at>=0,'selector missing: '+s);
  const from=at+(prefix+s+'{').length;
  return ui.slice(from,ui.indexOf('}',from)).replace(/\s+/g,'');
}
const inactive=rule('.shell-contact-row:not([data-active="true"])');
assert(inactive.includes('border-bottom:0;')&&inactive.includes('border-radius:0;'));
const line=rule('.shell-contact-row:not(:last-child)::after');
for(const token of ['content:"";','display:block;','position:absolute;',
  'inset-inline-start:calc(40px+10px+4px);','inset-inline-end:4px;','bottom:0;',
  'height:1px;','pointer-events:none;'])assert(line.includes(token),token);
const style=[
  ['.shell-contact-name',['font-size:16px;','font-weight:650;','line-height:20px;']],
  ['.shell-contact-preview',['font-size:13px;','font-weight:400;','line-height:18px;']],
  ['.shell-contact-time',['font-size:12px;','font-weight:400;','line-height:16px;','font-variant-numeric:tabular-nums;']]
];
for(const [sel,tokens] of style)for(const token of tokens)assert(rule(sel).includes(token),sel+' '+token);
const baseline=css.slice(css.indexOf('UI-240-MOBILE-DIRECTORY-RHYTHM-20261106'));
for(const t of ['height:60px!important;','grid-template-columns:40px minmax(0,1fr);','column-gap:10px;',
  'grid-template-rows:20px 18px;','row-gap:2px;','text-align:right;'])
  assert(baseline.includes(t),'compact rhythm '+t);
assert(html.includes('.shell-contact-avatar-wrap{position:relative;width:40px;height:40px;'));
assert(shell.includes('copy.append(title,preview,time);'),'single metadata owner');
assert(/^pwa-chat-/.test(sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'') &&
  !sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-directory-type-ui254-20261107';"),
  'a newer public shell is required for post-UI254 visual changes');
console.log('UI-254 inset separators, 60px list and type hierarchy PASS');
