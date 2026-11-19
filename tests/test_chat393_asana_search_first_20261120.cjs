'use strict';
// CHAT-393: Asana-informed search-first visual hierarchy.
// Source-contract only; no messages, storage, DB, or external side effects.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const platform=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const owner=css.slice(css.indexOf('/* CHAT-388 —'),css.indexOf('/* CHAT-AXIS-'));
assert(owner.length>1000,'single directory owner missing');
assert.equal((directory.match(/class="contact-directory-search" type="search"/g)||[]).length,1,'one search input');
assert(owner.includes('grid-template-areas:"search" "filters" "results";'),'compact two-row Top 2');
assert(owner.includes('grid-template-areas:"search" "filters" "results";'),'top search with filters when keyboard dismissed');
assert(owner.includes('grid-template-areas:"search" "results";'),'top search with keyboard');
assert.equal((owner.match(/grid-area:results;/g)||[]).length,1,'one scroll owner');
assert(owner.includes('.contact-directory-search-field[data-expanded="true"]'),'expanded visual owner');
assert(owner.includes('border-bottom:1px solid'),'search separates from list');
assert(!owner.includes('position:fixed'),'do not create second viewport owner');
assert(directory.includes('input.focus({preventScroll:true})'),'focus remains on tap');
assert(directory.includes("input.addEventListener('blur',reconcileSearchOnDismiss)"),'native keyboard dismissal');
assert(directory.includes('if(!resultPointerDown)return;'),'search row tap preservation');
assert(platform.includes("owner.kind==='directory'||owner.kind==='message-forward'"),'platform owns keyboard');
console.log('CHAT-393 search-first mobile directory contract PASS');