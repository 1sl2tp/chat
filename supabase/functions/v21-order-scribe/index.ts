import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { formatOrderItems, materializeAiImageTranscriptions, materializeAiSpans, parseQuickOrderText } from "./scribe-core.mjs";

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
function indexedSource(source:string){
  const entries=[];
  const matcher=/\S+/gu;
  for(const match of source.matchAll(matcher)){
    const start=Number(match.index)||0;
    const token=String(match[0]||'');
    entries.push(`[${start}:${start+token.length}]${token}`);
  }
  return entries.join(' ');
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
async function geminiRequest(cfg:any,parts:any[],responseSchema:any){
  const model=cfg.model||DEFAULT_MODEL;
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response:Response;
  try{
    response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','x-goog-api-key':cfg.key},
      body:JSON.stringify({
        contents:[{role:'user',parts}],
        generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema},
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
  let parsed:any=null;
  try{parsed=JSON.parse(responseText(payload));}catch{throw new Error('ai_response_invalid');}
  return parsed;
}
async function aiSpans(source:string){
  const cfg=await runtimeConfig();
  if(!cfg.key)throw new Error('ai_not_configured');
  const prompt=[
    'Bạn là người ghi đơn hàng. Chỉ tách SỐ LƯỢNG và RANH GIỚI TÊN HÀNG trong nguyên văn.',
    'TUYỆT ĐỐI không sửa chính tả, không đổi tên, không chuẩn hóa thương hiệu, đơn vị, dung tích, không tra catalog.',
    'Bạn KHÔNG được trả về tên hàng. Chỉ trả quantity, quantity_text, name_start, name_end.',
    'quantity_text giữ nguyên ký hiệu số lượng khách viết/nói nếu nhìn thấy, ví dụ "1th", "2 thùng", "3".',
    'quantity là số lượng được hiểu từ số hoặc chữ số lượng (ví dụ một=1, hai=2, bốn=4).',
    'name_start/name_end là offset zero-based [start,end) trong chuỗi SOURCE. Tên cuối cùng sẽ do server cắt trực tiếp từ SOURCE.',
    'Dùng bảng SOURCE_INDEXED: mỗi token có [start:end]. name_start phải là start của token đầu tiên của tên; name_end là end của token cuối cùng của tên.',
    'Không đưa từ nối hội thoại như "và", "với", "nhé", "ạ" vào tên nếu chúng nằm giữa các mặt hàng; nhưng nếu từ đó thực sự nằm trong tên khách nói thì giữ.',
    '',
    'SOURCE:',source,
    '',
    'SOURCE_INDEXED:',indexedSource(source),
  ].join('\n');
  const parsed=await geminiRequest(cfg,[{text:prompt}],{
    type:'OBJECT',
    properties:{
      items:{
        type:'ARRAY',items:{
          type:'OBJECT',
          properties:{
            quantity:{type:'NUMBER'},quantity_text:{type:'STRING'},name_start:{type:'INTEGER'},name_end:{type:'INTEGER'},
          },
          required:['quantity','quantity_text','name_start','name_end'],
        },
      },
    },
    required:['items'],
  });
  return Array.isArray(parsed?.items)?parsed.items:[];
}
async function aiVision(source:string,images:any[]){
  const cfg=await runtimeConfig();
  if(!cfg.key)throw new Error('ai_not_configured');
  const prompt=[
    'Bạn đang đọc ghi chú đặt hàng từ Chat. Với phần ẢNH, nhiệm vụ bước đầu tiên và duy nhất của Vision là CHÉP NGUYÊN VĂN từng dòng chữ nhìn thấy.',
    'KHÔNG tra database/catalog, KHÔNG tìm SKU, KHÔNG chuẩn hóa thương hiệu, KHÔNG sửa chính tả, KHÔNG suy diễn từ ngữ theo nghĩa sản phẩm.',
    'Ví dụ nếu nét chữ trông như "tuýp" thì chép đúng nét nhìn thấy; không đổi thành một từ có vẻ hợp nghĩa hơn như "truyền".',
    'VỚI MỖI ẢNH: TRƯỚC KHI CHÉP, xác định hướng chữ đúng và xoay ảnh trong nhận thức theo 0/90/180/270 độ để chữ đứng đúng chiều như người gửi đang nhìn.',
    'Sau khi xoay đúng hướng, đọc theo bố cục thật: giữ thứ tự dòng, cột, dấu :, dấu gạch lặp và ký hiệu SL đúng như trên giấy.',
    'Mỗi phần tử image_lines chỉ có text là dòng CHÉP NGUYÊN VĂN và uncertain. KHÔNG tách quantity/name trong Vision.',
    'Nếu một chữ không chắc, giữ cách đọc sát nét nhất và đặt uncertain=true. Không được bịa để làm câu có vẻ đúng.',
    'Nếu SOURCE_TEXT có chữ chat, chỉ phần text_items mới dùng offset; KHÔNG viết lại tên trong text_items.',
    '',
    'SOURCE_TEXT:',source||'(trống)',
    '',
    'SOURCE_INDEXED:',source?indexedSource(source):'(trống)',
  ].join('\n');
  const parts:any[]=[{text:prompt}];
  images.forEach((image,index)=>{
    parts.push({text:`ẢNH ${index+1}: xoay đúng hướng trước, sau đó chép nguyên văn từng dòng. Không suy diễn.`});
    parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
  });
  const parsed=await geminiRequest(cfg,parts,{
    type:'OBJECT',
    properties:{
      text_items:{
        type:'ARRAY',items:{
          type:'OBJECT',
          properties:{quantity:{type:'NUMBER'},quantity_text:{type:'STRING'},name_start:{type:'INTEGER'},name_end:{type:'INTEGER'}},
          required:['quantity','quantity_text','name_start','name_end'],
        },
      },
      image_lines:{
        type:'ARRAY',items:{
          type:'OBJECT',
          properties:{text:{type:'STRING'},uncertain:{type:'BOOLEAN'}},
          required:['text','uncertain'],
        },
      },
    },
    required:['text_items','image_lines'],
  });
  return{
    textItems:Array.isArray(parsed?.text_items)?parsed.text_items:[],
    imageLines:Array.isArray(parsed?.image_lines)?parsed.image_lines:[],
  };
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

    if(!imageAssetIds.length){
      const spans=await aiSpans(source.text);
      const items=materializeAiSpans(source.text,spans);
      return json({ok:true,mode:'ai',source:source.source,items,text:formatOrderItems(items)});
    }

    const images=await loadInboundImages(String(admin.account.id),source.contactId,imageAssetIds);
    const vision=await aiVision(source.text,images);
    const textItems=source.text&&vision.textItems.length?materializeAiSpans(source.text,vision.textItems):[];
    const imageParsed=vision.imageLines.length?materializeAiImageTranscriptions(vision.imageLines):{items:[],unresolved:[]};
    const items=[...textItems,...imageParsed.items];
    const unresolved=imageParsed.unresolved;
    if(!items.length&&!unresolved.length)throw new Error('ai_items_missing');
    return json({ok:true,mode:'ai',source:source.source,items,unresolved,text:formatOrderItems(items)});
  }catch(error){
    const code=String((error as any)?.message||error||'internal_error');
    const status=['contact_required','conversation_not_found','customer_message_not_found','order_text_required','source_image_not_found'].includes(code)?400:
      ['invalid_ai_span','invalid_ai_image_item','ai_items_missing','ai_response_invalid'].includes(code)?422:
      ['ai_unavailable','image_unavailable'].includes(code)?503:500;
    console.error('[v21-order-scribe]',code);
    return json({ok:false,error:code},status);
  }
});
