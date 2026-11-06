'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');

// BANK-242: the report lives beside, not inside, the Chat scrollRoot.
// In the old nesting the conversation's asynchronous scroll-to-tail could
// cover the heading with the sticky header on every re-open.
const bootStart=js.indexOf("const stage=document.getElementById('stageLayout');");
const bootEnd=js.indexOf('const ui={',bootStart);
assert(bootStart>0&&bootEnd>bootStart);
const stage={children:[],appendChild(node){this.children.push(node);node.parentElement=this;}};
const root={parentElement:{},scrollTop:180};
const doc={getElementById:id=>id==='stageLayout'?stage:id==='bankReportDashboard'?root:null};
const boot=vm.createContext({document:doc});
vm.runInContext('(function(){\\n'+js.slice(bootStart,bootEnd)+'\\n})();',boot,{timeout:1000});
assert.equal(root.parentElement,stage,'report must be moved out of the chat scroll container');
assert.equal(stage.children.length,1);

const activeCss=css.slice(css.indexOf('/* BANK-242:'),css.indexOf('.bank-report-dashboard{width:'));
for(const token of [
  '#stageLayout[data-bank-report-active="true"] #bankReportDashboard',
  'position:absolute;',
  'top:calc(var(--header-height,72px) + env(safe-area-inset-top,0px));',
  'bottom:0;',
  'overflow-y:auto;',
  'overscroll-behavior-y:contain;',
  'background:var(--theme-surface-primary,#fff);'
])assert(activeCss.includes(token),'missing independently anchored dashboard: '+token);
assert.match(activeCss,/#appShell\[data-route="chat"\] #regionTop\s*\{[^}]*flex:0 0 var\(--header-height,72px\)/);
assert.match(html,/#scrollRoot\s*\{[^}]*scroll-padding-top:var\(--scroll-root-safe-area-inset-top\)/s);

const paintStart=js.indexOf('function paint(data){');
const paintEnd=js.indexOf('function renderTable(data){',paintStart);
assert(paintStart>0&&paintEnd>paintStart);
const paint=js.slice(paintStart,paintEnd);
assert.match(paint,/const scrollOwner=root/);
assert.doesNotMatch(paint,/document\.getElementById\('scrollRoot'\)/,'data repaints must only retain report scroll, not chat scroll');

const resetStart=js.indexOf('function resetBankReportEntryScroll(){');
const resetEnd=js.indexOf('function synchronize(){',resetStart);
assert(resetStart>0&&resetEnd>resetStart);
const shared={scrollTop:165};
const report={scrollTop:255,isConnected:true};
const ctx=vm.createContext({
  root:report,active:true,
  document:{getElementById:id=>id==='scrollRoot'?shared:null},
  requestAnimationFrame:fn=>fn(),
  isReportContact:()=>true
});
vm.runInContext(js.slice(resetStart,resetEnd)+'\nresetBankReportEntryScroll();',ctx,{timeout:1000});
assert.equal(report.scrollTop,0,'report always starts at its own top');
assert.equal(shared.scrollTop,0,'chat owner is released on report entry');
shared.scrollTop=60; // A later Chat tail restore must NOT move the report.
assert.equal(report.scrollTop,0,'late chat scrolling cannot cover the report heading');
assert.match(html,/id="bankReportDashboard"/);
assert.match(html,/id="regionTop"/);
console.log('BANK-242 independent report scroll below header + normal order/chat header reserve PASS');
