import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Zalo,ThreadType} from 'zca-js';
import {createLoginState,createRequestHandler} from './login-server-core.mjs';
import {startZaloLogin} from './login-runtime.mjs';
import {createSupabaseSessionStore} from './session-store.mjs';
import {createContactSync,syncApiContacts} from './contact-sync.mjs';
import {bindIncomingMessageListener} from './incoming-message.mjs';
import {createMessageGateway} from './message-gateway.mjs';
import {downloadInboundMedia,buildOutboundMessage} from './media-transfer.mjs';
import {createCoalescingRunner} from './bridge-core.mjs';

const port=Math.max(1,Number(process.env.PORT)||8787);
const qrPath=process.env.ZALO_QR_PATH||path.resolve(process.cwd(),'qr.png');
const accessToken=String(process.env.LOGIN_TOKEN||'').trim();
const supabaseUrl=String(process.env.SUPABASE_URL||'').trim();
const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
const bridgeToken=String(process.env.ZALO_BRIDGE_TOKEN||'').trim();
const signalTokenHash=bridgeToken?createHash('sha256').update(bridgeToken).digest('hex'):'';
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
let outboundTimer=0;

async function sendOutboundRow(row){
  const media=Array.isArray(row?.media)?row.media.filter(Boolean):[];
  const kind=String(media[0]?.kind||'').toLowerCase();
  if(kind==='audio'){
    if(media.length!==1||String(row?.text||'').trim())throw new Error('mixed_audio_outbound_not_supported');
    const voiceUrl=String(media[0]?.signedUrl||'').trim();
    if(!/^https?:\/\//i.test(voiceUrl))throw new Error('invalid_signed_voice_url');
    return api.sendVoice({voiceUrl},row.zaloId,ThreadType.User);
  }
  if(media.some(asset=>String(asset?.kind||'').toLowerCase()==='audio'))throw new Error('mixed_audio_outbound_not_supported');
  const outgoing=await buildOutboundMessage(row);
  return api.sendMessage(outgoing,row.zaloId,ThreadType.User);
}

async function runOutboundPass(){
  if(!api||!messageGateway)return 0;
  const rows=await messageGateway.listOutbound(20);
  for(const row of rows){
    try{
      const sent=await sendOutboundRow(row);
      const zaloMessageId=sent?.message?.msgId??sent?.attachment?.[0]?.msgId??sent?.msgId??null;
      await messageGateway.markOutboundResult({
        deliveryId:row.deliveryId,
        ok:true,
        zaloMessageId,
      });
      console.log('[zalo-bridge] outbound sent',row.deliveryId,String(zaloMessageId??''));
    }catch(error){
      const message=String(error?.message||error);
      try{
        await messageGateway.markOutboundResult({
          deliveryId:row.deliveryId,
          ok:false,
          error:message,
        });
      }catch(markError){
        console.warn('[zalo-bridge] outbound result failed',String(markError?.message||markError));
      }
      console.warn('[zalo-bridge] outbound failed',row.deliveryId,message);
    }
  }
  return rows.length;
}

const pollOutbound=createCoalescingRunner(runOutboundPass);

const handler=createRequestHandler({
  state,
  qrPath,
  accessToken,
  signalTokenHash,
  outboundNow:pollOutbound,
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
          if(!messageGateway)return;
          try{
            let bridged;
            if(Array.isArray(event?.media)&&event.media.length){
              const binary=await downloadInboundMedia({api,media:event.media[0]});
              bridged=await messageGateway.ingestMedia(event,binary);
            }else{
              bridged=await messageGateway.ingestText(event);
            }
            console.log(`[zalo-bridge] inbound ${bridged?.messageId?'stored':'ignored'}`);
          }catch(error){
            console.warn('[zalo-bridge] inbound failed',String(error?.message||error));
          }
        },
      });
      console.log('[zalo-login] incoming message listener enabled');
      if(contactSync){
        try{
          const synced=await syncApiContacts({api,sync:contactSync});
          console.log(`[zalo-login] contacts synced ${Number(synced?.count)||0}`);
        }catch(error){
          console.warn('[zalo-login] contacts sync failed',String(error?.message||error));
        }
      }
      if(messageGateway){
        void pollOutbound();
        outboundTimer=setInterval(()=>{void pollOutbound();},60000);
        console.log('[zalo-login] outbound event signal enabled; fallback poll 60000ms');
      }
    })
    .catch(()=>{});
});

const shutdown=()=>{
  if(outboundTimer){clearInterval(outboundTimer);outboundTimer=0;}
  try{unbindIncoming();}catch{}
  try{api?.listener?.stop?.();}catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
