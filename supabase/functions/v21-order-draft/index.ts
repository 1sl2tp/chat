import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { normalizeDraftLines, normalizePrice, productId } from "./draft-core.mjs";

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

function clean(value:unknown,max=240){
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
function serializeLine(row:any){
  return {
    id:String(row?.id||''),
    lineNo:Number(row?.line_no)||0,
    quantity:Number(row?.quantity)||0,
    rawName:String(row?.raw_name||''),
    productId:row?.product_id?String(row.product_id):null,
    productName:row?.product_name?String(row.product_name):null,
    unitPrice:row?.unit_price==null?null:Number(row.unit_price),
  };
}
function serializeDraft(row:any,lines:any[]){
  return {
    id:String(row?.id||''),
    contactId:String(row?.contact_id||''),
    conversationId:row?.conversation_id?String(row.conversation_id):null,
    customerName:String(row?.customer_name||'Liên hệ'),
    status:String(row?.status||'draft'),
    createdAt:String(row?.created_at||''),
    updatedAt:String(row?.updated_at||''),
    lines:(Array.isArray(lines)?lines:[]).map(serializeLine),
  };
}
async function ownedDraft(adminId:string,draftId:string){
  const result=await db.from('chat_order_drafts')
    .select('id,contact_id,conversation_id,customer_name,status,created_at,updated_at,created_by_account_id')
    .eq('id',draftId)
    .eq('created_by_account_id',adminId)
    .maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.id)throw new Error('draft_not_found');
  return result.data;
}
async function loadDraft(adminId:string,draftId:string){
  const draft=await ownedDraft(adminId,draftId);
  const lines=await db.from('chat_order_draft_lines')
    .select('id,draft_id,line_no,quantity,raw_name,product_id,product_name,unit_price')
    .eq('draft_id',draftId)
    .order('line_no',{ascending:true});
  if(lines.error)throw lines.error;
  return serializeDraft(draft,lines.data||[]);
}
async function ownedLine(adminId:string,draftId:string,lineId:string){
  await ownedDraft(adminId,draftId);
  const result=await db.from('chat_order_draft_lines')
    .select('id,draft_id,line_no,quantity,raw_name,product_id,product_name,unit_price')
    .eq('id',lineId)
    .eq('draft_id',draftId)
    .maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.id)throw new Error('line_not_found');
  return result.data;
}
async function touchDraft(draftId:string){
  const result=await db.from('chat_order_drafts')
    .update({updated_at:new Date().toISOString()})
    .eq('id',draftId);
  if(result.error)throw result.error;
}
async function createFromLines(body:any,adminId:string){
  const contactId=clean(body?.contactId,80);
  const conversationId=clean(body?.conversationId,80)||null;
  if(!contactId)throw new Error('contact_required');
  const lines=normalizeDraftLines(body?.lines);
  const contact=await db.from('v21_accounts')
    .select('id,display_name,username')
    .eq('id',contactId)
    .is('deleted_at',null)
    .maybeSingle();
  if(contact.error)throw contact.error;
  if(!contact.data?.id)throw new Error('contact_not_found');

  if(conversationId){
    const conversation=await db.from('v21_conversations')
      .select('id,member_a,member_b')
      .eq('id',conversationId)
      .maybeSingle();
    if(conversation.error)throw conversation.error;
    const a=String(conversation.data?.member_a||'');
    const b=String(conversation.data?.member_b||'');
    const pairOk=(a===adminId&&b===contactId)||(a===contactId&&b===adminId);
    if(!conversation.data?.id||!pairOk)throw new Error('conversation_mismatch');
  }

  const customerName=clean(contact.data.display_name||contact.data.username||body?.customerName||'Liên hệ',200)||'Liên hệ';
  const created=await db.rpc('chat_order_draft_create',{
    p_contact_id:contactId,
    p_conversation_id:conversationId,
    p_customer_name:customerName,
    p_created_by_account_id:adminId,
    p_lines:lines,
  });
  if(created.error)throw created.error;
  const draftId=String(created.data||'');
  if(!draftId)throw new Error('draft_create_failed');
  return await loadDraft(adminId,draftId);
}
async function listDrafts(adminId:string){
  const drafts=await db.from('chat_order_drafts')
    .select('id,contact_id,customer_name,created_at,updated_at')
    .eq('created_by_account_id',adminId)
    .eq('status','draft')
    .order('updated_at',{ascending:false})
    .limit(100);
  if(drafts.error)throw drafts.error;
  const rows=Array.isArray(drafts.data)?drafts.data:[];
  if(!rows.length)return [];
  const ids=rows.map((row:any)=>String(row.id));
  const lines=await db.from('chat_order_draft_lines')
    .select('draft_id,product_id')
    .in('draft_id',ids);
  if(lines.error)throw lines.error;
  const counts=new Map<string,{total:number,mapped:number}>();
  for(const row of lines.data||[]){
    const id=String((row as any).draft_id||'');
    const count=counts.get(id)||{total:0,mapped:0};
    count.total+=1;
    if((row as any).product_id)count.mapped+=1;
    counts.set(id,count);
  }
  return rows.map((row:any)=>{
    const count=counts.get(String(row.id))||{total:0,mapped:0};
    return {
      id:String(row.id),
      contactId:String(row.contact_id||''),
      customerName:String(row.customer_name||'Liên hệ'),
      total:count.total,
      mapped:count.mapped,
      createdAt:String(row.created_at||''),
      updatedAt:String(row.updated_at||''),
    };
  });
}
async function updateQuantity(body:any,adminId:string){
  const draftId=clean(body?.draftId,80);
  const lineId=clean(body?.lineId,80);
  const quantity=Number(body?.quantity);
  if(!draftId||!lineId)throw new Error('line_required');
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('invalid_draft_line');
  await ownedLine(adminId,draftId,lineId);
  const updated=await db.from('chat_order_draft_lines')
    .update({quantity,updated_at:new Date().toISOString()})
    .eq('id',lineId)
    .eq('draft_id',draftId)
    .select('id,draft_id,line_no,quantity,raw_name,product_id,product_name,unit_price')
    .single();
  if(updated.error)throw updated.error;
  await touchDraft(draftId);
  return serializeLine(updated.data);
}
function escapedLike(value:string){
  return value.replace(/[\\%_]/g,match=>`\\${match}`);
}
async function searchProducts(body:any){
  const query=clean(body?.query,120);
  let request=db.from('products')
    .select('id,name,price')
    .eq('active',true)
    .order('name',{ascending:true})
    .limit(20);
  if(query)request=request.ilike('name',`%${escapedLike(query)}%`);
  const result=await request;
  if(result.error)throw result.error;
  return (result.data||[]).map((row:any)=>({id:String(row.id),name:String(row.name),price:Number(row.price)||0}));
}
async function activeProduct(productIdValue:string){
  const result=await db.from('products')
    .select('id,name,price')
    .eq('id',productIdValue)
    .eq('active',true)
    .maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.id)throw new Error('product_not_found');
  return {id:String(result.data.id),name:String(result.data.name),price:Number(result.data.price)||0};
}
async function snapshotProduct(adminId:string,draftId:string,lineId:string,product:{id:string,name:string,price:number}){
  await ownedLine(adminId,draftId,lineId);
  const updated=await db.from('chat_order_draft_lines')
    .update({
      product_id:product.id,
      product_name:product.name,
      unit_price:product.price,
      updated_at:new Date().toISOString(),
    })
    .eq('id',lineId)
    .eq('draft_id',draftId)
    .select('id,draft_id,line_no,quantity,raw_name,product_id,product_name,unit_price')
    .single();
  if(updated.error)throw updated.error;
  await touchDraft(draftId);
  return serializeLine(updated.data);
}
async function selectProduct(body:any,adminId:string){
  const draftId=clean(body?.draftId,80);
  const lineId=clean(body?.lineId,80);
  const selectedId=clean(body?.productId,160);
  if(!draftId||!lineId)throw new Error('line_required');
  if(!selectedId)throw new Error('product_required');
  const product=await activeProduct(selectedId);
  return await snapshotProduct(adminId,draftId,lineId,product);
}
async function insertNewProduct(name:string,price:number){
  for(let attempt=0;attempt<2;attempt+=1){
    const id=productId(crypto.randomUUID());
    const inserted=await db.from('products')
      .insert({id,name,price,active:true})
      .select('id,name,price')
      .single();
    if(!inserted.error){
      return {id:String(inserted.data.id),name:String(inserted.data.name),price:Number(inserted.data.price)||0};
    }
    if(String((inserted.error as any)?.code||'')!=='23505')throw inserted.error;
  }
  throw new Error('product_create_failed');
}
async function createProduct(body:any,adminId:string){
  const draftId=clean(body?.draftId,80);
  const lineId=clean(body?.lineId,80);
  const name=clean(body?.name,240);
  if(!draftId||!lineId)throw new Error('line_required');
  if(!name)throw new Error('product_name_required');
  const price=normalizePrice(body?.price);
  await ownedLine(adminId,draftId,lineId);
  const product=await insertNewProduct(name,price);
  const line=await snapshotProduct(adminId,draftId,lineId,product);
  return {product,line};
}
function errorStatus(code:string){
  if(['unauthorized'].includes(code))return 401;
  if(['admin_required'].includes(code))return 403;
  if(['draft_not_found','line_not_found','contact_not_found','product_not_found'].includes(code))return 404;
  if(['invalid_draft_line','invalid_price','draft_lines_required'].includes(code))return 422;
  if(['invalid_action','invalid_json','contact_required','conversation_mismatch','line_required','product_required','product_name_required'].includes(code))return 400;
  return 500;
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const admin=await requireAdmin(req);
    if(admin.error)return admin.error;
    let body:any={};
    try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    const action=clean(body?.action,40).toLowerCase();
    const adminId=String(admin.account.id);

    if(action==='create_from_lines')return json({ok:true,draft:await createFromLines(body,adminId)});
    if(action==='get')return json({ok:true,draft:await loadDraft(adminId,clean(body?.draftId,80))});
    if(action==='list')return json({ok:true,drafts:await listDrafts(adminId)});
    if(action==='update_quantity')return json({ok:true,line:await updateQuantity(body,adminId)});
    if(action==='search_products')return json({ok:true,products:await searchProducts(body)});
    if(action==='select_product')return json({ok:true,line:await selectProduct(body,adminId)});
    if(action==='create_product'){
      const created=await createProduct(body,adminId);
      return json({ok:true,...created});
    }
    return json({ok:false,error:'invalid_action'},400);
  }catch(error){
    const code=String((error as any)?.message||error||'internal_error');
    console.error('[v21-order-draft]',code);
    return json({ok:false,error:code},errorStatus(code));
  }
});
