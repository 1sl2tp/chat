import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ORDER_MASTER_PROMPT } from "../v21-order-scribe/order-ai-prompts.mjs";
import { parseMasterOrderResponseText } from "../v21-order-scribe/master-order-core.mjs";
import { sortSourcesBySequence } from "./scan-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const MAX_CONTACTS_PER_RUN=15;
const MAX_SOURCES_PER_CONTACT=50;
const MAX_IMAGE_COUNT=16;
const MAX_IMAGE_BYTES=15*1024*1024;
const MAX_TOTAL_IMAGE_BYTES=30*1024*1024;
const DEFAULT_MODEL='gemini-3.5-flash-lite';

function clean(value:unknown,max=12000){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
  });
}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function responseText(payload:any){
  const parts=payload?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts))return '';
  return parts.map((part:any)=>String(part?.text||'')).join('').trim();
}
function bytesToBase64(bytes:Uint8Array){
  let binary='';
  const CHUNK=0x8000;
  for(let i=0;i<bytes.length;i+=CHUNK){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
  }
  return btoa(binary);
}

async function runtimeConfig(){
  const result=await db.rpc('chat_ai_scan_runtime_config');
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    scanKey:String(row?.scan_key||''),
    model:clean(row?.model_name,100)||DEFAULT_MODEL,
    key:String(row?.gemini_api_key||''),
  };
}

async function pendingSources(){
  const result=await db.from('chat_ai_pending_sources')
    .select('source_seq,message_id,contact_id,conversation_id,last_source_seq')
    .order('source_seq',{ascending:true})
    .limit(MAX_CONTACTS_PER_RUN*MAX_SOURCES_PER_CONTACT*2);
  if(result.error)throw result.error;
  const rows=Array.isArray(result.data)?result.data:[];
  if(!rows.length)return [];

  const groups=new Map<string,any[]>();
  for(const row of rows){
    const key=`${row.contact_id}::${row.conversation_id}`;
    if(!groups.has(key)){
      if(groups.size>=MAX_CONTACTS_PER_RUN)continue;
      groups.set(key,[]);
    }
    const list=groups.get(key)!;
    if(list.length>=MAX_SOURCES_PER_CONTACT)continue;
    list.push({
      sourceSeq:Number(row.source_seq),
      messageId:String(row.message_id||''),
      contactId:String(row.contact_id||''),
      conversationId:String(row.conversation_id||''),
      lastSourceSeq:Number(row.last_source_seq)||0,
    });
  }
  return Array.from(groups.values()).filter(list=>list.length>0);
}

async function hydrateSources(rows:any[]){
  const ids=rows.map(row=>row.messageId).filter(Boolean);
  if(!ids.length)return [];
  const messages=await db.from('v21_messages')
    .select('id,body,created_at,conversation_id,sender_account_id')
    .in('id',ids)
    .is('deleted_at',null);
  if(messages.error)throw messages.error;
  const map=new Map((Array.isArray(messages.data)?messages.data:[]).map((row:any)=>[String(row.id),row]));
  return sortSourcesBySequence(rows.map(row=>({
    ...row,
    text:String(map.get(row.messageId)?.body||''),
  })));
}

async function mediaForSources(sources:any[]){
  const ids=sources.map(row=>row.messageId).filter(Boolean);
  if(!ids.length)return new Map<string,any[]>();
  const result=await db.from('v21_media_assets')
    .select('id,message_id,mime_type,size_bytes,storage_key,sort_index')
    .eq('kind','image')
    .is('deleted_at',null)
    .in('message_id',ids)
    .order('sort_index',{ascending:true});
  if(result.error)throw result.error;
  const map=new Map<string,any[]>();
  for(const row of Array.isArray(result.data)?result.data:[]){
    const messageId=String(row?.message_id||'');
    const list=map.get(messageId)||[];
    list.push(row);
    map.set(messageId,list);
  }
  return map;
}

async function loadImageParts(sources:any[],mediaMap:Map<string,any[]>){
  const byMessage=new Map<string,any[]>();
  let count=0;
  let totalBytes=0;
  for(const source of sources){
    const loaded=[];
    for(const asset of mediaMap.get(source.messageId)||[]){
      const mimeType=String(asset?.mime_type||'').toLowerCase();
      const sizeBytes=Number(asset?.size_bytes)||0;
      const storageKey=String(asset?.storage_key||'').trim();
      if(!mimeType.startsWith('image/')||!storageKey||sizeBytes<1||sizeBytes>MAX_IMAGE_BYTES){
        throw new Error('source_image_invalid');
      }
      count+=1;
      totalBytes+=sizeBytes;
      if(count>MAX_IMAGE_COUNT||totalBytes>MAX_TOTAL_IMAGE_BYTES)throw new Error('source_image_limit');
      const download=await db.storage.from('v21-media').download(storageKey);
      if(download.error||!download.data)throw new Error('image_unavailable');
      const bytes=new Uint8Array(await download.data.arrayBuffer());
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new Error('image_unavailable');
      loaded.push({mimeType,data:bytesToBase64(bytes)});
    }
    byMessage.set(source.messageId,loaded);
  }
  return byMessage;
}

