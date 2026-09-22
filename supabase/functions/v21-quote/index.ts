import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { buildQuoteItems, makePublicPayload } from "./quote-core.mjs";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const PUBLIC_QUOTE_BASE='https://chat.taphoa.xyz/b/?kh=';
const PUBLIC_DEBT_BASE='https://app.taphoa.xyz/no/?kh=';
const PUBLIC_PRODUCT_FIELDS='product_code,product_name,source_key,sale_price_vnd,carton_price_vnd,retail_price_vnd,input_price_basis,units_per_carton,retail_unit';
const CORE_SOURCE_LABELS=Object.freeze({
  'hang-thuong':'Hàng thường',
  'hang-u':'Hàng U',
  'sua':'Sữa',
  'thuoc-la':'Thuốc lá',
});
const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'vary':'Origin',
};

function clean(value:unknown,max=500){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}
function publicSlug(value:unknown){
  const slug=clean(value,100).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?slug:'';
}
function accessKeyFromHandle(value:unknown){
  const handle=clean(value,160);
  const at=handle.lastIndexOf('~');
  const key=at>=0?handle.slice(at+1):'';
  return /^[A-Za-z0-9_-]{16,32}$/.test(key)?key:'';
}
function json(data:unknown,status=200,extra:Record<string,string>={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8',...corsHeaders,...extra},
  });
}
function accessTokenFromRequest(req:Request){
  const header=clean(req.headers.get('authorization'),4000);
  if(!header.toLowerCase().startsWith('bearer '))return '';
  return clean(header.slice(7),4000);
}
function makeToken(){
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary='';
  for(const value of bytes)binary+=String.fromCharCode(value);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

async function requireAdmin(req:Request){
  const accessToken=accessTokenFromRequest(req);
  if(!accessToken)return {error:json({ok:false,error:'unauthorized'},401)};
  const userResult=await db.auth.getUser(accessToken);
  const user=userResult.data?.user;
  if(userResult.error||!user?.id)return {error:json({ok:false,error:'unauthorized'},401)};
  const account=await db.from("v21_accounts")
    .select('id,role')
    .eq('auth_user_id',user.id)
    .eq("role","admin")
    .is("deleted_at",null)
    .is("locked_at",null)
    .maybeSingle();
  if(account.error)return {error:json({ok:false,error:'account_lookup_failed'},500)};
  if(!account.data?.id)return {error:json({ok:false,error:'admin_required'},403)};
  return {accountId:String(account.data.id)};
}

async function customerAccount(customerId:string){
  if(!customerId)return null;
  const result=await db.from("v21_accounts")
    .select('id,username,display_name')
    .eq('id',customerId)
    .eq('role','user')
    .eq('contact_group','customer')
    .is('deleted_at',null)
    .is('locked_at',null)
    .maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}

async function ensureCustomerLinks(customerId:string){
  const account=await customerAccount(customerId);
  if(!account)throw new Error('customer_not_found');
  const ensured=await db.rpc('v21_customer_public_link_info_get_or_create',{p_customer_id:customerId});
  if(ensured.error)throw ensured.error;
  const slug=publicSlug(ensured.data?.public_slug);
  const accessKey=clean(ensured.data?.access_key,64);
  if(!slug||!/^[A-Za-z0-9_-]{16,32}$/.test(accessKey))throw new Error('public_link_failed');
  return {
    account,
    slug,
    accessKey,
    quote_url:`${PUBLIC_QUOTE_BASE}${encodeURIComponent(slug)}`,
    debt_url:`${PUBLIC_DEBT_BASE}${encodeURIComponent(slug)}`,
  };
}

async function resolvePublicCustomer(value:string){
  const slug=publicSlug(value);
  let link:any=null;

  if(slug){
    const bySlug=await db.from('v21_customer_public_links')
      .select('customer_account_id,access_key,public_slug')
      .eq('public_slug',slug)
      .is('revoked_at',null)
      .maybeSingle();
    if(bySlug.error)throw bySlug.error;
    link=bySlug.data||null;
  }

  if(!link){
    const accessKey=accessKeyFromHandle(value);
    if(!accessKey)return null;
    const legacy=await db.from('v21_customer_public_links')
      .select('customer_account_id,access_key,public_slug')
      .eq('access_key',accessKey)
      .is('revoked_at',null)
      .maybeSingle();
    if(legacy.error)throw legacy.error;
    link=legacy.data||null;
  }

  if(!link?.customer_account_id)return null;
  const account=await customerAccount(String(link.customer_account_id));
  return account?{account,accessKey:clean(link.access_key,64),publicSlug:clean(link.public_slug,100)}:null;
}

async function activeSources(){
  const result=await db.from("taphoa_sources")
    .select('source_key,name,sort_order')
    .eq('active',true)
    .eq('sync_status','active')
    .order('sort_order',{ascending:true})
    .order('source_key',{ascending:true});
  if(result.error)throw result.error;
  return (result.data||[])
    .map((row:any)=>{
      const sourceKey=clean(row?.source_key,100);
      return {
        source_key:sourceKey,
        source_name:(CORE_SOURCE_LABELS as Record<string,string>)[sourceKey]||clean(row?.name,200)||sourceKey,
        sort_order:Number(row?.sort_order)||0,
      };
    })
    .filter((row:any)=>row.source_key);
}

async function createQuote(req:Request){
  const admin=await requireAdmin(req);
  if(admin.error)return admin.error;

  let body:any={};
  try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}

  let sources;
  try{sources=await activeSources();}catch{return json({ok:false,error:'source_lookup_failed'},500);}
  if(clean(body?.action,40)==='sources')return json({ok:true,sources});

  const customerId=clean(body?.customer_account_id,80);
  let links:any;
  try{links=await ensureCustomerLinks(customerId);}
  catch(error){return json({ok:false,error:String((error as Error)?.message||'customer_not_found')},404);}

  if(clean(body?.action,40)==='customer-links'){
    return json({
      ok:true,
      customer_name:clean(links.account.display_name,80),
      public_slug:links.slug,
      quote_url:links.quote_url,
      debt_url:links.debt_url,
    });
  }

  const scope=clean(body?.scope,20);
  if(scope!=='all'&&scope!=='source')return json({ok:false,error:'invalid_scope'},400);

  const sourceMap=new Map(sources.map((row:any)=>[row.source_key,row]));
  let sourceKey:string|null=null;
  let sourceName:string|null='Tất cả';
  if(scope==='source'){
    sourceKey=clean(body?.source_key,100);
    if(!sourceKey)return json({ok:false,error:'source_key_required'},400);
    const source:any=sourceMap.get(sourceKey);
    if(!source)return json({ok:false,error:'source_not_found'},404);
    sourceName=source.source_name;
  }

  const allowedKeys=sources.map((row:any)=>row.source_key);
  if(!allowedKeys.length)return json({ok:false,error:'quote_empty'},422);

  let products=db.from("taphoa_products")
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq("is_active",true)
    .eq("sync_status","active")
    .is("deleted_at",null)
    .order('source_key',{ascending:true})
    .order('source_row',{ascending:true});
  if(scope==='source'&&sourceKey)products=products.eq('source_key',sourceKey);
  else products=products.in('source_key',allowedKeys);

  const productResult=await products;
  if(productResult.error)return json({ok:false,error:'product_lookup_failed'},500);
  const items=buildQuoteItems(productResult.data||[]);
  if(!items.length)return json({ok:false,error:'quote_empty'},422);

  const usedKeys=new Set(items.map((item:any)=>clean(item?.source_key,100)).filter(Boolean));
  const usedSources=scope==='all'
    ?sources
    :sources.filter((row:any)=>usedKeys.has(row.source_key));

  const token=makeToken();
  const inserted=await db.from("chat_quote_snapshots").insert({
    token,
    scope,
    source_key:sourceKey,
    source_name:sourceName,
    item_count:items.length,
    payload:{sources:usedSources},
    created_by:admin.accountId,
    customer_account_id:customerId,
  }).select('token,item_count,source_name').single();
  if(inserted.error)return json({ok:false,error:'quote_create_failed'},500);

  return json({
    ok:true,
    token,
    public_slug:links.slug,
    url:links.quote_url,
    customer_name:clean(links.account.display_name,80),
    item_count:Number(inserted.data.item_count)||items.length,
    source_name:clean(inserted.data.source_name,200)||sourceName,
    sources:usedSources,
  });
}

