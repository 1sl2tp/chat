import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Zalo,ThreadType} from 'zca-js';
import {createLoginState,createRequestHandler} from './login-server-core.mjs';
import {startZaloLogin} from './login-runtime.mjs';
import {createSupabaseSessionStore} from './session-store.mjs';
import {createContactSync,syncApiContacts,syncApiGroups} from './contact-sync.mjs';
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
const targetGroupName=String(process.env.ZALO_GROUP_FILTER||'').trim();
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
let outboundRetryTimer=0;
let linkedZaloIds=new Set();

async function refreshLinkedZaloIds(){
  if(!messageGateway){
    linkedZaloIds=new Set();
    return 0;
  }
  const ids=await messageGateway.listLinkedZaloIds();
  linkedZaloIds=new Set(ids);
  console.log(`[zalo-login] linked inbound routes ${linkedZaloIds.size}`);
  return linkedZaloIds.size;
}

async function sendOutboundRow(row){
  const media=Array.isArray(row?.media)?row.media.filter(Boolean):[];
  const kind=String(media[0]?.kind||'').toLowerCase();
  const threadType=String(row?.threadType||'user').toLowerCase()==='group'?ThreadType.Group:ThreadType.User;
  if(kind==='audio'){
    if(media.length!==1||String(row?.text||'').trim())throw new Error('mixed_audio_outbound_not_supported');
    const voiceUrl=String(media[0]?.signedUrl||'').trim();
    if(!/^https?:\/\//i.test(voiceUrl))throw new Error('invalid_signed_voice_url');
    return api.sendVoice({voiceUrl},row.zaloId,threadType);
  }
  if(media.some(asset=>String(asset?.kind||'').toLowerCase()==='audio'))throw new Error('mixed_audio_outbound_not_supported');
  const outgoing=await buildOutboundMessage(row);
  return api.sendMessage(outgoing,row.zaloId,threadType);
}

async function runOutboundPass(){
  if(!api||!messageGateway)return 0;
  const rows=await messageGateway.listOutbound(20);
  let retryDelayMs=0;
  for(const row of rows){
    try{
      const sent=await sendOutboundRow(row);
      const zaloMessageId=sent?.message?.msgId??sent?.attachment?.[0]?.msgId??sent?.msgId??null;
      await messageGateway.markOutboundResult({
        deliveryId:row.deliveryId,
        ok:true,
        zaloMessageId,
      });
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
      const nextAttempt=Math.max(1,(Number(row?.attemptCount)||0)+1);
      if(nextAttempt<5){
        const delay=Math.min(300_000,5_000*(2**nextAttempt))+1_000;
        retryDelayMs=Math.max(retryDelayMs,delay);
      }
    }
  }
  if(retryDelayMs)scheduleOutboundRetry(retryDelayMs);
  return rows.length;
}

const pollOutbound=createCoalescingRunner(runOutboundPass);

function scheduleOutboundRetry(delayMs=11_000){
  if(outboundRetryTimer)return;
  outboundRetryTimer=setTimeout(()=>{
    outboundRetryTimer=0;
    void pollOutbound();
  },Math.max(1_000,Number(delayMs)||11_000));
  outboundRetryTimer.unref?.();
}

const handler=createRequestHandler({
  state,
  qrPath,
  accessToken,
  signalTokenHash,
  outboundNow:pollOutbound,
  refreshLinks:refreshLinkedZaloIds,
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
      if(messageGateway){
        try{await refreshLinkedZaloIds();}
        catch(error){
          linkedZaloIds=new Set();
          console.warn('[zalo-login] linked route snapshot failed',String(error?.message||error));
        }
      }
      unbindIncoming=bindIncomingMessageListener({
        api,
        logger:console,
        onMessage:async event=>{
          if(!messageGateway)return;
          if(!linkedZaloIds.has(String(event?.zaloId||'')))return;
          try{
            let bridged;
            if(Array.isArray(event?.media)&&event.media.length){
              // Ask canonical Chat ownership before downloading any Zalo binary.
              // Unlinked Zalo traffic must not consume Render/Supabase media bandwidth.
              const target=await messageGateway.mediaTarget(event);
              if(!target?.needed)return;
              const binary=await downloadInboundMedia({api,media:event.media[0]});
              bridged=await messageGateway.ingestMedia(event,binary);
            }else{
              bridged=await messageGateway.ingestText(event);
            }
            if(!bridged?.messageId)return;
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
          if(targetGroupName){
            const groups=await syncApiGroups({api,sync:contactSync,filter:targetGroupName});
            console.log(`[zalo-login] group directory ${Number(groups?.total)||0}; target groups synced ${Number(groups?.matched)||0}: ${(groups?.names||[]).join(' | ')}`);
          }
        }catch(error){
          console.warn('[zalo-login] contacts sync failed',String(error?.message||error));
        }
      }
      if(messageGateway){
        void pollOutbound();
        void messageGateway.cleanupStorage()
          .then(result=>{if(result.deleted)console.log('[zalo-login] storage cleanup',result);})
          .catch(error=>console.warn('[zalo-login] storage cleanup failed',String(error?.message||error)));
        setInterval(()=>{
          void messageGateway.cleanupStorage()
            .then(result=>{if(result.deleted)console.log('[zalo-login] storage cleanup',result);})
            .catch(error=>console.warn('[zalo-login] storage cleanup failed',String(error?.message||error)));
        },6*60*60_000).unref();
        console.log('[zalo-login] outbound event signal enabled; no recurring message poll');
      }
    })
    .catch(()=>{});
});

const shutdown=()=>{
  if(outboundRetryTimer){clearTimeout(outboundRetryTimer);outboundRetryTimer=0;}
  try{unbindIncoming();}catch{}
  try{api?.listener?.stop?.();}catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
