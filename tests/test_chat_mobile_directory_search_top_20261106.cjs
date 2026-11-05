'use strict';
// UI-239: the compact directory should start at search, not reserve a
// redundant "Danh bạ" heading gap underneath the top Chat/Photos tabs.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'index.source.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'mobile-ui-polish.css'),'utf8');
const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const shell=fs.readFileSync(path.join(ROOT,'shell.js'),'utf8');

const marker='UI-239-MOBILE-DIRECTORY-SEARCH-TOP-20261106';
assert.equal(css.split(marker).length-1,1,'one compact directory rhythm owner');
const patch=css.slice(css.indexOf(marker));
assert(patch.includes('@media(max-width:63.999rem){'),
  'only narrow viewports may hide the title; desktop title must remain');
assert(!patch.includes('[data-mobile-directory='),
  'real shell does not set data-mobile-directory; selectors must be active');

const prefix='#appShell[data-auth-state="authenticated"] #shellNavigationLayer ';
function declarations(selector){
  const start=patch.indexOf(prefix+selector+'{');
  assert(start>=0,'scoped mobile rule missing: '+selector);
  const from=start+(prefix+selector+'{').length;
  const end=patch.indexOf('}',from);
  assert(end>from,'rule not closed: '+selector);
  return patch.slice(from,end).replace(/\s+/g,'');
}
assert(declarations('.wm-sidebar-sidebar').includes('padding-block-start:0!important;'),
  'remove ancestor top padding to bring search close to menu');
assert(declarations('.wm-sidebar-header').includes('display:none!important;'),
  'remove unused header grid track, not merely hide the text');
assert(declarations('.wm-sidebar-body').includes('padding-block-start:0!important;'),
  'no second title-to-tools padding');
assert(declarations('.contact-directory-tools').includes('padding-top:8px!important;'),
  'leave only a small breathing gap beneath top tabs');
assert(patch.trimEnd().endsWith('}'),
  'scoped mobile override must be the final stylesheet override');

// The visible title is redundant only in the authenticated narrow layout.
// Desktop directory still uses the heading, and the drawer has an accessible
// close path for guests and keyboard users even when compact header is hidden.
assert(html.includes('<h1 class="shell-wordmark">Danh bạ</h1>'));
assert(html.includes('<aside class="shell-navigation-panel" aria-label="Danh bạ">'));
assert(html.includes('<nav aria-label="Danh bạ" class="wm-sidebar-navigation">'));
assert(html.includes('class="shell-navigation-backdrop" type="button" aria-label="Đóng menu"'));
assert(html.includes('href="./mobile-ui-polish.css"'));
assert(shell.includes("const DESKTOP_DIRECTORY_QUERY='(min-width: 64rem)"));
assert(css.includes('#shellNavigationLayer .contact-directory-search{'));
assert(css.includes('min-height:44px!important;'),
  'search must remain touch-sized after moving upward');
assert(css.includes('#shellNavigationLayer[data-mobile-keyboard="true"]'),
  'VisualViewport/keyboard scroll owner must be retained');

// Rotate only the public shell. Never clear message IndexedDB or private media.
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-directory-search-top-ui239-20261106';"));
assert(sw.includes("const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH;"));
console.log('UI-239 narrow directory search-up/header-gap and PWA cache contract PASS');
