import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.source.html',import.meta.url),'utf8');
const shortcuts=readFileSync(new URL('../admin-composer-actions.css',import.meta.url),'utf8');
const start=js.indexOf('function messageDayFloatingViewportTop(');
const end=js.indexOf('function messageDayFloatingQuickActionsBottom()',start);
assert(start>=0&&end>start,'floating badge geometry helper is missing');
const fn=vm.runInNewContext(js.slice(start,end)+';messageDayFloatingViewportTop;');

// Viewport coordinates: ScrollRoot top 14, header bottom 86.
// A customer has a visible 44px quick-actions row, other contacts do not.
assert.equal(fn(14,86,130),130,'customer: label must stay below shortcut row');
assert.equal(fn(14,86,null),86,'non-customer/group: no phantom toolbar offset');
assert.equal(fn(14,86,undefined),86,'group without shortcut row');
assert.equal(fn(14,86,NaN),86,'hidden/invalid shortcut row ignored');
assert.equal(fn(0,72,116),116,'mobile customer with toolbar');
assert.equal(fn(0,72,null),72,'mobile normal chat');
assert.equal(fn(25,10,null),25,'never position above scroll viewport');

assert(js.includes("actions.hidden||!actions.getClientRects().length"),
 'a toolbar hidden by route/keyboard CSS must not count');
assert(js.includes("messageDayFloating.style.setProperty('--message-day-floating-sticky-top'"),
 'sticky badge must share the measured boundary');
assert(js.includes('const cutoff=messageTop+6'),
 'inline day separator and floating date must use the same cutoff');
assert(js.includes("document.addEventListener('v21-contact-groups-change',scheduleMessageDayFloatingUpdate)"),
 'contact-type changes must trigger geometry refresh');
assert(js.includes("window.addEventListener('resize',scheduleMessageDayFloatingUpdate"),
 'rotation / responsive changes must trigger geometry refresh');
assert(html.includes('top:var(--message-day-floating-sticky-top,'),
 'CSS must consume measured offset instead of a fixed header height');
assert(shortcuts.includes('#chatQuickActions[hidden]'));
assert(shortcuts.includes('#stageLayout[data-bank-report-active="true"] #chatQuickActions'));
console.log('UI-195 floating date: customer toolbar and non-customer/group boundaries PASS');
