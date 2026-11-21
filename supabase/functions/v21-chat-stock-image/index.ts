// CHAT-425: Admin-only, opt-in customer stock image reading.
// Separate from the supplier NCC function so an OCR release cannot change
// invoice upload, supplier pricing, bank billing or customer messages.
// This endpoint does not write Storage/Postgres, send Chat/Zalo or create orders.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {readStockImageWithGemini} from "./chat-stock-read.mjs";

const BASE=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(BASE,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const LIMIT_BYTES=4000000;
const headers={
 "access-control-allow-origin":"*",
 "access-control-allow-methods":"POST, OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "content-type":"application/json; charset=utf-8",
 "cache-control":"no-store"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(code:string,status=400)=>json({ok:false,code},status);
async function requireAdmin(req:Request){
 const token=/^Bearer\s+(.+)$/iu.exec(req.headers.get("authorization")||"")?.[1];
 if(!token)return false;
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.id)return false;
 const {data:account,error:accountError}=await db.from("v21_accounts")
  .select("id,role,locked_at")
  .eq("auth_user_id",user.id).eq("role","admin")
  .is("locked_at",null).is("deleted_at",null).maybeSingle();
 return !accountError&&Boolean(account?.id);
}
function decodeImage(raw:unknown,mimeRaw:unknown){
 const value=String(raw||"");
 if(value.length<140||value.length>5500000||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))throw Error("invalid_image");
 const decoded=atob(value);
 if(decoded.length<100||decoded.length>LIMIT_BYTES)throw Error("invalid_image_size");
 const bytes=Uint8Array.from(decoded,letter=>letter.charCodeAt(0));
 const mime=String(mimeRaw||"").toLowerCase();
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=new TextDecoder().decode(bytes.subarray(0,4))==="RIFF"&&
  new TextDecoder().decode(bytes.subarray(8,12))==="WEBP";
 if(!((mime==="image/png"&&png)||(mime==="image/jpeg"&&jpeg)||
      (mime==="image/webp"&&webp)))throw Error("invalid_image_type");
 return {bytes,mime};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return fail("method_not_allowed",405);
 try{if(!await requireAdmin(req))return fail("admin_required",403);}
 catch{return fail("admin_required",403);}
 let body:any;
 try{body=await req.json();}catch{return fail("invalid_json");}
 const action=String(body?.action||"");
 if(action==="health")return json({ok:true,ready:Boolean(Deno.env.get("GEMINI_API_KEY")),
  features:["chat_stock_image"]});
 if(action!=="chat_stock_image")return fail("unknown_action",404);
 let image:{bytes:Uint8Array,mime:string};
 try{image=decodeImage(body?.base64,body?.mime);}
 catch(error){return fail(String((error as Error)?.message||"invalid_image"));}
 try{
  const result=await readStockImageWithGemini({
   ...image,key:Deno.env.get("GEMINI_API_KEY")||""
  });
  return json({ok:true,classification:result.classification,
   lines:result.lines,notes:result.notes,read_only:true,review_required:true});
 }catch(error){
  const reason=String((error as Error)?.message||"ai_unavailable");
  const allowed=["ai_not_configured","ai_unavailable","ai_empty","ai_invalid_json","invalid_image"];
  return fail(allowed.includes(reason)?reason:"ai_unavailable",503);
 }
});