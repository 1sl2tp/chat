import http from 'node:http';
import path from 'node:path';
import {Zalo} from 'zca-js';
import {createLoginState,createRequestHandler} from './login-server-core.mjs';
import {startZaloLogin} from './login-runtime.mjs';
import {createSupabaseSessionStore} from './session-store.mjs';

const port=Math.max(1,Number(process.env.PORT)||8787);
const qrPath=process.env.ZALO_QR_PATH||path.resolve(process.cwd(),'qr.png');
const accessToken=String(process.env.LOGIN_TOKEN||'').trim();
const supabaseUrl=String(process.env.SUPABASE_URL||'').trim();
const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
const bridgeToken=String(process.env.ZALO_BRIDGE_TOKEN||'').trim();
const sessionStore=supabaseUrl&&publishableKey&&bridgeToken
  ?createSupabaseSessionStore({supabaseUrl,publishableKey,bridgeToken})
  :null;
const state=createLoginState();
let api=null;
const handler=createRequestHandler({
  state,
  qrPath,
  accessToken,
  listFriends:async()=>{
    if(!api||typeof api.getAllFriends!=='function')throw new Error('zalo_api_not_ready');
    return api.getAllFriends();
  },
});
const server=http.createServer((req,res)=>{
  Promise.resolve(handler(req,res)).catch(error=>{
    console.error('[zalo-login] http error',error);
    if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');}
    res.end(JSON.stringify({ok:false,error:'internal_error'}));
  });
});

server.listen(port,'0.0.0.0',()=>{
  console.log(`[zalo-login] web ready on :${port}`);
  if(!accessToken)console.warn('[zalo-login] LOGIN_TOKEN is empty; QR page is public');
  console.log(`[zalo-login] persistent session ${sessionStore?'enabled':'disabled'}`);
  void startZaloLogin({ZaloClass:Zalo,state,qrPath,logger:console,sessionStore})
    .then(result=>{api=result;})
    .catch(()=>{});
});

const shutdown=()=>{
  try{api?.listener?.stop?.();}catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
