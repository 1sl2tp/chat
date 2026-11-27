import {VERSION,PROMPT,SCHEMA,validate,plan} from "./reader.mjs";
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const maxBytes=4000000;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const err=(code,status,requests=0)=>json({error:code,requests},status);
function mimeOf(bytes){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return "image/png";
 if(String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
 return null;
}
export function createReaderHandler({authorize,loadMedia,reserve,invoke,hash,encode,now=Date.now}){
 return async req=>{
  if(req.method!=="POST")return err("method",405);
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer [^\s]+$/.test(auth))return err("authentication_required",401);
  let actor;try{actor=await authorize(auth);}catch{return err("authentication_unavailable",503);}
  if(!actor)return err("admin_required",403);
  let body;try{const text=await req.text();if(text.length>1024)return err("invalid_request",400);body=JSON.parse(text);}catch{return err("invalid_request",400);}
  if(!body||Object.keys(body).length!==2||!uuid.test(body.asset_id||"")||!uuid.test(body.conversation_id||""))return err("invalid_request",400);
  let media;try{media=await loadMedia(actor,body);}catch{return err("media_unavailable",403);}
  if(!media||!(media.bytes instanceof Uint8Array)||media.bytes.length<100||media.bytes.length>maxBytes)return err("invalid_media",422);
  const mime=mimeOf(media.bytes);if(!mime||mime!==media.mime.replace("image/jpg","image/jpeg"))return err("invalid_media",422);
  const imageHash=await hash(media.bytes);
  let permitted;try{permitted=await reserve(actor);}catch{return err("quota_unavailable",503);}
  if(permitted!==true)return err("quota_exhausted",429);
  const started=now();let requests=0;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);
  try{
   requests++;
   const raw=await invoke({contents:[{role:"user",parts:[{text:PROMPT},{inlineData:{mimeType:mime,data:encode(media.bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseJsonSchema:SCHEMA,maxOutputTokens:4096}},ctl.signal);
   const result=validate(raw);
   return json({version:VERSION,image_sha256:imageHash,first:result,plan:plan(result),requests,elapsed_ms:Math.max(0,now()-started),financial_action:false});
  }catch{return err(ctl.signal.aborted?"reader_timeout":"reader_failed",502,requests);}
  finally{clearTimeout(timer);}
 };
}
