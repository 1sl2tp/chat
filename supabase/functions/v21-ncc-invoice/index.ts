// NCC-001: Admin-only supplier invoice OCR/review. No message sends, ledger writes or price updates.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {nameKey,validatePrintedInvoice,matchSupplierLine} from './invoice-core.mjs';

const URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'*',
 'access-control-allow-headers':'authorization, apikey, x-client-info, content-type',
 'access-control-allow-methods':'POST, OPTIONS'
};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const fail=(code:string,status=400)=>respond({ok:false,code},status);
async function requireAdmin(req:Request){
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')?.[1];
 if(!token)return null;
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.id)return null;
 const {data:account}=await db.from('v21_accounts').select('id,role,locked_at')
  .eq('auth_user_id',user.id).eq('role','admin').is('locked_at',null).is('deleted_at',null).maybeSingle();
 return account||null;
}
async function getDocument(id:string){
 if(!UUID.test(id))return null;
 const {data}=await db.from('chat_ncc_invoices').select('*').eq('id',id).maybeSingle();
 return data||null;
}
async function getLines(id:string){
 const {data}=await db.from('chat_ncc_invoice_lines').select('*').eq('invoice_id',id).order('row_no');
 return data||[];
}
async function readCatalog(){
 const {data,error}=await db.from('taphoa_products')
  .select('product_code,product_name,source_key,retail_unit,input_price_basis,input_price_vnd,units_per_carton,is_active,sync_status,deleted_at')
  .eq('is_active',true).is('deleted_at',null).order('product_code').limit(5000);
 if(error)throw new Error('catalog_unavailable');
 return data||[];
}
function mimeOk(mime:string){return ['image/jpeg','image/png','image/webp'].includes(String(mime||'').toLowerCase());}
async function sha256(bytes:Uint8Array){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function encodeB64(bytes:Uint8Array){
 let chars='';
 for(let i=0;i<bytes.length;i+=8192)chars+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(chars);
}
async function ocrImage(bytes:Uint8Array,mime:string){
 const key=Deno.env.get('GEMINI_API_KEY');
 if(!key)throw new Error('ai_not_configured');
 const prompt=`Read this image as a Vietnamese PRINTED supplier delivery/invoice note. Output ONE JSON object only:
{"classification":"supplier_invoice"|"other","date":"dd/mm/yyyy"|null,"invoiceNumber":string|null,"printedTotalVnd":integer|null,"lines":[{"printedName":string,"printedUnit":string|null,"quantity":number,"unitPriceVnd":integer,"lineTotalVnd":integer}]}.
Read only the printed item table. Exclude handwritten notes, signatures, contact numbers and headers from rows.
The date MUST be the date printed ON THE DOCUMENT, never today's date, chat message time, or printing time if an invoice date exists.
invoiceNumber must be the clearly printed invoice/document identifier; never invent one. Differentiate receipt/payment/bank transfer from supplier stock invoice.
Do NOT infer/complete missing numbers. Copy abbreviations as printed. Currency integers VND. If missing/ambiguous a critical number, use null so it fails validation.
Preserve row order, distinguish distinct SKUs and packaging, do not infer units where cells are blank.
No explanatory prose or markdown.`;
 const body={contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:mime,data:encodeB64(bytes)}}]}],
  generationConfig:{temperature:0,responseMimeType:'application/json'}};
 const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key='+encodeURIComponent(key),
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error('ai_unavailable');
 const response=await res.json();
 const raw=String(response?.candidates?.[0]?.content?.parts?.find((p:any)=>typeof p.text==='string')?.text||'');
 if(!raw)throw new Error('ai_empty');
 const json=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
 try{return JSON.parse(json);}catch{throw new Error('ai_invalid_json');}
}
async function analyze(invoice:any){
 const {data:claimed}=await db.from('chat_ncc_invoices').update({status:'processing',note:null,updated_at:new Date().toISOString()})
  .eq('id',invoice.id).in('status',['pending','failed','needs_review']).select().maybeSingle();
 if(!claimed)return fail('already_processing_or_final',409);
 try{
  const isManual=invoice.origin==='manual';
  let mime='',bytes:Uint8Array;
  if(isManual){
   if(!String(invoice.manual_storage_key||'').startsWith('ncc-manual/'))throw new Error('invalid_manual_path');
   const {data:file,error}=await db.storage.from('v21-media').download(invoice.manual_storage_key);
   if(error||!file)throw new Error('image_unavailable');
   mime=String(file.type||'image/jpeg').toLowerCase();
   bytes=new Uint8Array(await file.arrayBuffer());
  }else{
  const {data:media,error:mediaError}=await db.from('v21_media_assets')
   .select('id,message_id,conversation_id,owner_account_id,kind,mime_type,size_bytes,storage_key,deleted_at')
   .eq('id',invoice.media_asset_id).is('deleted_at',null).maybeSingle();
  if(mediaError||!media||media.kind!=='image'||!mimeOk(media.mime_type)||
     media.owner_account_id!==invoice.chat_account_id||media.message_id!==invoice.message_id||
     !media.storage_key||media.size_bytes<100||media.size_bytes>4000000)
      throw new Error('invalid_media');
  const {data:account}=await db.from('v21_accounts').select('id,role,contact_group')
   .eq('id',invoice.chat_account_id).is('deleted_at',null).maybeSingle();
  if(!account||(!isManual&&(account.role!=='user'||account.contact_group!=='ncc')))
   throw new Error('not_ncc_sender');
  const {data:file,error:downloadError}=await db.storage.from('v21-media').download(media.storage_key);
  if(downloadError||!file)throw new Error('image_unavailable');
  bytes=new Uint8Array(await file.arrayBuffer());
  mime=media.mime_type;
  }
  if(!mimeOk(mime)||bytes.length<100||bytes.length>4000000)throw new Error('invalid_media_size');
  const hash=await sha256(bytes);
  const {data:existing}=await db.from('chat_ncc_invoices').select('id')
    .eq('chat_account_id',invoice.chat_account_id).eq('image_sha256',hash).neq('id',invoice.id).limit(1);
  if(existing?.length){
   await db.from('chat_ncc_invoices').update({status:'duplicate',note:'same_supplier_image',image_sha256:hash})
     .eq('id',invoice.id);
   return respond({ok:true,status:'duplicate'});
  }
  const raw=await ocrImage(bytes,mime);
  const checked=validatePrintedInvoice(raw);
  if(checked.reason==='not_supplier_invoice'){
   await db.from('chat_ncc_invoices').update({status:'not_invoice',image_sha256:hash,note:'not_supplier_invoice'})
     .eq('id',invoice.id);
   return respond({ok:true,status:'not_invoice'});
  }
  if(!checked.ok){
   await db.from('chat_ncc_invoices').update({status:'needs_review',image_sha256:hash,note:checked.reason})
     .eq('id',invoice.id);
   return respond({ok:true,status:'needs_review',reason:checked.reason});
  }
  if(checked.invoiceNumber){
   const {data:duplicates}=await db.from('chat_ncc_invoices').select('id')
    .eq('chat_account_id',invoice.chat_account_id).eq('invoice_date',checked.date)
    .ilike('invoice_number',checked.invoiceNumber).neq('id',invoice.id).limit(1);
   if(duplicates?.length){
    await db.from('chat_ncc_invoices').update({status:'duplicate',image_sha256:hash,note:'same_supplier_date_number'})
      .eq('id',invoice.id);
    return respond({ok:true,status:'duplicate'});
   }
  }
  const products=await readCatalog();
  const {data:aliases}=await db.from('chat_ncc_product_aliases').select('*')
     .eq('chat_account_id',invoice.chat_account_id);
  const matched=checked.lines.map((x:any)=>{
   const match=matchSupplierLine(x,products,aliases||[],invoice.chat_account_id);
   return {invoice_id:invoice.id,row_no:x.row,printed_name:x.printedName,printed_unit:x.printedUnit,
    quantity:x.quantity,unit_price_vnd:x.unitPriceVnd,line_total_vnd:x.lineTotalVnd,
    product_code:match.product_code||null,match_method:match.status==='matched'?match.method:'unmatched',
    unit_factor:match.status==='matched'?match.unitFactor:null,
    normalized_cost_vnd:match.status==='matched'?match.costVnd:null,
    review_required:match.status!=='matched'};
  });
  const {error:deleteError}=await db.from('chat_ncc_invoice_lines').delete().eq('invoice_id',invoice.id);
  if(deleteError)throw new Error('line_save_failed');
  const {error:linesError}=await db.from('chat_ncc_invoice_lines').insert(matched);
  if(linesError)throw new Error('line_save_failed');
  const status=matched.every((x:any)=>!x.review_required)?'matched':'needs_review';
  const {error:updateError}=await db.from('chat_ncc_invoices').update({
   image_sha256:hash,invoice_date:checked.date,invoice_number:checked.invoiceNumber,
   printed_total_vnd:checked.total,ocr_lines:checked.lines,status,updated_at:new Date().toISOString(),note:null
  }).eq('id',invoice.id);
  if(updateError)throw new Error('invoice_save_failed');
  return respond({ok:true,status,matched:matched.length-matched.filter((x:any)=>x.review_required).length,
    manual:matched.filter((x:any)=>x.review_required).length});
 }catch(error){
  const code=String((error as Error)?.message||'scan_failed').slice(0,80);
  await db.from('chat_ncc_invoices').update({status:'failed',note:code,updated_at:new Date().toISOString()})
    .eq('id',invoice.id);
  return fail('scan_unavailable',503);
 }
}
function decodeImageBase64(input:string){
 const value=String(input||'');
 if(value.length<140||value.length>5500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('invalid_image');
 const binary=atob(value),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return fail('method_not_allowed',405);
 const configuredSecret=Deno.env.get('NCC_INVOICE_WEBHOOK_SECRET')||'';
 const incomingSecret=req.headers.get('x-ncc-hook-secret')||'';
 const webhook=configuredSecret.length>=32&&incomingSecret===configuredSecret;
 const admin=webhook?null:await requireAdmin(req);
 if(!webhook&&!admin)return fail('admin_required',403);
 let body:any;
 try{body=await req.json();}catch{return fail('invalid_json');}
 const action=String(body?.action||'').trim();
 if(webhook&&action!=='scan')return fail('webhook_scan_only',403);
 if(action==='suppliers'){
  const {data,error}=await db.from('v21_accounts')
   .select('id,display_name,username,contact_group').eq('role','user')
   .is('deleted_at',null).order('display_name').limit(1000);
  return error?fail('suppliers_unavailable',500):respond({ok:true,accounts:data||[]});
 }
 if(action==='manual_upload'){
  const mime=String(body?.mime||'').toLowerCase();
  if(!mimeOk(mime))return fail('invalid_image_type');
  let bytes:Uint8Array;
  try{bytes=decodeImageBase64(body?.base64);}catch{return fail('invalid_image');}
  if(bytes.length<100||bytes.length>4000000)return fail('invalid_image_size');
  const senderId=String(body?.supplierId||'').trim();
  let supplierId=admin!.id;
  if(senderId){
   if(!UUID.test(senderId))return fail('invalid_supplier');
   const {data:account}=await db.from('v21_accounts').select('id').eq('id',senderId)
    .eq('role','user').eq('contact_group','ncc').is('deleted_at',null).maybeSingle();
   if(!account)return fail('supplier_not_in_ncc',409);
   supplierId=account.id;
  }
  const hash=await sha256(bytes);
  const {data:existing,error:checkError}=await db.from('chat_ncc_invoices').select('id,status')
   .eq('chat_account_id',supplierId).eq('image_sha256',hash).limit(1);
  if(checkError)return fail('duplicate_check_unavailable',503);
  if(existing?.length)return respond({ok:true,status:'duplicate',id:existing[0].id});
  const id=crypto.randomUUID(),extension=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  const storageKey='ncc-manual/'+id+'.'+extension;
  const uploaded=await db.storage.from('v21-media').upload(storageKey,bytes,
   {contentType:mime,upsert:false});
  if(uploaded.error)return fail('manual_upload_unavailable',503);
  const inserted=await db.from('chat_ncc_invoices').insert({
   id,chat_account_id:supplierId,origin:'manual',manual_storage_key:storageKey,image_sha256:hash,status:'pending'
  }).select('id').single();
  if(inserted.error){
   await db.storage.from('v21-media').remove([storageKey]);
   // A concurrent identical image may have won the unique image key.
   if(inserted.error.code==='23505')return respond({ok:true,status:'duplicate'});
   return fail('manual_invoice_save_failed',503);
  }
  return respond({ok:true,status:'pending',id});
 }
 if(action==='list'){
  const {data,error}=await db.from('chat_ncc_invoices')
   .select('id,chat_account_id,conversation_id,message_id,media_asset_id,origin,invoice_date,invoice_number,printed_total_vnd,status,note,created_at')
   .order('created_at',{ascending:false}).limit(60);
  return error?fail('list_unavailable',500):respond({ok:true,documents:data||[]});
 }
 if(action==='catalog'){
  const search=String(body?.q||'').trim();
  if(search.length<2)return respond({ok:true,products:[]});
  const escaped=search.replace(/[%,_]/g,' ').slice(0,50);
  const {data,error}=await db.from('taphoa_products').select('product_code,product_name,input_price_vnd,source_key,input_price_basis,retail_unit,units_per_carton')
   .ilike('product_name','%'+escaped+'%').eq('is_active',true).is('deleted_at',null).limit(40);
  return error?fail('catalog_unavailable',500):respond({ok:true,products:data||[]});
 }
 const id=String(body?.id||'');
 const invoice=await getDocument(id);
 if(!invoice)return fail('invoice_not_found',404);
 if(action==='detail'){
  const {data:media}=invoice.origin==='manual'?{data:null}:await db.from('v21_media_assets')
   .select('storage_key').eq('id',invoice.media_asset_id).maybeSingle();
  const storageKey=invoice.origin==='manual'?invoice.manual_storage_key:media?.storage_key;
  const image=storageKey?await db.storage.from('v21-media').createSignedUrl(storageKey,120):null;
  return respond({ok:true,document:invoice,lines:await getLines(id),imageUrl:image?.data?.signedUrl||null});
 }
 if(action==='scan')return analyze(invoice);
 if(action==='assign'){
  if(!['needs_review','matched'].includes(invoice.status))return fail('invalid_review_state',409);
  const rowNo=Number(body.rowNo),productCode=String(body.productCode||'').trim();
  const factor=Number(body.unitFactor);
  if(!Number.isInteger(rowNo)||rowNo<1||!productCode||!Number.isFinite(factor)||factor<=0||factor>10000)
    return fail('invalid_assignment');
  const {data:line}=await db.from('chat_ncc_invoice_lines').select('*')
    .eq('invoice_id',id).eq('row_no',rowNo).maybeSingle();
  const {data:product}=await db.from('taphoa_products')
    .select('product_code,product_name,input_price_vnd,is_active,deleted_at')
    .eq('product_code',productCode).eq('is_active',true).is('deleted_at',null).maybeSingle();
  if(!line||!product)return fail('line_or_product_not_found',404);
  const cost=Number(line.unit_price_vnd)/factor,oldCost=Number(product.input_price_vnd);
  if(!Number.isFinite(cost)||cost<=0)return fail('invalid_cost');
  const priceJump=oldCost>0&&Math.abs(cost-oldCost)/oldCost>0.20;
  if(priceJump&&body.acceptPriceJump!==true)
    return respond({ok:false,code:'price_jump_requires_confirmation',oldCost,newCost:cost},409);
  const {error:saveError}=await db.from('chat_ncc_invoice_lines').update({
   product_code:productCode,match_method:'manual',unit_factor:factor,
   normalized_cost_vnd:cost,review_required:false
  }).eq('id',line.id);
  if(saveError)return fail('assignment_unavailable',500);
  if(body.rememberAlias===true){
   const name=nameKey(line.printed_name),unit=nameKey(line.printed_unit);
   if(!name)return fail('invalid_alias');
   const {error:aliasError}=await db.from('chat_ncc_product_aliases').upsert({
    chat_account_id:invoice.chat_account_id,supplier_name_key:name,supplier_unit_key:unit,
    product_code:productCode,unit_factor:factor
   },{onConflict:'chat_account_id,supplier_name_key,supplier_unit_key'});
   if(aliasError)return fail('alias_unavailable',500);
  }
  const lines=await getLines(id);
  if(lines.length&&lines.every((x:any)=>x.product_code&&!x.review_required))
   await db.from('chat_ncc_invoices').update({status:'matched',reviewed_at:new Date().toISOString(),reviewed_by:admin!.id})
    .eq('id',id);
  return respond({ok:true,documentId:id,lines:await getLines(id)});
 }
 return fail('unknown_action');
});
