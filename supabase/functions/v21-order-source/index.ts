import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { clean, normalizeState } from "./source-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'POST,OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'access-control-max-age':'600',
  'vary':'Origin',
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...corsHeaders},
  });
}
function tokenFrom(req:Request){
  const header=String(req.headers.get('authorization')||'').trim();
  return header.toLowerCase().startsWith('bearer ')?header.slice(7).trim():'';
}
async function requireAdmin(req:Request){
  const token=tokenFrom(req);
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
  const result=await db.from('v21_conversations')
    .select('id,member_a,member_b')
    .or(`and(member_a.eq.${adminAccountId},member_b.eq.${contactId}),and(member_a.eq.${contactId},member_b.eq.${adminAccountId})`)
    .limit(1)
    .maybeSingle();
  if(result.error)throw result.error;
  const id=String(result.data?.id||'');
  if(!id)throw new Error('conversation_not_found');
  return id;
}
async function requireInboundMessage(conversationId:string,contactId:string,messageId:string){
  const result=await db.from('v21_messages')
    .select('id,body,created_at,sender_account_id,conversation_id')
    .eq('id',messageId)
    .eq('conversation_id',conversationId)
    .eq('sender_account_id',contactId)
    .is('deleted_at',null)
    .maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.id)throw new Error('source_message_not_found');
  return result.data;
}
function validRange(from:string,to:string){
  const a=Date.parse(from),b=Date.parse(to);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw new Error('invalid_date_range');
}

async function listSources(adminId:string,body:any){
  const contactId=clean(body?.contactId,200);
  const from=clean(body?.from,80);
  const to=clean(body?.to,80);
  if(!contactId)throw new Error('contact_required');
  validRange(from,to);
  const conversationId=await resolveConversation(adminId,contactId);
  const messages=await db.from('v21_messages')
    .select('id,body,created_at,sender_account_id')
    .eq('conversation_id',conversationId)
    .eq('sender_account_id',contactId)
    .is('deleted_at',null)
    .gte('created_at',from)
    .lt('created_at',to)
    .order('created_at',{ascending:true});
  if(messages.error)throw messages.error;
  const rows=Array.isArray(messages.data)?messages.data:[];
  const ids=rows.map((row:any)=>String(row?.id||'')).filter(Boolean);

  let states:any[]=[];
  let mediaRows:any[]=[];
  if(ids.length){
    const [stateResult,mediaResult]=await Promise.all([
      db.from('chat_order_source_states')
        .select('message_id,state,linked_draft_id,linked_external_order_id,linked_external_order_no,updated_at')
        .eq('admin_account_id',adminId)
        .in('message_id',ids),
      db.from('v21_media_assets')
        .select('id,message_id,mime_type,width_px,height_px,sort_index,created_at')
        .eq('conversation_id',conversationId)
        .eq('owner_account_id',contactId)
        .eq('kind','image')
        .is('deleted_at',null)
        .in('message_id',ids)
        .order('sort_index',{ascending:true})
        .order('created_at',{ascending:true}),
    ]);
    if(stateResult.error)throw stateResult.error;
    if(mediaResult.error)throw mediaResult.error;
    states=Array.isArray(stateResult.data)?stateResult.data:[];
    mediaRows=Array.isArray(mediaResult.data)?mediaResult.data:[];
  }

  const stateMap=new Map(states.map((row:any)=>[String(row.message_id),row]));
  const imageMap=new Map<string,any[]>();
  for(const asset of mediaRows){
    const messageId=String(asset?.message_id||'');
    if(!messageId)continue;
    const list=imageMap.get(messageId)||[];
    list.push({
      assetId:String(asset?.id||''),
      mimeType:String(asset?.mime_type||'image/jpeg'),
      widthPx:Number(asset?.width_px)||null,
      heightPx:Number(asset?.height_px)||null,
    });
    imageMap.set(messageId,list);
  }

  // Read-only history: do not pre-decide which messages look like orders.
  // The incremental AI scanner owns semantic filtering for NEW customer input.
  const items=rows.map((row:any)=>{
    const messageId=String(row.id||'');
    const state:any=stateMap.get(messageId)||{};
    const imageAssets=imageMap.get(messageId)||[];
    return {
      messageId,
      text:String(row.body||''),
      createdAt:String(row.created_at||''),
      state:String(state.state||'pending'),
      imageAssets,
      linkedDraftId:state.linked_draft_id?String(state.linked_draft_id):null,
      linkedExternalOrderId:state.linked_external_order_id?String(state.linked_external_order_id):null,
      linkedExternalOrderNo:state.linked_external_order_no?String(state.linked_external_order_no):null,
    };
  });
  return {ok:true,conversationId,items};
}

