import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { MASTER_PROMPT, buildConversationHistory, customerSpecificHints, normalizeSummaryPayload } from "./summary-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const MAX_CUSTOMERS_PER_RUN=14;
const MAX_AI_CALLS_PER_RUN=15;
const PAGE_SIZE=500;
const MAX_IMAGE_BYTES=15*1024*1024;
const MAX_TOTAL_IMAGE_BYTES=40*1024*1024;
const DEFAULT_MODEL='gemini-3.5-flash-lite';
const FALLBACK_MODEL='gemini-3.6-flash';

type AiBudget={calls:number};

function clean(value:unknown,max=12000){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
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
function chunks<T>(items:T[],size=100){
  const out:T[][]=[];
  for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));
  return out;
}
function aiErrorCode(status:number){
  if(status===429)return 'ai_rate_limited';
  if(status===404)return 'ai_model_unavailable';
  if(status>=500)return 'ai_server_unavailable';
  return `ai_http_${status}`;
}
function retryableAiError(error:unknown){
  const code=String((error as any)?.message||error||'');
  return code==='ai_rate_limited'||code==='ai_server_unavailable'||code==='ai_network'||code==='ai_model_unavailable';
}

async function runtimeConfig(){
  const result=await db.rpc('chat_customer_summary_runtime_config');
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    scanKey:String(row?.scan_key||''),
    model:clean(row?.model_name,120)||DEFAULT_MODEL,
    geminiKey:String(row?.gemini_api_key||''),
  };
}

async function claimCustomers(){
  const result=await db.rpc('chat_customer_summary_claim_dirty_batch',{p_limit:MAX_CUSTOMERS_PER_RUN});
  if(result.error)throw result.error;
  return (Array.isArray(result.data)?result.data:[]).map((row:any)=>({
    id:String(row?.customer_id||''),
    username:String(row?.username||''),
    display_name:String(row?.display_name||''),
    claimVersion:Number(row?.claim_version)||0,
  })).filter((row:any)=>row.id&&row.claimVersion>0);
}

async function loadConversationIds(customerId:string){
  const result=await db.from('v21_conversations')
    .select('id')
    .or(`member_a.eq.${customerId},member_b.eq.${customerId}`)
    .order('created_at',{ascending:true});
  if(result.error)throw result.error;
  return (Array.isArray(result.data)?result.data:[]).map((row:any)=>String(row?.id||'')).filter(Boolean);
}

async function loadConversationMessages(customerId:string,conversationIds:string[]){
  if(!conversationIds.length)return [];
  const rows:any[]=[];
  for(let from=0;;from+=PAGE_SIZE){
    const result=await db.from('v21_messages')
      .select('id,conversation_id,sender_account_id,body,created_at')
      .in('conversation_id',conversationIds)
      .is('deleted_at',null)
      .order('created_at',{ascending:true})
      .order('id',{ascending:true})
      .range(from,from+PAGE_SIZE-1);
    if(result.error)throw result.error;
    const page=Array.isArray(result.data)?result.data:[];
    rows.push(...page.map((row:any)=>({
      ...row,
      sender_role:String(row?.sender_account_id||'')===customerId?'customer':'admin',
    })));
    if(page.length<PAGE_SIZE)break;
  }
  return rows;
}

async function loadCustomerImages(customerId:string,messages:any[]){
  const customerMessageIds=messages
    .filter(row=>row?.sender_role==='customer'&&row?.id)
    .map(row=>String(row.id));
  if(!customerMessageIds.length)return new Map<string,any[]>();

  const resultRows:any[]=[];
  for(const ids of chunks(customerMessageIds,100)){
    const result=await db.from('v21_media_assets')
      .select('id,message_id,mime_type,size_bytes,storage_key,sort_index')
      .eq('kind','image')
      .is('deleted_at',null)
      .in('message_id',ids)
      .order('sort_index',{ascending:true});
    if(result.error)throw result.error;
    resultRows.push(...(Array.isArray(result.data)?result.data:[]));
  }

  const map=new Map<string,any[]>();
  for(const row of resultRows){
    const messageId=String(row?.message_id||'');
    if(!messageId)continue;
    const list=map.get(messageId)||[];
    list.push(row);
    map.set(messageId,list);
  }
  return map;
}

