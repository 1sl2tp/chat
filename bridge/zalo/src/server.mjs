import http from 'node:http';
import path from 'node:path';
import {Zalo} from 'zca-js';
import {createLoginState,createRequestHandler} from './login-server-core.mjs';
import {startZaloLogin} from './login-runtime.mjs';
import {createSupabaseSessionStore} from './session-store.mjs';
import {createContactSync,syncApiContacts} from './contact-sync.mjs';
import {bindIncomingMessageListener} from './incoming-message.mjs';
import {createMessageGateway} from './message-gateway.mjs';

const port=Math.max(1,Number(process.env.PORT)||8787);
const qrPath=process.env.ZALO_QR_PATH||path.resolve(process.cwd(),'qr.png');
const accessToken=String(process.env.LOGIN_TOKEN||'').trim();
const supabaseUrl=String(process.env.SUPABASE_URL||'').trim();
const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
const bridgeToken=String(process.env.ZALO_BRIDGE_TOKEN||'').trim();
const sessionStore=supabaseUrl&&publishableKey&&bridgeToken
  ?createSupabaseSessionStore({supabaseUrl,publishableKey,bridgeToken})
  :null;
const contactSync=supabaseUrl&&bridgeToken
  ?createContactSync({endpoint:`${supabaseUrl.replace(/\/$/,'')}/functions/v1/v21-zalo-contacts`,bridgeToken})
  :null;
const messageGateway=supabaseUrl&&bridgeToken
  ?createMessageGateway({endpoint:`${supabaseUrl.replace(/\/$/,'')}/functions/v1/v21-zalo-bridge`,bridgeToken})
  :null;
const state=createLoginState();
let api=null;
let unbindIncoming=()=>{};
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
  console.log(`[zalo-login] contacts sync ${contactSync?'enabled':'disabled'}`);
  console.log(`[zalo-login] message bridge ${messageGateway?'enabled':'disabled'}`);
  void startZaloLogin({ZaloClass:Zalo,state,qrPath,logger:console,sessionStore})
    .then(async result=>{
      api=result;
      unbindIncoming=bindIncomingMessageListener({
        api,
        logger:console,
        onMessage:async event=>{
          console.log('[zalo-incoming]',JSON.stringify(event));
          if(!messageGateway)return;
          try{
            const bridged=await messageGateway.ingestText(event);
            console.log(`[zalo-bridge] inbound ${bridged?.messageId?'stored':'ignored'}`);
          }catch(error){
            console.warn('[zalo-bridge] inbound failed',String(error?.message||error));
          }
        },
      });
      console.log('[zalo-login] incoming text listener enabled');
      if(contactSync){
        try{
          const synced=await syncApiContacts({api,sync:contactSync});
          console.log(`[zalo-login] contacts synced ${Number(synced?.count)||0}`);
        }catch(error){
          console.warn('[zalo-login] contacts sync failed',String(error?.message||error));
        }
      }
      if(messageGateway){
        try{
          const synced=await messageGateway.syncLinkedAvatars();
          console.log(`[zalo-bridge] linked avatars synced ${Number(synced?.count)||0}`);
        }catch(error){
          console.warn('[zalo-bridge] linked avatar sync failed',String(error?.message||error));
        }
      }
    })
    .catch(()=>{});
});

const shutdown=()=>{
  try{unbindIncoming();}catch{}
  try{api?.listener?.stop?.();}catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