async function readQuote(req:Request){
  const url=new URL(req.url);
  const publicId=clean(url.searchParams.get('kh')||url.searchParams.get('k'),160);
  if(!publicId)return json({ok:false,error:'token_required'},400,{'cache-control':'no-store'});

  let snapshot:any=null;
  let publicCustomer:any=null;

  if(publicSlug(publicId)||accessKeyFromHandle(publicId)){
    try{publicCustomer=await resolvePublicCustomer(publicId);}
    catch{return json({ok:false,error:'quote_lookup_failed'},500,{'cache-control':'no-store'});}
    if(!publicCustomer)return json({ok:false,error:'quote_not_found'},404,{'cache-control':'no-store'});

    const latest=await db.from("chat_quote_snapshots")
      .select('scope,source_key,source_name,created_at')
      .eq('customer_account_id',publicCustomer.account.id)
      .is("revoked_at",null)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(latest.error)return json({ok:false,error:'quote_lookup_failed'},500,{'cache-control':'no-store'});
    snapshot=latest.data;
  }else{
    const legacy=await db.from("chat_quote_snapshots")
      .select('scope,source_key,source_name,created_at')
      .eq("token",publicId)
      .is("revoked_at",null)
      .maybeSingle();
    if(legacy.error)return json({ok:false,error:'quote_lookup_failed'},500,{'cache-control':'no-store'});
    snapshot=legacy.data;
  }

  if(!snapshot)return json({ok:false,error:'quote_not_found'},404,{'cache-control':'no-store'});

  let sources;
  try{sources=await activeSources();}
  catch{return json({ok:false,error:'source_lookup_failed'},500,{'cache-control':'no-store'});}

  const scope=clean(snapshot.scope,20)==='source'?'source':'all';
  const sourceKey=scope==='source'?clean(snapshot.source_key,100):'';
  if(scope==='source'&&!sources.some((row:any)=>row.source_key===sourceKey)){
    return json({ok:false,error:'quote_empty'},404,{'cache-control':'no-store'});
  }

  const allowedKeys=scope==='source'?[sourceKey]:sources.map((row:any)=>row.source_key);
  if(!allowedKeys.length)return json({ok:false,error:'quote_empty'},404,{'cache-control':'no-store'});

  let products=db.from("taphoa_products")
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq("is_active",true)
    .eq("sync_status","active")
    .is("deleted_at",null)
    .order('source_key',{ascending:true})
    .order('source_row',{ascending:true});
  products=scope==='source'?products.eq('source_key',sourceKey):products.in('source_key',allowedKeys);

  const productResult=await products;
  if(productResult.error)return json({ok:false,error:'product_lookup_failed'},500,{'cache-control':'no-store'});
  const items=buildQuoteItems(productResult.data||[]);
  if(!items.length)return json({ok:false,error:'quote_empty'},404,{'cache-control':'no-store'});

  const usedKeys=new Set(items.map((item:any)=>clean(item?.source_key,100)).filter(Boolean));
  const usedSources=scope==='all'
    ?sources
    :sources.filter((row:any)=>usedKeys.has(row.source_key));

  const liveSnapshot={...snapshot,item_count:items.length,payload:{items,sources:usedSources}};
  return json({
    ...makePublicPayload(liveSnapshot),
    customer_name:publicCustomer?clean(publicCustomer.account.display_name,80):null,
    generated_at:new Date().toISOString(),
  },200,{'cache-control':'no-store'});
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
    if(req.method==="POST")return await createQuote(req);
    if(req.method==="GET")return await readQuote(req);
    return json({ok:false,error:'method_not_allowed'},405);
  }catch(error){
    console.error('[v21-quote]',error);
    return json({ok:false,error:'internal_error'},500,{'cache-control':'no-store'});
  }
});