async function loadImageParts(messages:any[],mediaMap:Map<string,any[]>){
  const byMessage=new Map<string,any[]>();
  let totalBytes=0;
  for(const message of messages){
    if(message?.sender_role!=='customer')continue;
    const loaded:any[]=[];
    for(const asset of mediaMap.get(String(message.id))||[]){
      const mimeType=String(asset?.mime_type||'').toLowerCase();
      const sizeBytes=Number(asset?.size_bytes)||0;
      const storageKey=String(asset?.storage_key||'').trim();
      if(!mimeType.startsWith('image/')||!storageKey||sizeBytes<1||sizeBytes>MAX_IMAGE_BYTES){
        throw new Error('source_image_invalid');
      }
      totalBytes+=sizeBytes;
      if(totalBytes>MAX_TOTAL_IMAGE_BYTES)throw new Error('source_images_too_large');
      const download=await db.storage.from('v21-media').download(storageKey);
      if(download.error||!download.data)throw new Error('image_unavailable');
      const bytes=new Uint8Array(await download.data.arrayBuffer());
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new Error('image_unavailable');
      loaded.push({mimeType,data:bytesToBase64(bytes),assetId:String(asset?.id||'')});
    }
    if(loaded.length)byMessage.set(String(message.id),loaded);
  }
  return byMessage;
}

function appendImageReadVerify(parts:any[],row:any,image:any){
  const at=clean(row?.created_at,80)||'?';
  parts.push({text:`ẢNH ĐỌC LẦN 1 — message_id=${String(row?.id||'?')} — ảnh khách gửi lúc ${at}. Nếu là ảnh đơn, đọc tuần tự từng dòng vật lý từ trên xuống dưới và hết từng cột. Chưa lọc trùng, chưa gộp các dòng gần giống; mục tiêu là không bỏ sót dòng.`});
  parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
  parts.push({text:`ẢNH KIỂM TRA LẦN 2 — message_id=${String(row?.id||'?')} — cùng ảnh lúc ${at}. Đối chiếu lại toàn bộ ảnh với danh sách vừa đọc: tìm dòng nào bị bỏ sót, đặc biệt các dòng cùng tên gốc/cùng số lượng nhưng khác có đường, ít đường, không đường, màu, dung tích, trọng lượng, mã hoặc quy cách. Chỉ sau bước kiểm tra này mới áp dụng sửa đơn/lọc trùng theo prompt.`});
  parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
}

