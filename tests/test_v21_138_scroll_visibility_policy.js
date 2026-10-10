const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function section(start,end){
 const a=code.indexOf(start),b=code.indexOf(end,a);
 assert(a>=0&&b>a,'missing canonical source owner: '+start);
 return code.slice(a,b);
}
const policyCode=section('function appendScrollPolicy(', '\nfunction setUserDragging(');
function run(mode,{inserted=true,remote=true}={}){
 const vmCtx={
   VIEWPORT_STATES:{FOLLOW_TAIL:'FOLLOW_TAIL',USER_AWAY:'USER_AWAY'},
   viewport:{mode,returnToTail(){this.mode='FOLLOW_TAIL'}}
 };
 vm.createContext(vmCtx);
 vm.runInContext(policyCode+';globalThis.policy=appendScrollPolicy;',vmCtx);
 return{state:vmCtx.viewport,decision:vmCtx.policy({inserted,remote,messageIds:['new']})};
}
const away=run('USER_AWAY');
assert.equal(away.state.mode,'USER_AWAY','remote message cannot steal history reading position');
assert.equal(away.decision.followTail,false);
assert.equal(away.decision.preserve,'VIEW');
const tail=run('FOLLOW_TAIL');
assert.equal(tail.decision.followTail,true,'remote message follows if already at newest');
assert.equal(tail.decision.preserve,'AUTO');
assert.equal(run('USER_AWAY',{inserted:false,remote:true}).decision.followTail,false);
assert.equal(run('USER_AWAY',{inserted:true,remote:false}).decision.followTail,false);
const bridge=section('window.V21ConversationBridge={','\nwindow.ChatScreenModule=');
const replace=bridge.slice(bridge.indexOf('  replace(rows,'),bridge.indexOf('  reconcile(rows,'));
const restore=replace.slice(replace.indexOf("if(restoreHistory){"),replace.indexOf("}else{"));
assert(restore.indexOf('if(anchor)restoreAnchor(anchor);')<restore.indexOf('requestAnimationFrame(()=>'),'reading anchor must be placed before visible frame');
const latest=replace.slice(replace.indexOf('}else{'));
assert(latest.indexOf('setScrollTop(scrollRoot.scrollHeight-scrollRoot.clientHeight);')<latest.indexOf("scrollToTail('bridge-replace')"),'latest needs prepaint positioning');
assert.match(code,/if\(remote\)\{\s*const followTail=viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL/);
console.log('UI-138 remote-vs-history scroll and immediate open positioning PASS');