async function setState(adminId:string,body:any){
  const contactId=clean(body?.contactId,200);
  const messageId=clean(body?.messageId,200);
  if(!contactId)throw new Error('contact_required');
  if(!messageId)throw new Error('message_required');
  const state=normalizeState(body?.state);
  const conversationId=await resolveConversation(adminId,contactId);
  await requireInboundMessage(conversationId,contactId,messageId);
  const payload={
    message_id:messageId,
    admin_account_id:adminId,
    contact_id:contactId,
    conversation_id:conversationId,
    state,
    updated_at:new Date().toISOString(),
  };
  const result=await db.from('chat_order_source_states').upsert(payload,{onConflict:'message_id,admin_account_id'});
  if(result.error)throw result.error;
  return {ok:true,state};
}

async function markImported(adminId:string,body:any){
  const contactId=clean(body?.contactId,200);
  if(!contactId)throw new Error('contact_required');
  const messageIds=Array.from(new Set((Array.isArray(body?.messageIds)?body.messageIds:[])
    .map((value:any)=>clean(value,200)).filter(Boolean))).slice(0,100);
  if(!messageIds.length)throw new Error('message_required');
  const conversationId=await resolveConversation(adminId,contactId);
  const messages=await db.from('v21_messages')
    .select('id')
    .eq('conversation_id',conversationId)
    .eq('sender_account_id',contactId)
    .is('deleted_at',null)
    .in('id',messageIds);
  if(messages.error)throw messages.error;
  const validIds=(Array.isArray(messages.data)?messages.data:[]).map((row:any)=>String(row.id||'')).filter(Boolean);
  if(validIds.length!==messageIds.length)throw new Error('source_message_not_found');
  const externalOrderId=clean(body?.externalOrderId,300)||null;
  const externalOrderNo=clean(body?.externalOrderNo,300)||null;
  const linkedDraftId=clean(body?.linkedDraftId,200)||null;
  const now=new Date().toISOString();
  const payload=validIds.map(messageId=>({
    message_id:messageId,
    admin_account_id:adminId,
    contact_id:contactId,
    conversation_id:conversationId,
    state:'imported',
    linked_draft_id:linkedDraftId,
    linked_external_order_id:externalOrderId,
    linked_external_order_no:externalOrderNo,
    updated_at:now,
  }));
  const result=await db.from('chat_order_source_states').upsert(payload,{onConflict:'message_id,admin_account_id'});
  if(result.error)throw result.error;
  return {ok:true,count:payload.length};
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const admin=await requireAdmin(req);
    if(admin.error)return admin.error;
    let body:any={};
    try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    const action=clean(body?.action,30).toLowerCase();
    if(action==='list')return json(await listSources(String(admin.account.id),body));
    if(action==='set_state')return json(await setState(String(admin.account.id),body));
    if(action==='mark_imported')return json(await markImported(String(admin.account.id),body));
    return json({ok:false,error:'invalid_action'},400);
  }catch(error){
    const code=String((error as any)?.message||error||'internal_error');
    const status=['contact_required','message_required','conversation_not_found','source_message_not_found','invalid_date_range','invalid_source_state'].includes(code)?400:500;
    console.error('[v21-order-source]',code);
    return json({ok:false,error:code},status);
  }
});
