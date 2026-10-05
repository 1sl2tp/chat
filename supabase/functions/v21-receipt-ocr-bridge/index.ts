import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const MEDIA_BUCKET="v21-media";
const MAX_IMAGE_BYTES=12*1024*1024;
const BRIDGE_AUTH_CACHE_MS=15*60_000;
let cachedBridgeTokenHash="";
let cachedBridgeAuthAt=0;

function reply(status:number,body:unknown){
  return new Response(JSON.stringify(body),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
  });
}

async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

function clean(value:unknown,max=160){
  return String(value??"").trim().slice(0,max);
}

function validUuid(value:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"});
  const url=String(Deno.env.get("SUPABASE_URL")||"").trim();
  const service=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
  if(!url||!service)return reply(500,{ok:false,error:"server_config_missing"});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const bridgeToken=String(req.headers.get("x-bridge-token")||"");
  if(!bridgeToken)return reply(401,{ok:false,error:"unauthorized"});
  const tokenHash=await sha256Hex(bridgeToken);
  const configuredBridgeToken=String(Deno.env.get("ZALO_BRIDGE_TOKEN")||"").trim();
  if(configuredBridgeToken){
    if(await sha256Hex(configuredBridgeToken)!==tokenHash)return reply(403,{ok:false,error:"unauthorized"});
  }else{
    const now=Date.now();
    const cachedAuthorized=cachedBridgeTokenHash===tokenHash&&now-cachedBridgeAuthAt<BRIDGE_AUTH_CACHE_MS;
    if(!cachedAuthorized){
      const {data:authRow,error:authError}=await admin.from("v21_zalo_bridge_auth")
        .select("token_sha256").eq("id","primary").maybeSingle();
      if(authError)return reply(500,{ok:false,error:"auth_lookup_failed"});
      if(!authRow||String(authRow.token_sha256||"")!==tokenHash)return reply(403,{ok:false,error:"unauthorized"});
      cachedBridgeTokenHash=tokenHash;
      cachedBridgeAuthAt=now;
    }
  }

  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"});}
  const action=clean(body.action,40);
  const jobId=clean(body.job_id,80);
  if(!validUuid(jobId))return reply(400,{ok:false,error:"job_id_invalid"});

  if(action==="claim"){
    const {data:job,error:jobError}=await admin.from("v21_receipt_jobs")
      .select("id,status,media_asset_id,customer_account_id,attempt_count,started_at")
      .eq("id",jobId).maybeSingle();
    if(jobError)return reply(500,{ok:false,error:"job_lookup_failed"});
    if(!job)return reply(404,{ok:false,error:"job_not_found"});
    if(["applied","duplicate","rejected","needs_review"].includes(String(job.status||""))){
      return reply(200,{ok:true,skip:true,status:job.status});
    }

    const {data:account,error:accountError}=await admin.from("v21_accounts")
      .select("id,role,contact_group,deleted_at,locked_at")
      .eq("id",String(job.customer_account_id||"")).maybeSingle();
    if(accountError)return reply(500,{ok:false,error:"customer_lookup_failed"});
    const kh=Boolean(
      account&&account.role==="user"&&account.contact_group==="customer"&&!account.deleted_at&&!account.locked_at
    );
    if(!kh){
      await admin.from("v21_receipt_jobs").update({
        status:"rejected",error_code:"customer_group_not_kh",
        processed_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      }).eq("id",jobId);
      return reply(200,{ok:true,skip:true,status:"rejected"});
    }

    if(job.status==="processing"){
      const started=job.started_at?Date.parse(String(job.started_at)):0;
      if(started&&Date.now()-started<10*60_000)return reply(200,{ok:true,skip:true,status:"processing"});
      await admin.from("v21_receipt_jobs").update({
        status:"failed",error_code:"stale_processing_reclaimed",updated_at:new Date().toISOString(),
      }).eq("id",jobId).eq("status","processing");
    }

    const attempt=(Number(job.attempt_count)||0)+1;
    const nowIso=new Date().toISOString();
    const {data:claimed,error:claimError}=await admin.from("v21_receipt_jobs").update({
      status:"processing",attempt_count:attempt,started_at:nowIso,updated_at:nowIso,error_code:null,
    }).eq("id",jobId).in("status",["queued","failed"]).select("id,media_asset_id").maybeSingle();
    if(claimError)return reply(500,{ok:false,error:"job_claim_failed"});
    if(!claimed){
      const {data:latest}=await admin.from("v21_receipt_jobs").select("status").eq("id",jobId).maybeSingle();
      return reply(200,{ok:true,skip:true,status:latest?.status||"already_claimed"});
    }

    const {data:asset,error:assetError}=await admin.from("v21_media_assets")
      .select("id,kind,mime_type,size_bytes,storage_key,deleted_at")
      .eq("id",String(claimed.media_asset_id||"")).maybeSingle();
    if(assetError)return reply(500,{ok:false,error:"media_lookup_failed"});
    const mime=String(asset?.mime_type||"").toLowerCase();
    const size=Number(asset?.size_bytes)||0;
    const storageKey=String(asset?.storage_key||"").trim();
    if(!asset||asset.deleted_at||asset.kind!=="image"||!mime.startsWith("image/")||!storageKey||size<1||size>MAX_IMAGE_BYTES){
      await admin.from("v21_receipt_jobs").update({
        status:"failed",error_code:"source_image_invalid",processed_at:nowIso,updated_at:nowIso,
      }).eq("id",jobId);
      return reply(422,{ok:false,error:"source_image_invalid"});
    }

    const {data:signed,error:signError}=await admin.storage.from(MEDIA_BUCKET).createSignedUrl(storageKey,180);
    if(signError||!signed?.signedUrl){
      await admin.from("v21_receipt_jobs").update({
        status:"failed",error_code:"media_sign_failed",processed_at:nowIso,updated_at:nowIso,
      }).eq("id",jobId);
      return reply(500,{ok:false,error:"media_sign_failed"});
    }
    return reply(200,{
      ok:true,skip:false,job_id:jobId,signed_url:signed.signedUrl,mime_type:mime,size_bytes:size,
    });
  }

  if(action==="finalize"){
    const result=body.result&&typeof body.result==="object"?body.result:{};
    const {data,error}=await admin.rpc("v21_receipt_finalize_kh",{p_job_id:jobId,p_result:result});
    if(error)return reply(500,{ok:false,error:"receipt_finalize_failed"});
    return reply(200,{ok:true,status:data?.status||null,result:data});
  }

  if(action==="fail"){
    const errorCode=clean(body.error_code,120)||"receipt_ocr_failed";
    const nowIso=new Date().toISOString();
    const {error}=await admin.from("v21_receipt_jobs").update({
      status:"failed",error_code:errorCode,processed_at:nowIso,updated_at:nowIso,
    }).eq("id",jobId).in("status",["queued","processing","failed"]);
    if(error)return reply(500,{ok:false,error:"job_fail_update_failed"});
    return reply(200,{ok:true,status:"failed"});
  }

  return reply(400,{ok:false,error:"invalid_action"});
});
