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

function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function clean(value:unknown,max=4096){return String(value??"").trim().slice(0,max);}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}

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
    const wakeToken=req.headers.get("x-push-wake-token")??"";
    if(!wakeToken)return reply(401,{ok:false,code:"wake_required"});
    const wakeHash=await sha256Hex(wakeToken);
    const {data:wakeAuth,error:wakeError}=await admin.from("v21_admin_push_auth")
      .select("token_sha256").eq("id","primary").maybeSingle();
    if(wakeError)return reply(500,{ok:false,code:"wake_lookup_failed"});
    if(!wakeAuth||String(wakeAuth.token_sha256)!==wakeHash)return reply(403,{ok:false,code:"wake_invalid"});
    if(!vapidPublic||!vapidPrivate||!vapidSubject)return reply(503,{ok:false,code:"push_not_configured"});

    webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);
    const {data:claimed,error:claimError}=await admin.rpc("v21_admin_push_claim",{p_limit:20});
    if(claimError)return reply(500,{ok:false,code:"claim_failed"});

    let delivered=0;
    let disabled=0;
    let retried=0;
    const rows=Array.isArray(claimed)?claimed:[];

    for(const claim of rows){
      const outboxId=String(claim?.outbox_id??"");
      if(!outboxId)continue;
      const messageId=String(claim?.message_id??"");
      const recipientId=String(claim?.recipient_account_id??"");
      const senderId=String(claim?.sender_account_id??"");
      let transientError="";
      let terminal=false;

      try{
        const [recipientResult,senderResult,messageResult,mediaResult,subsResult]=await Promise.all([
          admin.from("v21_accounts").select("id,role,locked_at,deleted_at").eq("id",recipientId).maybeSingle(),
          admin.from("v21_accounts").select("id,role,display_name,username,locked_at,deleted_at").eq("id",senderId).maybeSingle(),
          admin.from("v21_messages").select("id,body,conversation_id,sender_account_id,deleted_at").eq("id",messageId).maybeSingle(),
          admin.from("v21_media_assets").select("kind,file_name,sort_index,deleted_at").eq("message_id",messageId).is("deleted_at",null).order("sort_index",{ascending:true}),
          admin.from("v21_push_subscriptions").select("id,endpoint,p256dh,auth,enabled,failure_count").eq("account_id",recipientId).eq("enabled",true),
        ]);
        const lookupError=recipientResult.error||senderResult.error||messageResult.error||mediaResult.error||subsResult.error;
        if(lookupError)throw lookupError;

        const recipient=recipientResult.data;
        const sender=senderResult.data;
        const message=messageResult.data;
        if(!recipient||recipient.role!=="admin"||recipient.locked_at||recipient.deleted_at||
           !sender||sender.role!=="user"||sender.locked_at||sender.deleted_at||
           !message||message.deleted_at||String(message.sender_account_id)!==senderId){
          terminal=true;
        }else{
          const subscriptions=Array.isArray(subsResult.data)?subsResult.data:[];
          const payload=buildNotificationPayload({
            outbox_id:outboxId,
            message_id:messageId,
            conversation_id:String(message.conversation_id??claim?.conversation_id??""),
            sender_account_id:senderId,
            sender_display_name:sender.display_name,
            sender_username:sender.username,
            body:message.body,
            media:mediaResult.data??[],
          });

          for(const subscription of subscriptions){
            const subscriptionId=String(subscription?.id??"");
            try{
              await webpush.sendNotification({
                endpoint:String(subscription.endpoint??""),
                keys:{p256dh:String(subscription.p256dh??""),auth:String(subscription.auth??"")},
              },JSON.stringify(payload),{TTL:60,urgency:"normal"});
              delivered++;
              await admin.from("v21_push_subscriptions").update({
                failure_count:0,last_success_at:new Date().toISOString(),last_failure_at:null,updated_at:new Date().toISOString(),
              }).eq("id",subscriptionId);
            }catch(error){
              const statusCode=Number((error as {statusCode?:unknown})?.statusCode||0);
              const messageText=clean((error as {message?:unknown})?.message||error,500)||"push_send_failed";
              if(isGoneStatus(statusCode)){
                disabled++;
                await admin.from("v21_push_subscriptions").update({
                  enabled:false,
                  failure_count:Number(subscription.failure_count||0)+1,
                  last_failure_at:new Date().toISOString(),
                  updated_at:new Date().toISOString(),
                }).eq("id",subscriptionId);
              }else{
                transientError=transientError||messageText;
                await admin.from("v21_push_subscriptions").update({
                  failure_count:Number(subscription.failure_count||0)+1,
                  last_failure_at:new Date().toISOString(),
                  updated_at:new Date().toISOString(),
                }).eq("id",subscriptionId);
              }
            }
          }
        }
      }catch(error){
        transientError=clean((error as {message?:unknown})?.message||error,500)||"push_delivery_failed";
      }

      if(transientError&&!terminal){
        retried++;
        const attempt=Number(claim?.attempt_count||1);
        void retryDelaySeconds(attempt);
        await admin.rpc("v21_admin_push_result",{
          p_outbox_id:outboxId,p_ok:false,p_error:transientError,p_dead:false,
        });
      }else{
        await admin.rpc("v21_admin_push_result",{
          p_outbox_id:outboxId,p_ok:true,p_error:null,p_dead:false,
        });
      }
    }

    return reply(200,{ok:true,claimed:rows.length,delivered,disabled,retried});
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

  return reply(400,{ok:false,code:"invalid_action"});
});
