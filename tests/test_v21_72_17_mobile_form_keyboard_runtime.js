const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','shell-form-viewport-policy.js'),'utf8');

class StyleMap{
  constructor(){this.map=new Map()}
  setProperty(k,v){this.map.set(k,String(v))}
  removeProperty(k){this.map.delete(k)}
  getPropertyValue(k){return this.map.get(k)||''}
}
function node({id='',classes=[],rect={top:0,bottom:0,height:0},parent=null}={}){
  const n={
    id,classes:new Set(classes),parentElement:parent,dataset:{},style:new StyleMap(),scrollTop:0,
    rect:{...rect},
    getBoundingClientRect(){return{...this.rect}},
    matches(sel){
      if(sel==='input,textarea,select,[contenteditable="true"]')return this.isField===true;
      return false;
    },
    closest(sel){
      let cur=this;
      while(cur){
        if(sel==='#guestAuthThread'&&cur.id==='guestAuthThread')return cur;
        if(sel==='.shell-profile-card'&&cur.classes?.has('shell-profile-card'))return cur;
        if(sel==='.shell-profile-overlay'&&cur.classes?.has('shell-profile-overlay'))return cur;
        cur=cur.parentElement;
      }
      return null;
    },
    querySelector(sel){return this.queries?.[sel]||null}
  };
  return n;
}

const auth=node({id:'guestAuthThread',rect:{top:80,bottom:360,height:280}});
const authAction=node({rect:{top:300,bottom:344,height:44},parent:auth});
auth.queries={'.guest-auth-primary':authAction};
const authField=node({rect:{top:318,bottom:362,height:44},parent:auth});authField.isField=true;

const overlay=node({classes:['shell-profile-overlay'],rect:{top:0,bottom:380,height:380}});
const profile=node({classes:['shell-profile-card'],rect:{top:90,bottom:370,height:280},parent:overlay});
const save=node({rect:{top:322,bottom:366,height:44},parent:profile});
profile.queries={'.shell-profile-save':save};
const profileField=node({rect:{top:330,bottom:374,height:44},parent:profile});profileField.isField=true;

const listeners={};
let activeElement=null;
const document={
  get activeElement(){return activeElement},
  addEventListener(type,fn){listeners[type]=fn},
  dispatchEvent(){return true}
};
const vvListeners={};
const vv={height:700,offsetTop:0,addEventListener(type,fn){vvListeners[type]=fn}};
const rafQueue=[];
function flushRaf(){
  while(rafQueue.length){
    const batch=rafQueue.splice(0);
    for(const fn of batch)fn();
  }
}
const windowObj={
  visualViewport:vv,
  innerHeight:700,
  navigator:{maxTouchPoints:5,userAgent:'Android'},
  matchMedia:()=>({matches:true}),
  addEventListener(){},
  requestAnimationFrame(fn){rafQueue.push(fn);return rafQueue.length},
  cancelAnimationFrame(){}
};
class CE{constructor(type,init={}){this.type=type;this.detail=init.detail}}
const ctx={window:windowObj,document,navigator:windowObj.navigator,CustomEvent:CE,requestAnimationFrame:windowObj.requestAnimationFrame,cancelAnimationFrame:windowObj.cancelAnimationFrame,Math,Number,String,Boolean,Object,Array,Map,Set,Date,console};
vm.createContext(ctx);vm.runInContext(code,ctx);
const policy=ctx.window.V21ShellFormViewportPolicy;assert(policy);

activeElement=authField;
listeners.focusin({target:authField});
flushRaf();
vv.height=380;
vvListeners.resize();
flushRaf();
assert.strictEqual(auth.dataset.mobileKeyboard,'true');
assert.strictEqual(auth.style.getPropertyValue('--shell-form-keyboard-inset'),'320px');
assert.strictEqual(auth.style.getPropertyValue('--shell-form-vv-height'),'380px');
assert.strictEqual(auth.style.getPropertyValue('--shell-form-vv-top'),'0px');
assert(auth.scrollTop>0,'auth card must reveal focused field/action internally without changing outer geometry');

activeElement=profileField;
listeners.focusin({target:profileField});
flushRaf();
vvListeners.resize();
flushRaf();
assert.strictEqual(overlay.dataset.mobileKeyboard,'true');
assert.strictEqual(profile.style.getPropertyValue('--shell-form-keyboard-inset'),'320px');
assert.strictEqual(overlay.style.getPropertyValue('--shell-form-vv-height'),'380px');
assert.strictEqual(profile.style.getPropertyValue('--shell-form-vv-height'),'380px');
assert.strictEqual(overlay.style.getPropertyValue('--shell-form-vv-top'),'0px');
assert(profile.scrollTop>0,'profile card must reveal focused field/action internally without changing outer geometry');

vv.height=700;
vvListeners.resize();
flushRaf();
assert.notStrictEqual(overlay.dataset.mobileKeyboard,'true');
assert.notStrictEqual(auth.dataset.mobileKeyboard,'true');
assert.strictEqual(overlay.style.getPropertyValue('--shell-form-vv-height'),'700px');

console.log('V21.72.39 visual viewport form keyboard runtime PASS');
