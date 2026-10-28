const fs=require('fs');
const assert=require('assert');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'shell.js'),'utf8');
const directory=fs.readFileSync(path.join(root,'contact-directory-admin.js'),'utf8');
assert.equal((shell.match(/document\.addEventListener\('keydown',handleShellOverlayKeydown\)/g)||[]).length,1);
assert(!shell.includes("if(profileOverlay){closeProfileEditor();return;}"),'old lower-priority Escape path must be retired');
const start=shell.indexOf('function handleShellOverlayKeydown(event){');
const end=shell.indexOf("\ndocument.addEventListener('keydown',handleShellOverlayKeydown);",start);
assert(start>=0&&end>start,'one shell-owned keyboard dispatcher');
const key=shell.slice(start,end);
assert(key.includes('if(event.defaultPrevented)return;'));
assert(key.includes('if(closeProfileDeleteConfirmation({restoreFocus:true}))return;'));
assert(key.indexOf('closeProfileDeleteConfirmation')<key.indexOf('closeProfileEditor()'));
assert(key.includes("if(activeMode!=='NONE')return;"));
assert(key.includes('event.stopImmediatePropagation()'));
assert(key.includes('focus({preventScroll:true})'));
assert(directory.includes('syncDirectoryRows({reorder:false})'));
assert(directory.includes('if(reorder){'));
assert(directory.includes('new MutationObserver(scheduleSync).observe(overlayRoot,{childList:true});'));
assert(!directory.includes('new MutationObserver(scheduleSync).observe(overlayRoot,{childList:true,subtree:true});'));
console.log('Chat UI single-owner Escape, directory and overlay contract PASS');
 
// Exercise the extracted production dispatcher with stateful modal layers.
// This is a behavioral test, not only a textual token check.
const state={
  profileOverlay:{}, confirmVisible:true, closeProfileCount:0,
  accountMenuOpen:false, accountCloseCount:0,
  sidebarOpen:false, sidebarCloseCount:0, activeMode:'PROFILE_MODAL'
};
const first={focus(options){assert.equal(options.preventScroll,true);state.focused='first';}};
const last={focus(options){assert.equal(options.preventScroll,true);state.focused='last';}};
const context=vm.createContext({
  profileOverlay:state.profileOverlay,
  profileFocusable:()=>[first,last],
  document:{activeElement:first},
  closeProfileDeleteConfirmation(){
    if(!state.confirmVisible)return false;
    state.confirmVisible=false;
    return true;
  },
  closeProfileEditor(){
    state.closeProfileCount++;
    context.profileOverlay=null;
  },
  interactionController:()=>({snapshot:()=>({mode:context.activeMode})}),
  activeMode:'PROFILE_MODAL',
  accountMenuOpen:false,
  closeAccountMenu(){
    state.accountCloseCount++;
    context.accountMenuOpen=false;
  },
  sidebarOpen:false,
  setSidebar(value){
    state.sidebarCloseCount++;
    context.sidebarOpen=value;
  }
});
vm.runInContext(shell.slice(start,end)+'\nthis.dispatch=handleShellOverlayKeydown;',context);
function key(keyName,other={}){
  return {
    key:keyName,defaultPrevented:false,blocked:0,shiftKey:false,...other,
    preventDefault(){this.defaultPrevented=true;},
    stopImmediatePropagation(){this.blocked++;}
  };
}
let event=key('Escape');
context.dispatch(event);
assert.equal(state.confirmVisible,false,'first Escape only closes delete confirmation');
assert.equal(state.closeProfileCount,0);
assert.equal(event.blocked,1);
event=key('Escape');
context.dispatch(event);
assert.equal(state.closeProfileCount,1,'second Escape closes profile');
assert.equal(context.profileOverlay,null);
context.profileOverlay={};
context.document.activeElement=first;
event=key('Tab',{shiftKey:true});
context.dispatch(event);
assert.equal(state.focused,'last','Shift+Tab wraps within profile');
assert.equal(event.defaultPrevented,true);
context.document.activeElement=last;
event=key('Tab');
context.dispatch(event);
assert.equal(state.focused,'first','Tab wraps within profile');
context.profileOverlay=null;
context.accountMenuOpen=true;
context.activeMode='ACCOUNT_SETTINGS';
event=key('Escape');
context.dispatch(event);
assert.equal(state.accountCloseCount,0,'other overlay owner must take precedence');
context.activeMode='NONE';
event=key('Escape');
context.dispatch(event);
assert.equal(state.accountCloseCount,1);
assert.equal(event.blocked,1);
context.sidebarOpen=true;
event=key('Escape',{defaultPrevented:true});
context.dispatch(event);
assert.equal(state.sidebarCloseCount,0,'consumed Escape must not cascade');
event=key('Escape');
context.dispatch(event);
assert.equal(state.sidebarCloseCount,1);
assert.equal(context.sidebarOpen,false);
console.log('Chat UI keyboard dispatcher behavioral modal stack PASS');
