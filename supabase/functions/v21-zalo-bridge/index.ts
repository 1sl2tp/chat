import { createClient } from "npm:@supabase/supabase-js@2";

const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const MEDIA_BUCKET="v21-media";
const MEDIA_LIMIT=15*1024*1024;
function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}
function text(value:FormDataEntryValue|null){return typeof value==="string"?value.trim():"";}
function integer(value:FormDataEntryValue|null){const n=Number(text(value));return Number.isFinite(n)&&n>0?Math.round(n):null;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"});
  const url=Deno.env.get("SUPABASE_URL")??"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!service)return reply(500,{ok:false,error:"server_config_missing"});

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const bridgeToken=req.headers.get("x-bridge-token")??"";
  if(!bridgeToken)return reply(401,{ok:false,error:"unauthorized"});
  const tokenHash=await sha256Hex(bridgeToken);
  const {data:authRow,error:authError}=await admin.from("v21_zalo_bridge_auth").select("token_sha256").eq("id","primary").maybeSingle();
  if(authError)return reply(500,{ok:false,error:"auth_lookup_failed"});
  if(!authRow||authRow.token_sha256!==tokenHash)return reply(403,{ok:false,error:"unauthorized"});

  const contentType=(req.headers.get("content-type")??"").toLowerCase();
  if(contentType.includes("multipart/form-data")){
    let form:FormData;
    try{form=await req.formData();}catch{return reply(400,{ok:false,error:"invalid_multipart"});}
    const action=text(form.get("action"));
    if(action!=="ingress_media")return reply(400,{ok:false,error:"invalid_action"});

    const zaloId=text(form.get("zalo_id"));
    const zaloMessageId=text(form.get("zalo_message_id"));
    const body=text(form.get("body"));
    const eventAt=text(form.get("event_at"))||null;
    const kind=text(form.get("kind")).toLowerCase();
    const requestedMime=text(form.get("mime_type")).toLowerCase();
    const requestedFileName=text(form.get("file_name"));
    const widthPx=integer(form.get("width_px"));
    const heightPx=integer(form.get("height_px"));
    const file=form.get("file");
    if(!(file instanceof File)||!zaloId||!zaloMessageId||!['image','audio','file'].includes(kind)){
      return reply(400,{ok:false,error:"invalid_media"});
    }
    if(file.size<1||file.size>MEDIA_LIMIT)return reply(413,{ok:false,error:"media_size_out_of_range"});

    const mimeType=(requestedMime||file.type||"application/octet-stream").split(';',1)[0].trim().toLowerCase();
    const fileName=kind==="file"?(requestedFileName||file.name||"file").slice(0,255):null;
    if(kind==="image"&&!mimeType.startsWith("image/"))return reply(400,{ok:false,error:"image_type_required"});
    if(kind==='audio'&&!mimeType.startsWith('audio/'))return reply(400,{ok:false,error:"audio_type_required"});
    if(kind==="file"&&(!fileName||mimeType.startsWith("image/")||mimeType.startsWith("audio/"))){
      return reply(400,{ok:false,error:"file_type_required"});
    }

    const {data:target,error:targetError}=await admin.rpc("v21_zalo_media_target",{
      p_zalo_id:zaloId,p_zalo_message_id:zaloMessageId,p_event_at:eventAt,
    });
    if(targetError)return reply(500,{ok:false,error:"media_target_failed"});
    if(!target)return reply(200,{ok:true,message_id:null,asset_id:null});

    if(target.existing&&target.message_id){
      const {data:existingAsset}=await admin.from("v21_media_assets")
        .select("id").eq("message_id",target.message_id).is("deleted_at",null)
        .order("sort_index",{ascending:true}).limit(1).maybeSingle();
      return reply(200,{ok:true,message_id:target.message_id,asset_id:existingAsset?.id??null,idempotent_reuse:true});
    }

    const accountId=String(target.chat_account_id??"");
    const conversationId=String(target.conversation_id??"");
    if(!accountId||!conversationId)return reply(500,{ok:false,error:"media_target_invalid"});
    const assetId=crypto.randomUUID();
    const storageKey=`${accountId}/${conversationId}/${assetId}`;
    const {error:uploadError}=await admin.storage.from(MEDIA_BUCKET).upload(storageKey,file,{
      contentType:mimeType,cacheControl:"3600",upsert:false,
    });
    if(uploadError)return reply(500,{ok:false,error:"media_upload_failed"});

    const {data:stored,error:storeError}=await admin.rpc("v21_zalo_ingress_media",{
      p_zalo_id:zaloId,
      p_zalo_message_id:zaloMessageId,
      p_body:body,
      p_event_at:eventAt,
      p_asset_id:assetId,
      p_kind:kind,
      p_storage_key:storageKey,
      p_file_name:fileName,
      p_mime_type:mimeType,
      p_size_bytes:file.size,
      p_width_px:kind==="image"?widthPx:null,
      p_height_px:kind==="image"?heightPx:null,
    });
    if(storeError||!stored){
      await admin.storage.from(MEDIA_BUCKET).remove([storageKey]);
      return reply(500,{ok:false,error:"ingress_media_failed"});
    }
    if(Boolean(stored.idempotent_reuse)&&String(stored.asset_id??"")!==assetId){
      const {error:cleanupError}=await admin.storage.from(MEDIA_BUCKET).remove([storageKey]);
      if(cleanupError)console.warn("[v21-zalo-bridge] duplicate media cleanup failed",cleanupError.message);
    }
    return reply(200,{ok:true,message_id:stored.message_id??null,asset_id:stored.asset_id??assetId,idempotent_reuse:Boolean(stored.idempotent_reuse)});
  }

  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"});}
  const action=String(body?.action??"").trim();

  if(action==="ingress"){
    const {data,error}=await admin.rpc("v21_zalo_ingress",{
      p_zalo_id:String(body.zalo_id??""),
      p_zalo_message_id:String(body.zalo_message_id??""),
      p_body:String(body.body??""),
      p_event_at:body.event_at??null,
    });
    if(error)return reply(500,{ok:false,error:"ingress_failed"});
    return reply(200,{ok:true,message_id:data??null});
  }

  if(action==="outbound_due"){
    const limit=Math.max(1,Math.min(Number(body.limit)||20,100));
    const {data,error}=await admin.rpc("v21_zalo_outbound_due_media",{p_limit:limit});
    if(error)return reply(500,{ok:false,error:"outbound_due_failed"});
    const rows=[];
    for(const row of Array.isArray(data)?data:[]){
      const media=[];
      for(const asset of Array.isArray(row?.media)?row.media:[]){
        const storageKey=String(asset?.storage_key??"");
        if(!storageKey)continue;
        const {data:signed,error:signError}=await admin.storage.from(MEDIA_BUCKET).createSignedUrl(storageKey,300);
        if(signError||!signed?.signedUrl)return reply(500,{ok:false,error:"media_sign_failed"});
        media.push({
          kind:String(asset?.kind??"file"),
          signed_url:signed.signedUrl,
          file_name:asset?.file_name??null,
          mime_type:String(asset?.mime_type??"application/octet-stream"),
          size_bytes:Number(asset?.size_bytes)||0,
          width_px:asset?.width_px??null,
          height_px:asset?.height_px??null,
          sort_index:Number(asset?.sort_index)||0,
        });
      }
      rows.push({...row,media});
    }
    return reply(200,{ok:true,rows});
  }

  if(action==="outbound_result"){
    const {data,error}=await admin.rpc("v21_zalo_outbound_result",{
      p_delivery_id:String(body.delivery_id??""),
      p_ok:Boolean(body.ok),
      p_zalo_message_id:body.zalo_message_id==null?null:String(body.zalo_message_id),
      p_error:body.error==null?null:String(body.error),
    });
    if(error)return reply(500,{ok:false,error:"outbound_result_failed"});
    return reply(200,{ok:true,updated:Boolean(data)});
  }

  if(action==="sync_linked_avatars"){
    const {data:links,error:linksError}=await admin.from("zalo_user_links").select("chat_account_id,zalo_id");
    if(linksError)return reply(500,{ok:false,error:"links_read_failed"});
    if(!links?.length)return reply(200,{ok:true,count:0});

    const zaloIds=[...new Set(links.map(row=>String(row.zalo_id||"")).filter(Boolean))];
    const accountIds=[...new Set(links.map(row=>String(row.chat_account_id||"")).filter(Boolean))];
    const [{data:contacts,error:contactsError},{data:accounts,error:accountsError}]=await Promise.all([
      admin.from("zalo_contacts").select("zalo_id,avatar_url").in("zalo_id",zaloIds),
      admin.from("v21_accounts").select("id,avatar_path").in("id",accountIds),
    ]);
    if(contactsError||accountsError)return reply(500,{ok:false,error:"avatar_lookup_failed"});

    const avatarByZalo=new Map((contacts??[]).map(row=>[String(row.zalo_id),String(row.avatar_url??"").trim()]));
    const currentByAccount=new Map((accounts??[]).map(row=>[String(row.id),String(row.avatar_path??"").trim()]));
    let count=0;
    for(const link of links){
      const accountId=String(link.chat_account_id||"");
      const avatarUrl=avatarByZalo.get(String(link.zalo_id||""))||"";
      const current=currentByAccount.get(accountId)||"";
      if(!accountId||!/^https?:\/\//i.test(avatarUrl))continue;
      if(current&&!/^https?:\/\//i.test(current))continue;
      if(current===avatarUrl)continue;
      const {error}=await admin.from("v21_accounts").update({avatar_path:avatarUrl,updated_at:new Date().toISOString()}).eq("id",accountId);
      if(error)return reply(500,{ok:false,error:"avatar_update_failed"});
      count++;
    }
    return reply(200,{ok:true,count});
  }

  return reply(400,{ok:false,error:"invalid_action"});
});
