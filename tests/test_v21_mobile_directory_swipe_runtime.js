'use strict';
// Exercise the actual mobile gesture closure without mounting the full DOM.
// The test must never navigate into Work from a horizontal swipe.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('work-customer-summary.js','utf8');
const from=source.indexOf('function bindMobileHierarchySwipe(){');
const to=source.indexOf('\nfunction runMobileTopTabSingle(key){',from);
assert(from>=0&&to>from);

const handlers={};
const state={route:'chat',directory:true,contact:null,prior:null,opens:0,returns:0,prevented:0,stopped:0};
const app={addEventListener(type,callback){handlers[type]=callback;}};
const ctx={
  window:{innerWidth:390,V21InteractionController:{snapshot:()=>({mode:'NONE'})}},
  document:{getElementById:id=>id==='appShell'?app:null},
  mobileDirectoryAllowed:()=>true,
  shellSnapshot:()=>({route:state.route}),
  snapshot:()=>({state:'AUTHENTICATED'}),
  swipeIgnoredTarget:node=>Boolean(node?.blocked),
  mobileChatSwipeSurface:()=>true,
  mobileDirectoryOpen:()=>state.directory,
  activeContact:()=>state.contact,
  get mobileLastChatContact(){return state.prior;},
  mobileAccountMenu:null,
  showMobileDirectory:()=>{state.directory=true;state.contact=null;state.returns+=1;return true;},
  restoreLastMobileChatFromDirectory:()=>{
    if(!state.prior||!state.directory)return false;
    state.directory=false;state.contact=state.prior;state.opens+=1;return true;
  },
  MOBILE_CHAT_SWIPE_DISTANCE_PX:48,
  MOBILE_CHAT_SWIPE_EDGE_INSET_PX:28,
  MOBILE_CHAT_SWIPE_DOMINANCE:1.2,
  mobileSwipe:null
};
vm.createContext(ctx);
vm.runInContext(source.slice(from,to)+';bindMobileHierarchySwipe();',ctx);
assert(handlers.touchstart&&handlers.touchmove&&handlers.touchend&&handlers.touchcancel);

function swipe(dx,dy=0,{x=175,blocked=false}={}){
  const start={clientX:x,clientY:200};
  const end={clientX:x+dx,clientY:200+dy};
  const common={cancelable:true,preventDefault(){state.prevented++;},stopImmediatePropagation(){state.stopped++;}};
  handlers.touchstart({...common,target:{blocked},touches:[start]});
  handlers.touchmove({...common,touches:[end]});
  handlers.touchend({...common,changedTouches:[end]});
}
const noTransition=()=>{assert.equal(state.opens,0);assert.equal(state.returns,0);};
// Fresh directory: no selected conversation means no navigation at all.
swipe(85);swipe(-85);noTransition();
// Prior valid conversation: only right swipe from directory reopens it.
state.prior={id:'contact-A',name:'A'};
swipe(-85);noTransition();
swipe(12,90);noTransition(); // vertical scroll
swipe(85,0,{x:9});noTransition(); // system back zone
swipe(85,0,{blocked:true});noTransition(); // interactive target
swipe(90);assert.equal(state.opens,1);assert.equal(state.directory,false);
// Conversation: left swipe returns to directory. Right swipe is a no-op.
swipe(90);assert.equal(state.returns,0);
swipe(-90);assert.equal(state.returns,1);assert.equal(state.directory,true);
swipe(-90);assert.equal(state.returns,1);
// Work route is accessible only via a tab/button, never by swipe.
state.route='work';
swipe(-95);swipe(95);
assert.equal(state.opens,1);assert.equal(state.returns,1);
assert.equal(state.route,'work');
console.log('PASS: mobile directory/chat swipe matrix, no Work swipes and no-op safety');
