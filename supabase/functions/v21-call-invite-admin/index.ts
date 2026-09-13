import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AccessToken, TrackSource } from "npm:livekit-server-sdk@2.18.0";
import {
  INVITE_TTL_MS,
  hashInviteKey,
  inviteState,
  makeInviteKey,
  makeRoomName,
} from "./invite-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const PUBLIC_BASE='https://chat.taphoa.xyz/c/?k=';
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

function accessTokenFromRequest(req:Request){
  const header=clean(req.headers.get('authorization'),4000);
  if(!header.toLowerCase().startsWith('bearer '))return '';
  return clean(header.slice(7),4000);
}

async function requireAdmin(req:Request){
  const accessToken=accessTokenFromRequest(req);
  if(!accessToken)return {error:json({ok:false,error:'unauthorized'},401)};

  const userResult=await db.auth.getUser(accessToken);
  const user=userResult.data?.user;
  if(userResult.error||!user?.id)return {error:json({ok:false,error:'unauthorized'},401)};

  const account=await db.from("v21_accounts")
    .select('id,role,username,display_name')
    .eq('auth_user_id',user.id)
    .eq("role","admin")
    .is('deleted_at',null)
    .is('locked_at',null)
    .maybeSingle();
  if(account.error)return {error:json({ok:false,error:'account_lookup_failed'},500)};
  if(!account.data?.id)return {error:json({ok:false,error:'admin_required'},403)};
  return {user,account:account.data};
}

async function loadOwnedInvite(inviteId:string,userId:string){
  const result=await db.from('chat_call_invites')
    .select('id,room_name,contact_id,created_by_account_id,expires_at,opened_at,guest_joined_at,admin_joined_at,revoked_at,ended_at')
    .eq('id',inviteId)
    .eq('created_by_account_id',userId)
    .maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}

async function mintAdminToken(invite:any,account:any){
  const apiKey=String(Deno.env.get('LIVEKIT_API_KEY')||'').trim();
  const apiSecret=String(Deno.env.get('LIVEKIT_API_SECRET')||'').trim();
  if(!apiKey||!apiSecret||!LIVEKIT_SERVER_URL)throw new Error('livekit_configuration_missing');
  const participantName=clean(account?.display_name||account?.username||'TAPHOA',120)||'TAPHOA';
  const token=new AccessToken(apiKey,apiSecret,{
    identity:`admin:${String(account?.id||'')}:${String(invite.id)}`,
    name:participantName,
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

    const admin=await requireAdmin(req);
    if(admin.error)return admin.error;
    const {user,account}=admin;

    let body:any={};
    try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    const action=clean(body?.action,30);

    if(action==='create'){
      const contactId=clean(body?.contactId,200);
      if(!contactId)return json({ok:false,error:'contact_required'},400);
      const inviteId=crypto.randomUUID();
      const rawKey=makeInviteKey();
      const keyHash=await hashInviteKey(rawKey);
      const roomName=makeRoomName(inviteId);
      const expiresAt=new Date(Date.now()+INVITE_TTL_MS).toISOString();
      const inserted=await db.from('chat_call_invites').insert({
        id:inviteId,
        key_hash:keyHash,
        room_name:roomName,
        contact_id:contactId,
        created_by_account_id:user.id,
        expires_at:expiresAt,
      }).select('id,expires_at').single();
      if(inserted.error)return json({ok:false,error:'invite_create_failed'},500);
      return json({
        ok:true,
        inviteId:String(inserted.data.id),
        url:`${PUBLIC_BASE}${encodeURIComponent(rawKey)}`,
        expiresAt:String(inserted.data.expires_at),
      });
    }

    if(action==='join'){
      const inviteId=clean(body?.inviteId,80);
      if(!inviteId)return json({ok:false,error:'invite_required'},400);
      const invite=await loadOwnedInvite(inviteId,user.id);
      if(!invite)return json({ok:false,error:'invite_not_found'},404);
      if(inviteState(invite)!=='active')return json({ok:false,error:'invite_not_active'},410);
      try{
        const participantToken=await mintAdminToken(invite,account);
        return json({ok:true,serverUrl:LIVEKIT_SERVER_URL,participantToken,inviteId,expiresAt:invite.expires_at});
      }catch(error){
        console.error('[v21-call-invite-admin:join]',error);
        return json({ok:false,error:'livekit_token_failed'},500);
      }
    }

    if(action==='connected'){
      const inviteId=clean(body?.inviteId,80);
      if(!inviteId)return json({ok:false,error:'invite_required'},400);
      const invite=await loadOwnedInvite(inviteId,user.id);
      if(!invite)return json({ok:false,error:'invite_not_found'},404);
      if(inviteState(invite)!=='active')return json({ok:false,error:'invite_not_active'},410);
      if(!invite.admin_joined_at){
        const updated=await db.from('chat_call_invites')
          .update({admin_joined_at:new Date().toISOString()})
          .eq('id',inviteId)
          .eq('created_by_account_id',user.id);
        if(updated.error)return json({ok:false,error:'invite_update_failed'},500);
      }
      return json({ok:true});
    }

    if(action==='revoke'){
      const inviteId=clean(body?.inviteId,80);
      if(!inviteId)return json({ok:false,error:'invite_required'},400);
      const invite=await loadOwnedInvite(inviteId,user.id);
      if(!invite)return json({ok:false,error:'invite_not_found'},404);
      const updated=await db.from('chat_call_invites')
        .update({revoked_at:new Date().toISOString()})
        .eq('id',inviteId)
        .eq('created_by_account_id',user.id)
        .is('revoked_at',null)
        .is('ended_at',null);
      if(updated.error)return json({ok:false,error:'invite_update_failed'},500);
      return json({ok:true});
    }

    if(action==='end'){
      const inviteId=clean(body?.inviteId,80);
      if(!inviteId)return json({ok:false,error:'invite_required'},400);
      const invite=await loadOwnedInvite(inviteId,user.id);
      if(!invite)return json({ok:false,error:'invite_not_found'},404);
      const updated=await db.from('chat_call_invites')
        .update({ended_at:new Date().toISOString()})
        .eq('id',inviteId)
        .eq('created_by_account_id',user.id)
        .is('ended_at',null);
      if(updated.error)return json({ok:false,error:'invite_update_failed'},500);
      return json({ok:true});
    }

    return json({ok:false,error:'invalid_action'},400);
  }catch(error){
    console.error('[v21-call-invite-admin]',error);
    return json({ok:false,error:'internal_error'},500);
  }
});
