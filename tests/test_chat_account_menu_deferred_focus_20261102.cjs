'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// SPEC-CHAT-ACCOUNT-MENU-FOCUS-20261102: one deferred menu-focus owner.
// The focus must not fire after close, route change or a newer reopen.
const source=fs.readFileSync('shell.js','utf8');
const start=source.indexOf('function accountMenuElements(){');
const end=source.indexOf('\nfunction setSidebar(',start);
assert(start>=0&&end>start,'account menu owner changed');
assert(source.includes('let accountMenuFocusGeneration=0;'));
const script=source.slice(start,end);

let itemFocus=0,triggerFocus=0;
const item={
  focus(options){
    assert.equal(options.preventScroll,true);
    itemFocus++;
  }
};
const trigger={
  isConnected:true,
  attrs:{},
  setAttribute(k,v){this.attrs[k]=v;},
  focus(options){
    assert.equal(options.preventScroll,true);
    triggerFocus++;
  }
};
const menu={
  hidden:true,isConnected:true,
  querySelector(sel){
    assert.equal(sel,'button:not([hidden])');
    return item;
  }
};
const footer={
  dataset:{},
  querySelector(sel){
    if(sel==='[data-account-menu]')return menu;
    if(sel==='[data-account-self-edit]')return trigger;
    return null;
  }
};
const queue=[];
const ctx=vm.createContext({
  document:{querySelector(sel){
    assert.equal(sel,'[data-sidebar-account-footer]');
    return footer;
  }},
  window:{setTimeout(fn,delay){
    assert.equal(delay,0);
    queue.push(fn);
  }},
  authState:'AUTHENTICATED'
});
vm.runInContext('let accountMenuOpen=false;let accountMenuFocusGeneration=0;\n'+script+
  '\nthis.actions={open:openAccountMenu,close:closeAccountMenu,toggle:toggleAccountMenu};',ctx);
function flush(){for(const cb of queue.splice(0))cb();}
assert.equal(ctx.actions.open(),true);
assert.equal(menu.hidden,false);
assert.equal(trigger.attrs['aria-expanded'],'true');
flush();
assert.equal(itemFocus,1,'open menu focuses its first item once');

// Close immediately; the queued callback from the first opening is stale.
ctx.actions.open();
ctx.actions.close({restoreFocus:true});
assert.equal(menu.hidden,true);
assert.equal(triggerFocus,1,'closing restores the trigger');
flush();
assert.equal(itemFocus,1,'stale callback cannot refocus a hidden menu');

// Closing then reopening before timers run may only focus the latest menu.
ctx.actions.open();
ctx.actions.close();
ctx.actions.open();
flush();
assert.equal(itemFocus,2,'only the latest opening owns keyboard focus');

// The menu can be removed between click and the frame boundary.
ctx.actions.close();
ctx.actions.open();
menu.isConnected=false;
flush();
assert.equal(itemFocus,2,'unmounted menu cannot claim focus');
menu.isConnected=true;
ctx.actions.close();
assert.equal(menu.hidden,true);
console.log('CHAT account menu deferred focus / close / reopen / unmount PASS');
