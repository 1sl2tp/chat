import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildNotificationPayload, isGoneStatus, retryDelaySeconds } from "./push-core.mjs";

const headers={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-push-wake-token",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
};
const CLAIM_RPC="v21_admin_push_claim";
const RESULT_RPC="v21_admin_push_result";

function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function clean(value:unknown,max=4096){return String(value??"").trim().slice(0,max);}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return reply(405,{ok:false,code:"method_not_allowed"});

  const url=Deno.env.get("SUPABASE_URL")??"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY")??"";
  const vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY")??"";
  const vapidSubject=Deno.env.get("VAPID_SUBJECT")??"";
  if(!url||!service)return reply(500,{ok:false,code:"server_config_missing"});
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});

  let body:Record<string,unknown>={};
  try{body=await req.json();}catch{return reply(400,{ok:false,code:"invalid_json"});}
  const action=clean(body.action,64).toLowerCase();

  if(action === "drain"){
    // Task 3 owns wake authentication and delivery. Refuse delivery until then.
    void CLAIM_RPC; void RESULT_RPC; void webpush; void buildNotificationPayload; void isGoneStatus; void retryDelaySeconds;
    return reply(503,{ok:false,code:"drain_not_configured"});
  }

  const authHeader=req.headers.get("Authorization")??"";
  if(!anon||!authHeader)return reply(401,{ok:false,code:"unauthorized"});
  const userClient=createClient(url,anon,{
    global:{headers:{Authorization:authHeader}},
    auth:{autoRefreshToken:false,persistSession:false},
  });
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const authUser=userData?.user;
  if(userError||!authUser)return reply(401,{ok:false,code:"unauthorized"});
  const {data:caller,error:callerError}=await admin.from("v21_accounts")
    .select("id,role,locked_at,deleted_at")
    .eq("auth_user_id",authUser.id)
    .is("deleted_at",null)
    .maybeSingle();
  if(callerError||!caller||caller.role!=="admin"||caller.locked_at){
    return reply(403,{ok:false,code:"admin_required"});
  }

  if(action === "public_key"){
    if(!vapidPublic)return reply(503,{ok:false,code:"push_not_configured"});
    return reply(200,{ok:true,public_key:vapidPublic});
  }

  if(action === "subscribe"){
    const subscription=(body.subscription&&typeof body.subscription==="object")?body.subscription as Record<string,unknown>:{};
    const endpoint=clean(subscription.endpoint,4096);
    const keys=(subscription.keys&&typeof subscription.keys==="object")?subscription.keys as Record<string,unknown>:{};
    const p256dh=clean(keys.p256dh,1024);
    const auth=clean(keys.auth,1024);
    if(!endpoint.startsWith("https://")||!p256dh||!auth){
      return reply(400,{ok:false,code:"invalid_subscription"});
    }
    const deviceId=clean(body.device_id,128)||null;
    const platform=clean(body.platform,64)||null;
    const userAgent=clean(body.user_agent,512)||clean(req.headers.get("user-agent"),512)||null;
    const {data,error}=await admin.from("v21_push_subscriptions").upsert({
      account_id:caller.id,
      device_id:deviceId,
      endpoint,p256dh,auth,platform,user_agent:userAgent,
      enabled:true,failure_count:0,last_failure_at:null,updated_at:new Date().toISOString(),
    },{onConflict:"endpoint"}).select("id,enabled").single();
    if(error)return reply(400,{ok:false,code:"subscribe_failed"});
    return reply(200,{ok:true,subscription:{id:data.id,enabled:Boolean(data.enabled)}});
  }

  if(action === "unsubscribe"){
    const endpoint=clean(body.endpoint,4096);
    if(!endpoint)return reply(400,{ok:false,code:"endpoint_required"});
    const {error}=await admin.from("v21_push_subscriptions")
      .update({enabled:false,updated_at:new Date().toISOString()})
      .eq("account_id",caller.id)
      .eq("endpoint",endpoint);
    if(error)return reply(400,{ok:false,code:"unsubscribe_failed"});
    return reply(200,{ok:true});
  }

  if(action === "status"){
    const endpoint=clean(body.endpoint,4096);
    let query=admin.from("v21_push_subscriptions")
      .select("id,enabled,platform,updated_at")
      .eq("account_id",caller.id);
    if(endpoint)query=query.eq("endpoint",endpoint);
    const {data,error}=await query.order("updated_at",{ascending:false}).limit(1).maybeSingle();
    if(error)return reply(400,{ok:false,code:"status_failed"});
    return reply(200,{ok:true,enabled:Boolean(data?.enabled),subscription:data??null});
  }

  // Keep the VAPID secret names present only for server delivery configuration.
  if(vapidPublic&&vapidPrivate&&vapidSubject){
    webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);
  }
  return reply(400,{ok:false,code:"invalid_action"});
});
