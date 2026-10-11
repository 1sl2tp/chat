'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const store=fs.readFileSync('auth-session-store.js','utf8');
const admin=fs.readFileSync('contact-directory-admin.js','utf8');

// One contact ordering owner; browser cannot automatically move the scroll
// position midway through a synchronous DOM reorder followed by restoration.
const start=source.indexOf('.wm-sidebar-navigation{');
const end=source.indexOf('}',start);
assert(start>=0&&end>start);
const css=source.slice(start,end);
assert.match(css,/overflow-y:auto;/);
assert.match(css,/overflow-anchor:none;/);
assert.match(css,/scroll-behavior:auto;/);
assert.match(shell,/const previousScrollTop=scrollHost\?\.scrollTop\|\|0;/);
assert.match(shell,/if\(scrollHost\)scrollHost\.scrollTop=previousScrollTop;/);
assert.match(store,/if\(activityChanged\)\{\s*sortContactsByActivity\(this\.contacts\);/);
assert.match(admin,/document\.addEventListener\('v21-contact-store-change',\(\)=>scheduleSync\(\)\);/);
assert.doesNotMatch(admin,/scheduleSync\(\{scrollToTop:true\}\)/);

// The only tail writer must position fresh content in the SAME task as
// append/renderWindow; rAF remains solely for bounded late geometry.
const a=app.indexOf("function scrollToTail(reason='explicit'");
const b=app.indexOf('\nfunction firstVisibleAnchor(){',a);
assert(a>=0&&b>a);
const fragment=app.slice(a,b);
const renderer=app.slice(app.indexOf('window.V21ConversationBridge={'));
assert(renderer.includes("if(policy.followTail)scrollToTail(remote?'remote-message':'new-message');"));
assert(renderer.includes("if(policy.followTail)scrollToTail('reconcile-new-message');"));
const hooks=[];
const root={scrollHeight:1200,clientHeight:500,scrollTop:30};
let token=0;
const scope={
  scrollRoot:root,conversationViewEpoch:1,pendingTailFrame:0,
  pendingTailToken:token,tailRevealTargetMessageId:'',
  pendingTailReason:'',cancelAnimationFrame(){},
  requestAnimationFrame(callback){hooks.push(callback);return hooks.length;},
  setScrollTop(v){root.scrollTop=Math.max(0,v);},
  claimTailIntent(){},
  hasUserScrollIntent(){return false;},
  updateScrollFromEndControl(){},distanceFromTail(){return 0;},
  tailGeometrySignature(){return ''},
  messageTurnById(){return null;},
  interactionAnchorVisibleBottomPx(){return 0;},
  Math
};
vm.createContext(scope);
vm.runInContext(fragment+';globalThis.runTail=scrollToTail;',scope);
for(const reason of ['remote-message','new-message','reconcile-new-message']){
  root.scrollTop=30;scope.runTail(reason);
  assert.equal(root.scrollTop,700,reason+' must position before next frame');
}
root.scrollTop=30;scope.runTail('user-arrow');
assert.equal(root.scrollTop,30,'explicit arrow keeps existing settle owner');
assert(hooks.length>=4,'late geometry settle remains present');
// No new data writer: all changes belong to ScrollRoot and directory CSS only.
console.log('PASS Chat fresh message tail prepaint, away/history contract, directory no-scroll-anchor');
