'use strict';
// UI-344: read-only presentation and isolated arrow direction behavior.
// Never send messages, mutate contacts, or invoke external services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('contact-directory-admin.js','utf8');
const mobile=fs.readFileSync('mobile-ui-polish.css','utf8');
const from=src.indexOf('function syncFilterArrow(){');
const until=src.indexOf("  rail?.addEventListener('scroll',syncFilterArrow",{});
assert(from>0&&until>from,'single directory overflow arrow owner');
const fn=src.slice(from,until);
function scenario(scrollWidth,clientWidth,scrollLeft){
 const rail={scrollWidth,clientWidth,scrollLeft};
 const more={hidden:true,dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=String(v);}};
 const ctx=vm.createContext({rail,more});
 vm.runInContext('const {rail,more}=this;\n'+fn+'\nthis.update=syncFilterArrow;',ctx);
 ctx.update();
 return {rail,more,update:ctx.update};
}
let test=scenario(350,400,0);
assert.equal(test.more.hidden,true,'no arrow without overflow');
test=scenario(810,380,0);
assert.equal(test.more.hidden,false,'overflow reveals arrow');
assert.equal(test.more.dataset.direction,'next');
assert.equal(test.more.attributes['aria-label'],'Xem thêm nhóm');
test.rail.scrollLeft=430;test.update();
assert.equal(test.more.dataset.direction,'previous');
assert.equal(test.more.attributes['aria-label'],'Xem các nhóm trước');
test.rail.scrollLeft=2;test.update();
assert.equal(test.more.dataset.direction,'next');
assert(src.includes('data-contact-directory-filter-more data-direction="next"'),'initial arrow always has stable direction');
assert(src.includes('data-contact-directory-filter-more aria-label')===false,'direction is set before label not duplicated');
assert(src.includes('more?.addEventListener(\'click\''),'arrow click handler unchanged');
assert(src.includes('rail.scrollBy({left:atEnd?-rail.scrollWidth:Math.max(100,rail.clientWidth*.7),behavior:\'smooth\'})'),
 'click continues to scroll filter rail smoothly');
const style=src.slice(src.indexOf('/* UI-344: filter rail'));
assert(style.startsWith('/* UI-344'));
for(const token of [
 'min-height:44px;box-sizing:border-box;padding-inline:2px',
 'display:flex;align-items:center;gap:8px;',
 'align-items:center;gap:8px;flex:1 1 auto;',
 '-webkit-mask-image:linear-gradient',
 'mask-image:linear-gradient',
 'display:grid;place-items:center;align-self:center;flex:0 0 44px',
 'position:absolute;z-index:-1;inset:4px;',
 'border-radius:999px',
 'width:9px;height:9px',
 'border-top:2px solid currentColor;border-right:2px solid currentColor',
 'data-direction="previous"',
 '#appShell[data-auth-state="authenticated"] #shellNavigationLayer .contact-directory-filter-line{align-items:center;gap:8px!important;',
 'min-height:44px;gap:8px!important'
])assert(style.includes(token),'missing visual contract '+token);
assert(!style.includes('more.textContent=atEnd'),'no font-dependent arrow glyph');
assert(style.includes('.contact-directory-filter-more[hidden]{display:none!important}'),
 'hidden arrow should not reserve a permanent gap');
// This presentation patch must not override the existing compact directory
// list, native scroll owner or touch target settings.
assert(mobile.includes('UI-240-MOBILE-DIRECTORY-RHYTHM-20261106'));
assert(src.includes('const scrollHost=host.closest(\'.wm-sidebar-navigation\')'));
assert(src.includes("event.stopImmediatePropagation();"),'single header navigation owner remains');
console.log('UI-344: 36px optical ring in 44px hit target, centered filter rail, overflow and reversible chevron PASS');
