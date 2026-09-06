const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','call-screen-wake-lock.js'),'utf8');
assert(!/Notification|PushManager|serviceWorker/i.test(code),'wake-lock module must not add notification/push behavior');

function makeHarness({withWakeLock=true}={}){
  const listeners={};
  let wakeRequests=0;
  let releases=0;
  function on(target,type,fn){(listeners[target+':'+type]??=[]).push(fn);}
  function dispatch(target,type,detail={}){
    for(const fn of listeners[target+':'+type]||[])fn({type,detail});
  }
  function makeSentinel(){
    const releaseListeners=[];
    return{
      released:false,
      addEventListener(type,fn){if(type==='release')releaseListeners.push(fn);},
      async release(){
        if(this.released)return;
        this.released=true;
        releases+=1;
        for(const fn of releaseListeners.splice(0))fn({type:'release'});
      }
    };
  }
  const navigator=withWakeLock?{
    wakeLock:{
      async request(kind){
        assert.strictEqual(kind,'screen');
        wakeRequests+=1;
        return makeSentinel();
      }
    }
  }:{};
  const document={
    visibilityState:'visible',
    addEventListener(type,fn){on('document',type,fn);}
  };
  const window={
    addEventListener(type,fn){on('window',type,fn);}
  };
  const ctx={window,document,navigator,String,Boolean,Object,Promise,console};
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  return{
    ctx,document,
    dispatch:(type,detail={})=>dispatch('document',type,detail),
    pagehide:()=>dispatch('window','pagehide',{}),
    counts:()=>({wakeRequests,releases})
  };
}

async function flush(){
  await Promise.resolve();
  await Promise.resolve();
}

(async()=>{
  const h=makeHarness();
  h.dispatch('call-state',{state:'CONNECTING_AUDIO'});
  await flush();
  assert.deepStrictEqual(h.counts(),{wakeRequests:0,releases:0},'connecting must not hold wake lock');

  h.dispatch('call-state',{state:'ACTIVE_AUDIO'});
  await flush();
  assert.strictEqual(h.counts().wakeRequests,1,'ACTIVE_AUDIO must request one screen wake lock');
  assert.strictEqual(h.ctx.window.V21CallScreenWakeLock.snapshot().held,true);

  h.dispatch('call-state',{state:'ACTIVE_AUDIO'});
  await flush();
  assert.strictEqual(h.counts().wakeRequests,1,'repeated ACTIVE_AUDIO must not duplicate the wake lock');

  h.document.visibilityState='hidden';
  h.dispatch('visibilitychange');
  await flush();
  assert.strictEqual(h.counts().releases,1,'hidden document must release the wake lock');

  h.document.visibilityState='visible';
  h.dispatch('visibilitychange');
  await flush();
  assert.strictEqual(h.counts().wakeRequests,2,'returning visible during ACTIVE_AUDIO must reacquire');

  h.dispatch('call-state',{state:'IDLE'});
  await flush();
  assert.strictEqual(h.counts().releases,2,'IDLE must release the active wake lock');

  const unsupported=makeHarness({withWakeLock:false});
  unsupported.dispatch('call-state',{state:'ACTIVE_AUDIO'});
  await flush();
  assert.deepStrictEqual(unsupported.counts(),{wakeRequests:0,releases:0},'unsupported browsers must degrade to no-op');

  console.log('V21.72.22 call screen wake lock PASS');
})().catch(error=>{console.error(error);process.exit(1);});