async function geminiRequest(cfg:any,parts:any[],budget:AiBudget){
  if(budget.calls>=MAX_AI_CALLS_PER_RUN)throw new Error('ai_budget_exhausted');
  budget.calls+=1;
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model||DEFAULT_MODEL)}:generateContent`;
  let response:Response;
  try{
    response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','x-goog-api-key':cfg.geminiKey},
      body:JSON.stringify({
        contents:[{role:'user',parts}],
        generationConfig:{temperature:0,responseMimeType:'application/json'},
      }),
    });
  }catch(error){
    console.error('[v21-customer-summary-scan:gemini] network',String((error as any)?.message||error));
    throw new Error('ai_network');
  }
  const payload=await response.json().catch(()=>null);
  if(response.ok){
    const text=responseText(payload);
    if(!text)throw new Error('ai_response_invalid');
    return text;
  }
  const code=aiErrorCode(response.status);
  console.error('[v21-customer-summary-scan:gemini]',response.status,code,payload?.error?.message||'request_failed');
  throw new Error(code);
}

function parseJsonResponse(text:string,messages:any[]=[]){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let parsed:any;
  try{parsed=JSON.parse(raw);}catch{throw new Error('ai_response_invalid');}
  return normalizeSummaryPayload(parsed,messages);
}

async function recordResult(customer:any,messages:any[],imagesByMessage:Map<string,any[]>,rawOutput:string,result:any){
  const customerMessageCount=messages.filter(row=>row?.sender_role==='customer').length;
  const imageCount=Array.from(imagesByMessage.values()).reduce((sum,list)=>sum+list.length,0);
  const insert=await db.from('chat_customer_summary_runs').insert({
    customer_id:customer.id,
    customer_username:customer.username||null,
    customer_display_name:customer.display_name||null,
    message_count:messages.length,
    customer_message_count:customerMessageCount,
    image_count:imageCount,
    status:'done',
    raw_output:rawOutput,
    result_json:result,
    finished_at:new Date().toISOString(),
  }).select('id').single();
  if(insert.error)throw insert.error;
  const runId=String(insert.data?.id||'');
  const ack=await db.rpc('chat_customer_summary_finish_success',{
    p_customer_id:customer.id,
    p_claim_version:customer.claimVersion,
    p_run_id:runId||null,
    p_result:result,
  });
  if(ack.error)throw ack.error;
  return runId;
}

async function recordFailure(customer:any,error:unknown){
  const code=String((error as any)?.message||error||'scan_failed').slice(0,200);
  try{
    await db.from('chat_customer_summary_runs').insert({
      customer_id:customer.id,
      customer_username:customer.username||null,
      customer_display_name:customer.display_name||null,
      message_count:0,
      customer_message_count:0,
      image_count:0,
      status:'failed',
      raw_output:'',
      result_json:{items:[],notes:[]},
      error_code:code,
      finished_at:new Date().toISOString(),
    });
  }catch{}
  try{
    await db.rpc('chat_customer_summary_finish_failure',{
      p_customer_id:customer.id,
      p_claim_version:customer.claimVersion,
      p_error:code,
    });
  }catch{}
}

async function scanCustomer(customer:any,cfg:any,budget:AiBudget){
  const conversationIds=await loadConversationIds(customer.id);
  const messages=await loadConversationMessages(customer.id,conversationIds);
  const customerMessages=messages.filter(row=>row?.sender_role==='customer');
  if(!customerMessages.length){
    const emptyResult={items:[],notes:[],totalLines:0,totals:[]};
    const runId=await recordResult(customer,messages,new Map(),'',emptyResult);
    return {skipped:true,lineCount:0,runId};
  }

  const mediaMap=await loadCustomerImages(customer.id,messages);
  const imagesByMessage=await loadImageParts(messages,mediaMap);
  const hints=customerSpecificHints(customer);
  const parts:any[]=[{text:`${MASTER_PROMPT}\n${hints}\n\nLỊCH SỬ CHAT:\n${buildConversationHistory(messages)}`}];

  for(const row of messages){
    if(row?.sender_role!=='customer')continue;
    for(const image of imagesByMessage.get(String(row.id))||[]){
      appendImageReadVerify(parts,row,image);
    }
  }

  const rawOutput=await geminiRequest(cfg,parts,budget);
  const result=parseJsonResponse(rawOutput,messages);
  const runId=await recordResult(customer,messages,imagesByMessage,rawOutput,result);
  return {skipped:false,lineCount:result.totalLines,runId};
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const cfg=await runtimeConfig();
    const supplied=String(req.headers.get('x-customer-summary-key')||'');
    if(!cfg.scanKey||!supplied||supplied!==cfg.scanKey)return json({ok:false,error:'unauthorized'},401);
    if(!cfg.geminiKey)return json({ok:false,error:'ai_not_configured'},503);

    const customers=await claimCustomers();
    if(!customers.length)return json({ok:true,eligibleCustomers:0,scannedCustomers:0,aiCalls:0,failed:0,model:cfg.model,failoverUsed:false});

    const budget:AiBudget={calls:0};
    let activeCfg={...cfg};
    let failoverUsed=false;
    let scannedCustomers=0;
    let failed=0;
    const results:any[]=[];
    for(const customer of customers){
      try{
        let result:any;
        try{
          result=await scanCustomer(customer,activeCfg,budget);
        }catch(error){
          if(!failoverUsed&&activeCfg.model!==FALLBACK_MODEL&&retryableAiError(error)&&budget.calls<MAX_AI_CALLS_PER_RUN){
            failoverUsed=true;
            activeCfg={...cfg,model:FALLBACK_MODEL};
            result=await scanCustomer(customer,activeCfg,budget);
          }else{
            throw error;
          }
        }
        if(!result.skipped)scannedCustomers+=1;
        results.push({customerId:customer.id,username:customer.username,ok:true,lineCount:result.lineCount||0,runId:result.runId||null,claimVersion:customer.claimVersion,model:activeCfg.model});
      }catch(error){
        failed+=1;
        await recordFailure(customer,error);
        results.push({customerId:customer.id,username:customer.username,ok:false,error:String((error as any)?.message||error||'scan_failed'),claimVersion:customer.claimVersion,model:activeCfg.model});
        console.error('[v21-customer-summary-scan]',customer.id,String((error as any)?.message||error||'scan_failed'));
      }
    }

    return json({ok:true,eligibleCustomers:customers.length,scannedCustomers,aiCalls:budget.calls,failed,model:activeCfg.model,failoverUsed,results});
  }catch(error){
    console.error('[v21-customer-summary-scan:fatal]',String((error as any)?.message||error||'internal_error'));
    return json({ok:false,error:'scan_failed'},500);
  }
});
