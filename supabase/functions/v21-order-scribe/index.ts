import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { formatOrderItems, materializeAiSpans, parseQuickOrderText } from "./scribe-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const DEFAULT_MODEL='gemini-3.5-flash-lite';
const MAX_SOURCE_CHARS=6000;
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
async function latestInboundText(adminAccountId:string,contactId:string){
  const conversations=await db.from('v21_conversations')
    .select('id,member_a,member_b')
    .or(`and(member_a.eq.${adminAccountId},member_b.eq.${contactId}),and(member_a.eq.${contactId},member_b.eq.${adminAccountId})`)
    .limit(1)
    .maybeSingle();
  if(conversations.error)throw conversations.error;
  const conversationId=String(conversations.data?.id||'');
  if(!conversationId)throw new Error('conversation_not_found');
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
async function resolveSource(body:any,adminAccountId:string){
  const contactId=clean(body?.contactId,200);
  if(!contactId)throw new Error('contact_required');
  const explicit=clean(body?.text,MAX_SOURCE_CHARS);
  if(explicit)return {text:explicit,contactId,conversationId:null,messageId:null,source:'selection'};
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
async function aiSpans(source:string){
  const cfg=await runtimeConfig();
  if(!cfg.key)throw new Error('ai_not_configured');
  const model=cfg.model||DEFAULT_MODEL;
  const prompt=[
    'Bạn là người ghi đơn hàng. Chỉ tách SỐ LƯỢNG và RANH GIỚI TÊN HÀNG trong nguyên văn.',
    'TUYỆT ĐỐI không sửa chính tả, không đổi tên, không chuẩn hóa thương hiệu, đơn vị, dung tích, không tra catalog.',
    'Bạn KHÔNG được trả về tên hàng. Chỉ trả quantity, name_start, name_end.',
    'quantity là số lượng được hiểu từ số hoặc chữ số lượng (ví dụ một=1, hai=2, bốn=4).',
    'name_start/name_end là offset zero-based [start,end) trong chuỗi SOURCE. Tên cuối cùng sẽ do server cắt trực tiếp từ SOURCE.',
    'Dùng bảng SOURCE_INDEXED: mỗi token có [start:end]. name_start phải là start của token đầu tiên của tên; name_end là end của token cuối cùng của tên.',
    'Không đưa từ nối hội thoại như "và", "với", "nhé", "ạ" vào tên nếu chúng nằm giữa các mặt hàng; nhưng nếu từ đó thực sự nằm trong tên khách nói thì giữ.',
    '',
    'SOURCE:',source,
    '',
    'SOURCE_INDEXED:',indexedSource(source),
  ].join('\n');
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','x-goog-api-key':cfg.key},
    body:JSON.stringify({
      contents:[{role:'user',parts:[{text:prompt}]}],
      generationConfig:{
        temperature:0,
        responseMimeType:'application/json',
        responseSchema:{
          type:'OBJECT',
          properties:{
            items:{
              type:'ARRAY',
              items:{
                type:'OBJECT',
                properties:{
                  quantity:{type:'NUMBER'},
                  name_start:{type:'INTEGER'},
                  name_end:{type:'INTEGER'},
                },
                required:['quantity','name_start','name_end'],
              },
            },
          },
          required:['items'],
        },
      },
    }),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    console.error('[v21-order-scribe:gemini]',response.status,payload?.error?.message||'request_failed');
    throw new Error('ai_request_failed');
  }
  let parsed:any=null;
  try{parsed=JSON.parse(responseText(payload));}catch{throw new Error('ai_response_invalid');}
  return Array.isArray(parsed?.items)?parsed.items:[];
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
    const source=await resolveSource(body,String(admin.account.id));
    if(source.text.length>MAX_SOURCE_CHARS)return json({ok:false,error:'order_text_too_long'},400);

    if(action==='quick'){
      const parsed=parseQuickOrderText(source.text);
      if(!parsed.ok)return json({ok:false,error:parsed.error||'quick_parse_failed',source:source.source},422);
      return json({ok:true,mode:'quick',source:source.source,items:parsed.items,text:formatOrderItems(parsed.items)});
    }

    const spans=await aiSpans(source.text);
    const items=materializeAiSpans(source.text,spans);
    return json({ok:true,mode:'ai',source:source.source,items,text:formatOrderItems(items)});
  }catch(error){
    const code=String((error as any)?.message||error||'internal_error');
    const status=['contact_required','conversation_not_found','customer_message_not_found','order_text_required'].includes(code)?400:
      ['invalid_ai_span','ai_items_missing'].includes(code)?422:500;
    console.error('[v21-order-scribe]',code);
    return json({ok:false,error:code},status);
  }
});
