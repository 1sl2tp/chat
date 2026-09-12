import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { parseCustomerTextDetailed } from "./parser-core.mjs";
import { formatCatalogSearchDisplayRows, resolveParsedLinesWithCatalog } from "./catalog-search.mjs";
import { protectNumericLeadingProducts } from "./numeric-product-protection.mjs";

const SUPABASE_URL=String(Deno.env.get("SUPABASE_URL")||"").trim();
const SERVICE_KEY=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const clean=(value:unknown,max=8000)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

async function runtimeConfig(){
  const result=await db.rpc("chat_ai_runtime_config");
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    mode:clean(row?.mode,40),
    secret:clean(row?.webhook_secret,500),
    pilotIds:new Set<string>((row?.pilot_customer_ids||[]).map((v:unknown)=>clean(v,100)).filter(Boolean)),
  };
}

async function loadActiveCatalog(){
  const keyResult=await db.from("chat_ai_product_keys")
    .select("product_code,product_name,source,level1,level2,level3,level4,level5,level6,level7,level8,level9")
    .eq("active",true)
    .limit(5000);
  if(keyResult.error){
    console.warn("[v21-ai-product-parser] latest product-key lookup failed",keyResult.error.message);
    return [];
  }

  return (Array.isArray(keyResult.data)?keyResult.data:[])
    .map((row:any)=>({
      id:clean(row?.product_code,100)||null,
      name:clean(row?.product_name,500),
      source:row?.source,
      level1:row?.level1,
      level2:row?.level2,
      level3:row?.level3,
      level4:row?.level4,
      level5:row?.level5,
      level6:row?.level6,
      level7:row?.level7,
      level8:row?.level8,
      level9:row?.level9,
    }))
    .filter((row:any)=>row.name);
}

async function activeAdminId(conversationId:string){
  const conversation=await db.from("v21_conversations")
    .select("member_a,member_b")
    .eq("id",conversationId)
    .maybeSingle();
  if(conversation.error)throw conversation.error;
  const ids=[conversation.data?.member_a,conversation.data?.member_b].map(v=>clean(v,100)).filter(Boolean);
  if(!ids.length)throw new Error("conversation_not_found");
  const accounts=await db.from("v21_accounts")
    .select("id,role,created_at,deleted_at,locked_at")
    .in("id",ids)
    .eq("role","admin")
    .is("deleted_at",null)
    .is("locked_at",null)
    .order("created_at",{ascending:true})
    .limit(1)
    .maybeSingle();
  if(accounts.error)throw accounts.error;
  if(!accounts.data?.id)throw new Error("active_admin_not_found");
  return String(accounts.data.id);
}

async function sendChatReply(conversationId:string,turnKey:string,body:string){
  const adminId=await activeAdminId(conversationId);
  const clientId=`ai:product:${clean(turnKey,90)}`.slice(0,120);
  const existing=await db.from("v21_messages")
    .select("id")
    .eq("sender_account_id",adminId)
    .eq("client_id",clientId)
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.id)return String(existing.data.id);
  const inserted=await db.from("v21_messages").insert({
    conversation_id:conversationId,
    sender_account_id:adminId,
    client_id:clientId,
    body,
  }).select("id").single();
  if(inserted.error)throw inserted.error;
  return String(inserted.data.id);
}

async function markInbox(ids:string[],status:"processed"|"ignored"|"failed",lastError:string|null=null){
  if(!ids.length)return;
  const result=await db.from("chat_ai_message_inbox").update({
    status,
    processed_at:new Date().toISOString(),
    last_error:lastError,
  }).in("id",ids);
  if(result.error)throw result.error;
}

async function processConversation(conversationId:string,cfg:any){
  const claimed=await db.rpc("chat_ai_claim_turn",{p_conversation_id:conversationId});
  if(claimed.error)throw claimed.error;
  const rows=Array.isArray(claimed.data)?claimed.data:[];
  if(!rows.length)return {claimed:0,replied:false};

  const inboxIds=rows.map((row:any)=>String(row.inbox_id));
  const customerId=clean(rows[0]?.customer_account_id,100);
  const allowed=cfg.mode==="live"||(cfg.mode==="pilot"&&cfg.pilotIds.has(customerId));
  if(!allowed){
    await markInbox(inboxIds,"ignored");
    return {claimed:rows.length,replied:false};
  }

  try{
    const customerText=rows.map((row:any)=>String(row.message_body||"").trim()).filter(Boolean).join("\n");
    const parsed=parseCustomerTextDetailed(customerText);
    const catalog=parsed.lines.length?await loadActiveCatalog():[];
    const protectedLines=protectNumericLeadingProducts(parsed.lines,catalog);
    const resolved=resolveParsedLinesWithCatalog(protectedLines,catalog);
    const output=formatCatalogSearchDisplayRows(resolved).map((row:any)=>row.line);

    if(output.length){
      const body=[...output,`— Tổng: ${output.length} sản phẩm`].join("\n");
      await sendChatReply(
        conversationId,
        clean(rows[0]?.turn_key,100)||String(rows[0]?.message_id||Date.now()),
        body,
      );
    }

    await markInbox(inboxIds,"processed");
    return {
      claimed:rows.length,
      replied:output.length>0,
      items:resolved.length,
      catalog_matches:resolved.filter((row:any)=>row.catalogMatched).length,
      confirmations:0,
    };
  }catch(error){
    await markInbox(inboxIds,"failed",String(error).slice(0,500));
    throw error;
  }
}

Deno.serve(async(req:Request)=>{
  try{
    const cfg=await runtimeConfig();
    if(req.method==="GET"){
      return new Response(JSON.stringify({
        ok:true,
        chat_parser:true,
        input_only:true,
        catalog_sync:true,
        dictionary_search:true,
        catalog_source:"chat_ai_product_keys",
        order_workflow:false,
        external_api:false,
        output:"SL + Tên",
        tobacco_confirmation:false,
        mode:cfg.mode,
      }),{headers:{"content-type":"application/json"}});
    }

    if(req.method!=="POST")return new Response("method not allowed",{status:405});
    if(!cfg.secret||req.headers.get("x-chat-ai-secret")!==cfg.secret)return new Response("unauthorized",{status:401});

    let body:any={};
    try{body=await req.json();}catch{body={};}
    const conversationId=clean(body?.conversation_id,100);
    if(!conversationId)return new Response(JSON.stringify({ok:false,error:"conversation_id_required"}),{status:400,headers:{"content-type":"application/json"}});

    await sleep(4200);
    const result=await processConversation(conversationId,cfg);
    return new Response(JSON.stringify({ok:true,...result}),{headers:{"content-type":"application/json"}});
  }catch(error){
    return new Response(JSON.stringify({ok:false,error:clean(error instanceof Error?error.message:error,500)}),{status:500,headers:{"content-type":"application/json"}});
  }
});