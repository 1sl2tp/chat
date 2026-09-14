import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { extractOrderIntentSource, finalizeAiOrderText, formatOrderItems, parseQuickOrderText } from "./scribe-core.mjs";
import { ORDER_NORMALIZE_PROMPT, ORDER_OCR_PROMPT } from "./order-ai-prompts.mjs";
import { buildGroceryReferenceContext, buildOwnRecognitionVocabulary, loadGroceryReferenceLibrary, rankGroceryCandidates } from "./grocery-reference.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const DEFAULT_MODEL='gemini-3.5-flash-lite';
const MAX_SOURCE_CHARS=6000;
const MAX_IMAGE_COUNT=8;
const MAX_IMAGE_BYTES=15*1024*1024;
const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'POST,OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'access-control-max-age':'600',
  'vary':'Origin',
};

function clean(value:unknown,max=MAX_SOURCE_CHARS){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...corsHeaders},
  });
}
function accessTokenFromRequest(req:Request){
  const header=String(req.headers.get('authorization')||'').trim();
  return header.toLowerCase().startsWith('bearer ')?header.slice(7).trim():'';
}
async function requireAdmin(req:Request){
  const token=accessTokenFromRequest(req);
  if(!token)return {error:json({ok:false,error:'unauthorized'},401)};
  const userResult=await db.auth.getUser(token);
  const user=userResult.data?.user;
  if(userResult.error||!user?.id)return {error:json({ok:false,error:'unauthorized'},401)};
  const account=await db.from('v21_accounts')
    .select('id,role,username,display_name')
    .eq('auth_user_id',user.id)
    .eq('role','admin')
    .is('deleted_at',null)
    .is('locked_at',null)
    .maybeSingle();
  if(account.error)return {error:json({ok:false,error:'account_lookup_failed'},500)};
  if(!account.data?.id)return {error:json({ok:false,error:'admin_required'},403)};
  return {user,account:account.data};
}
async function resolveConversation(adminAccountId:string,contactId:string){
  const conversations=await db.from('v21_conversations')
    .select('id,member_a,member_b')
    .or(`and(member_a.eq.${adminAccountId},member_b.eq.${contactId}),and(member_a.eq.${contactId},member_b.eq.${adminAccountId})`)
    .limit(1)
    .maybeSingle();
  if(conversations.error)throw conversations.error;
  const conversationId=String(conversations.data?.id||'');
  if(!conversationId)throw new Error('conversation_not_found');
  return conversationId;
}
async function latestInboundText(adminAccountId:string,contactId:string){
  const conversationId=await resolveConversation(adminAccountId,contactId);
  const messages=await db.from('v21_messages')
    .select('id,body,created_at,sender_account_id')
    .eq('conversation_id',conversationId)
    .eq('sender_account_id',contactId)
    .is('deleted_at',null)
    .not('body','is',null)
    .order('created_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(messages.error)throw messages.error;
  const text=clean(messages.data?.body);
  if(!text)throw new Error('customer_message_not_found');
  return {text,conversationId,messageId:String(messages.data?.id||'')};
}
async function resolveSource(body:any,adminAccountId:string,{allowEmpty=false}={}){
  const contactId=clean(body?.contactId,200);
  if(!contactId)throw new Error('contact_required');
  const explicit=clean(body?.text,MAX_SOURCE_CHARS);
  if(explicit||allowEmpty)return {text:explicit,contactId,conversationId:null,messageId:null,source:'selection'};
  const latest=await latestInboundText(adminAccountId,contactId);
  return {...latest,contactId,source:'latest_inbound'};
}
async function runtimeConfig(){
  const result=await db.rpc('chat_order_scribe_runtime_config');
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    model:clean(row?.model_name,100)||DEFAULT_MODEL,
    key:String(row?.gemini_api_key||'').trim(),
  };
}
function responseText(payload:any){
  const parts=payload?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts))return '';
  return parts.map((part:any)=>String(part?.text||'')).join('').trim();
}
function uniqueImageAssetIds(value:any){
  return Array.from(new Set((Array.isArray(value)?value:[])
    .map(item=>clean(item,200)).filter(Boolean))).slice(0,MAX_IMAGE_COUNT);
}
function bytesToBase64(bytes:Uint8Array){
  let binary='';
  const CHUNK=0x8000;
  for(let i=0;i<bytes.length;i+=CHUNK){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
  }
  return btoa(binary);
}
async function loadInboundImages(adminAccountId:string,contactId:string,imageAssetIds:string[]){
  if(!imageAssetIds.length)return [];
  const conversationId=await resolveConversation(adminAccountId,contactId);
  const assets=await db.from('v21_media_assets')
    .select('id,message_id,owner_account_id,conversation_id,kind,mime_type,size_bytes,storage_key,sort_index,created_at')
    .eq('conversation_id',conversationId)
    .eq('owner_account_id',contactId)
    .eq('kind','image')
    .is('deleted_at',null)
    .in('id',imageAssetIds);
  if(assets.error)throw assets.error;
  const rows=Array.isArray(assets.data)?assets.data:[];
  if(rows.length!==imageAssetIds.length)throw new Error('source_image_not_found');

  const messageIds=Array.from(new Set(rows.map((row:any)=>String(row?.message_id||'')).filter(Boolean)));
  const parents=await db.from('v21_messages')
    .select('id')
    .eq('conversation_id',conversationId)
    .eq('sender_account_id',contactId)
    .is('deleted_at',null)
    .in('id',messageIds);
  if(parents.error)throw parents.error;
  const validMessages=new Set((Array.isArray(parents.data)?parents.data:[]).map((row:any)=>String(row?.id||'')));
  if(messageIds.some(id=>!validMessages.has(id)))throw new Error('source_image_not_found');

  const byId=new Map(rows.map((row:any)=>[String(row?.id||''),row]));
  const loaded=[];
  for(const assetId of imageAssetIds){
    const row:any=byId.get(assetId);
    const mimeType=String(row?.mime_type||'').toLowerCase();
    const sizeBytes=Number(row?.size_bytes)||0;
    const storageKey=String(row?.storage_key||'').trim();
    if(!row||!mimeType.startsWith('image/')||!storageKey||sizeBytes<1||sizeBytes>MAX_IMAGE_BYTES){
      throw new Error('source_image_not_found');
    }
    const download=await db.storage.from('v21-media').download(storageKey);
    if(download.error||!download.data)throw new Error('image_unavailable');
    const bytes=new Uint8Array(await download.data.arrayBuffer());
    if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new Error('image_unavailable');
    loaded.push({assetId,mimeType,data:bytesToBase64(bytes)});
  }
  return loaded;
}
async function geminiTextRequest(cfg:any,parts:any[]){
  const model=cfg.model||DEFAULT_MODEL;
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response:Response;
  try{
    response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','x-goog-api-key':cfg.key},
      body:JSON.stringify({
        contents:[{role:'user',parts}],
        generationConfig:{temperature:0},
      }),
    });
  }catch(error){
    console.error('[v21-order-scribe:gemini]','network',String((error as any)?.message||error||'request_failed'));
    throw new Error('ai_unavailable');
  }
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    console.error('[v21-order-scribe:gemini]',response.status,payload?.error?.message||'request_failed');
    throw new Error('ai_unavailable');
  }
  const text=responseText(payload);
  if(!text)throw new Error('ai_response_invalid');
  return text;
}
async function normalizeOrderTextWithAi(source:string,cfg:any,referenceContext=''){
  const input=clean(source,MAX_SOURCE_CHARS);
  if(!input)throw new Error('order_text_required');
  const parts:any[]=[{text:ORDER_NORMALIZE_PROMPT}];
  if(referenceContext)parts.push({text:`\n\n${referenceContext}`});
  parts.push({text:`\n\nĐẦU VÀO:\n${input}`});
  return geminiTextRequest(cfg,parts);
}
async function ocrInboundImagesWithAi(images:any[],cfg:any,recognitionVocabulary=''){
  const outputs=[];
  for(const image of images){
    const parts:any[]=[{text:ORDER_OCR_PROMPT}];
    if(recognitionVocabulary)parts.push({text:`\n\n${recognitionVocabulary}`});
    parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
    const text=await geminiTextRequest(cfg,parts);
    if(text)outputs.push(text);
  }
  if(!outputs.length)throw new Error('ai_items_missing');
  return outputs.join('\n');
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const admin=await requireAdmin(req);
    if(admin.error)return admin.error;
    let body:any={};
    try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    const action=clean(body?.action,20).toLowerCase();
    if(action!=='quick'&&action!=='ai')return json({ok:false,error:'invalid_action'},400);
    const imageAssetIds=action==='ai'?uniqueImageAssetIds(body?.imageAssetIds):[];
    const source=await resolveSource(body,String(admin.account.id),{allowEmpty:action==='ai'&&imageAssetIds.length>0});
    if(source.text.length>MAX_SOURCE_CHARS)return json({ok:false,error:'order_text_too_long'},400);

    if(action==='quick'){
      const parsed=parseQuickOrderText(source.text);
      if(!parsed.ok)return json({ok:false,error:parsed.error||'quick_parse_failed',source:source.source},422);
      return json({ok:true,mode:'quick',source:source.source,items:parsed.items,unresolved:parsed.unresolved,text:formatOrderItems(parsed.items)});
    }

    const cfg=await runtimeConfig();
    if(!cfg.key)throw new Error('ai_not_configured');
    const groceryLibrary=await loadGroceryReferenceLibrary(db);

    let aiInput=extractOrderIntentSource(source.text);
    const ownVocabulary=buildOwnRecognitionVocabulary(groceryLibrary,{maxChars:12000});
    if(imageAssetIds.length){
      const images=await loadInboundImages(String(admin.account.id),source.contactId,imageAssetIds);
      const ocrText=await ocrInboundImagesWithAi(images,cfg,ownVocabulary);
      const filteredOcr=extractOrderIntentSource(ocrText);
      aiInput=[aiInput,filteredOcr].filter(Boolean).join('\n');
    }
    if(!aiInput)throw new Error('ai_items_missing');

    const nearbyReference=buildGroceryReferenceContext(aiInput,groceryLibrary);
    const referenceContext=[nearbyReference,ownVocabulary].filter(Boolean).join('\n\n');
    // Ranking is evidence only; it must never auto-replace a clear source phrase.
    rankGroceryCandidates(aiInput,groceryLibrary,1);
    const normalized=await normalizeOrderTextWithAi(aiInput,cfg,referenceContext);
    const final=finalizeAiOrderText(normalized);
    if(!final.items.length)throw new Error('ai_items_missing');
    return json({
      ok:true,
      mode:'ai',
      source:source.source,
      items:final.items,
      unresolved:final.unresolved,
      text:final.text,
    });
  }catch(error){
    const code=String((error as any)?.message||error||'internal_error');
    const status=['contact_required','conversation_not_found','customer_message_not_found','order_text_required','source_image_not_found'].includes(code)?400:
      ['invalid_ai_span','invalid_ai_image_item','ai_items_missing','ai_response_invalid'].includes(code)?422:
      ['ai_unavailable','image_unavailable'].includes(code)?503:500;
    console.error('[v21-order-scribe]',code);
    return json({ok:false,error:code},status);
  }
});