async function geminiRequest(cfg:any,parts:any[]){
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model||DEFAULT_MODEL)}:generateContent`;
  for(let attempt=0;attempt<2;attempt++){
    let response:Response;
    try{
      response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json','x-goog-api-key':cfg.key},
        body:JSON.stringify({
          contents:[{role:'user',parts}],
          generationConfig:{temperature:0,responseMimeType:'application/json'},
        }),
      });
    }catch(error){
      if(attempt===0){await sleep(750);continue;}
      console.error('[v21-order-scan:gemini]','network',String((error as any)?.message||error));
      throw new Error('ai_unavailable');
    }
    const payload=await response.json().catch(()=>null);
    if(response.ok){
      const text=responseText(payload);
      if(!text)throw new Error('ai_response_invalid');
      return text;
    }
    if(attempt===0&&(response.status===429||response.status>=500)){
      await sleep(750);
      continue;
    }
    console.error('[v21-order-scan:gemini]',response.status,payload?.error?.message||'request_failed');
    throw new Error('ai_unavailable');
  }
  throw new Error('ai_unavailable');
}

async function scanContact(rows:any[],cfg:any){
  const sources=await hydrateSources(rows);
  if(!sources.length)return {ok:true,skipped:true,aiCalls:0};
  const mediaMap=await mediaForSources(sources);
  const imagesByMessage=await loadImageParts(sources,mediaMap);
  const parts:any[]=[{text:ORDER_MASTER_PROMPT}];
  for(const source of sources){
    const text=clean(source.text,6000);
    if(text)parts.push({text});
    for(const image of imagesByMessage.get(source.messageId)||[]){
      parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
    }
  }
  if(parts.length===1)throw new Error('source_empty');

  const aiResponse=await geminiRequest(cfg,parts);
  const parsed=parseMasterOrderResponseText(aiResponse);
  const first=sources[0];
  const last=sources[sources.length-1];
  const lines=parsed.items.map((item:any)=>({quantity:item.quantity,name:item.name}));
  const commit=await db.rpc('chat_ai_scan_commit',{
    p_contact_id:first.contactId,
    p_conversation_id:first.conversationId,
    p_from_source_seq:first.sourceSeq,
    p_to_source_seq:last.sourceSeq,
    p_source_message_ids:sources.map(source=>source.messageId),
    p_last_message_id:last.messageId,
    p_output_text:parsed.text||'',
    p_lines:lines,
  });
  if(commit.error)throw commit.error;
  return {ok:true,skipped:false,aiCalls:1,lineCount:lines.length,runId:String(commit.data||'')};
}

async function recordFailure(rows:any[],error:unknown){
  if(!rows.length)return;
  const first=rows[0],last=rows[rows.length-1];
  await db.from('chat_ai_scan_runs').insert({
    contact_id:first.contactId,
    conversation_id:first.conversationId,
    from_source_seq:first.sourceSeq,
    to_source_seq:last.sourceSeq,
    source_count:rows.length,
    source_message_ids:rows.map(row=>row.messageId),
    status:'failed',
    output_text:'',
    error_code:String((error as any)?.message||error||'scan_failed').slice(0,200),
    finished_at:new Date().toISOString(),
  });
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const cfg=await runtimeConfig();
    const supplied=String(req.headers.get('x-order-scan-key')||'');
    if(!cfg.scanKey||!supplied||supplied!==cfg.scanKey)return json({ok:false,error:'unauthorized'},401);
    if(!cfg.key)return json({ok:false,error:'ai_not_configured'},503);

    const groups=await pendingSources();
    if(!groups.length)return json({ok:true,scannedContacts:0,aiCalls:0,failed:0});

    let scannedContacts=0;
    let aiCalls=0;
    let failed=0;
    for(const group of groups){
      const sources=sortSourcesBySequence(group);
      if(!sources.length)continue;
      try{
        const result=await scanContact(sources,cfg);
        if(!result.skipped)scannedContacts+=1;
        aiCalls+=Number(result.aiCalls)||0;
      }catch(error){
        failed+=1;
        await recordFailure(sources,error).catch(()=>{});
        console.error('[v21-order-scan]',String((error as any)?.message||error||'scan_failed'));
      }
    }
    return json({ok:true,scannedContacts,aiCalls,failed});
  }catch(error){
    console.error('[v21-order-scan:fatal]',String((error as any)?.message||error||'internal_error'));
    return json({ok:false,error:'scan_failed'},500);
  }
});
