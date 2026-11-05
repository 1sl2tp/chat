// Auth/PWA: a previously approved iPhone must not silently become a new
// pending device when only localStorage loses its device UUID.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','auth-session-store.js'),'utf8');
const shellSource=fs.readFileSync(path.join(__dirname,'..','shell.js'),'utf8');
const APPROVED='11111111-1111-4111-8111-111111111111';
const GENERATED='22222222-2222-4222-8222-222222222222';

async function launch({localKey='',cookieKey='',localWritable=true,cookieWritable=true,status='active'}={}){
  const storage=new Map();
  if(localKey)storage.set('taphoa.v21.deviceKey',localKey);
  const cookies=new Map();
  if(cookieKey)cookies.set('taphoa_v21_device_key',cookieKey);
  const observed={generated:0,signOuts:0,boots:[],errors:[],authenticated:[],currentStatus:status};
  const document={
    get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},
    set cookie(input){
      if(!cookieWritable)return;
      const [key,value]=String(input).split(';')[0].split('=');
      cookies.set(key,value);
    },
    visibilityState:'visible',
    addEventListener(){},
    dispatchEvent(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    getElementById(){return null;}
  };
  const localStorage={
    getItem(key){return storage.get(key)||null;},
    setItem(key,value){if(!localWritable)throw new Error('storage_denied');storage.set(key,value);}
  };
  const account={id:'admin-account',username:'admin',role:'admin',display_name:'Admin'};
  const authSession={access_token:'test-token'};
  const client={
    auth:{
      getSession:async()=>({data:{session:authSession},error:null}),
      signOut:async()=>{observed.signOuts++;return{error:null};},
      signInWithPassword:async()=>({error:null}),
      onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}
    },
    rpc:async(name,params)=>{
      if(name!=='v21_auth_bootstrap')throw new Error('unexpected RPC: '+name);
      observed.boots.push(params.p_device_key);
      return{data:{
        account,
        device_approval_required:observed.currentStatus==='approval_required',
        session:{
          status:observed.currentStatus,
          app_session_id:observed.currentStatus==='active'?'app-session':null,
          device_id:'device-id'
        }
      },error:null};
    },
    realtime:{setAuth:async()=>{}}
  };
  const window={
    V21RuntimeId:{create(){observed.generated++;return GENERATED;}},
    supabase:{createClient(){return client;}},
    ChatAppShell:{
      AuthUI:{
        setAuthenticated(flag){observed.authenticated.push(flag);},
        setError(value){observed.errors.push(value);},
        setMode(){},
        clearContacts(){}
      },
      NavigationCommand:{openChat(){}},
      ScreenSession:{restore(){}}
    },
    setInterval(){return 42;},
    clearInterval(){},
    setTimeout(){return 41;},
    clearTimeout(){},
    addEventListener(){}
  };
  const context={window,document,localStorage,location:{protocol:'https:'},
    navigator:{userAgent:'iPhone',onLine:true},console,
    CustomEvent:class{constructor(type,props){this.type=type;this.detail=props?.detail;}}};
  vm.createContext(context);
  vm.runInContext(source,context,{timeout:3000});
  await new Promise(resolve=>setImmediate(resolve));
  return{
    observed,storage,cookies,
    store:window.V21AuthSessionStore,
    setStatus(next){observed.currentStatus=next;}
  };
}

(async()=>{
  const first=await launch({localKey:APPROVED});
  assert.equal(first.store.snapshot().state,'AUTHENTICATED');
  assert.deepEqual(first.observed.boots,[APPROVED]);
  assert.equal(first.observed.generated,0);
  assert.equal(first.cookies.get('taphoa_v21_device_key'),APPROVED,'approved key must be backed up');

  const restored=await launch({cookieKey:APPROVED});
  assert.equal(restored.store.snapshot().state,'AUTHENTICATED');
  assert.deepEqual(restored.observed.boots,[APPROVED],'cookie recovers approved device identity');
  assert.equal(restored.storage.get('taphoa.v21.deviceKey'),APPROVED,'localStorage self-heals');
  assert.equal(restored.observed.generated,0,'never create another device on recoverable storage loss');

  const pending=await launch({localKey:GENERATED,status:'approval_required'});
  assert.equal(pending.store.snapshot().state,'APPROVAL_PENDING');
  assert.equal(pending.observed.signOuts,0,'pending status must not delete valid Supabase auth session');
  assert.deepEqual(pending.observed.boots,[GENERATED]);
  assert(pending.observed.errors.includes('device_approval_required'));
  pending.setStatus('active');
  assert.equal(await pending.store.retryApproval(),true,'manual retry uses existing Auth session');
  assert.equal(pending.store.snapshot().state,'AUTHENTICATED');
  assert.deepEqual(pending.observed.boots,[GENERATED,GENERATED],'retry must retain original key');
  assert.equal(pending.observed.signOuts,0,'approval recovery must not issue signOut');

  const denied=await launch({localWritable:false,cookieWritable:false});
  assert.equal(denied.store.snapshot().state,'GUEST');
  assert.equal(denied.observed.boots.length,0,'never register an ephemeral device');
  assert(denied.observed.errors.includes('device_storage_unavailable'));

  assert(shellSource.includes("store?.snapshot?.().state==='APPROVAL_PENDING'"),
    'guest form must bypass password validation for pending-session retry');
  assert(shellSource.includes("void store.retryApproval?.()"));
  console.log('iOS PWA approved device backup, pending-session retry and fail-closed storage PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
