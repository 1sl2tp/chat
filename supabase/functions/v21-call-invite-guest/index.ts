import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AccessToken, TrackSource } from "npm:livekit-server-sdk@2.18.0";
import { hashInviteKey, publicInviteState } from "./invite-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const LIVEKIT_SERVER_URL=String(Deno.env.get('LIVEKIT_SERVER_URL')||'wss://taphoa-chat-dvo9mem2.livekit.cloud').trim();
const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'POST,OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'access-control-max-age':'600',
  'vary':'Origin',
};

function clean(value:unknown,max=500){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...corsHeaders},
  });
}

async function findInvite(key:string){
  if(key.length<20||key.length>200)return null;
  const keyHash=await hashInviteKey(key);
  const result=await db.from('chat_call_invites')
    .select('id,room_name,expires_at,opened_at,guest_joined_at,revoked_at,ended_at')
    .eq('key_hash',keyHash)
    .maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}

async function mintGuestToken(invite:any){
  const apiKey=String(Deno.env.get('LIVEKIT_API_KEY')||'').trim();
  const apiSecret=String(Deno.env.get('LIVEKIT_API_SECRET')||'').trim();
  if(!apiKey||!apiSecret||!LIVEKIT_SERVER_URL)throw new Error('livekit_configuration_missing');
  const token=new AccessToken(apiKey,apiSecret,{
    identity:`guest:${String(invite.id)}`,
    name:'Khách',
    ttl:'10m',
  });
  token.addGrant({
    roomJoin:true,
    room:String(invite.room_name),
    canSubscribe:true,
    canPublish:true,
    canPublishData:false,
    canPublishSources:[TrackSource.MICROPHONE],
  });
  return await token.toJwt();
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);

    let body:any={};
    try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    const action=clean(body?.action,30);
    const key=clean(body?.key,220);
    if(!key)return json({ok:false,error:'invalid_or_expired'},404);

    const invite=await findInvite(key);
    if(!invite||publicInviteState(invite)!=='active')return json({ok:false,error:'invalid_or_expired'},410);

    if(action==='open'){
      if(!invite.opened_at){
        const updated=await db.from('chat_call_invites')
          .update({opened_at:new Date().toISOString()})
          .eq('id',invite.id)
          .is('opened_at',null);
        if(updated.error)return json({ok:false,error:'invite_update_failed'},500);
      }
      const expiresAt=String(invite.expires_at);
      return json({ok:true,status:'ready',expiresAt});
    }

    if(action==='join'){
      try{
        const participantToken=await mintGuestToken(invite);
        return json({ok:true,serverUrl:LIVEKIT_SERVER_URL,participantToken,expiresAt:String(invite.expires_at)});
      }catch(error){
        console.error('[v21-call-invite-guest:join]',error);
        return json({ok:false,error:'livekit_token_failed'},500);
      }
    }

    if(action==='connected'){
      if(!invite.guest_joined_at){
        const updated=await db.from('chat_call_invites')
          .update({guest_joined_at:new Date().toISOString()})
          .eq('id',invite.id)
          .is('guest_joined_at',null);
        if(updated.error)return json({ok:false,error:'invite_update_failed'},500);
      }
      return json({ok:true});
    }

    return json({ok:false,error:'invalid_action'},400);
  }catch(error){
    console.error('[v21-call-invite-guest]',error);
    return json({ok:false,error:'internal_error'},500);
  }
});
