(()=>{
'use strict';

async function responseErrorCode(error){
  const context=error?.context;
  if(!context)return '';
  try{
    const response=typeof context.clone==='function'?context.clone():context;
    if(typeof response?.json!=='function')return '';
    const payload=await response.json();
    return String(payload?.error||'').trim();
  }catch{return '';}
}
async function normalizeInvokeResult({data,error}={}){
  if(data?.ok===true)return data;
  const code=String(data?.error||'').trim();
  if(code)throw new Error(code);
  if(error){
    const responseCode=await responseErrorCode(error);
    if(responseCode)throw new Error(responseCode);
    throw new Error('invalid_response');
  }
  throw new Error('invalid_response');
}

function authStore(){return globalThis.V21AuthSessionStore||null;}
async function invoke(action,{contactId,text,imageAssetIds=[]}={}){
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const session=await client.auth.getSession();
  const accessToken=String(session?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const assets=Array.from(new Set((Array.isArray(imageAssetIds)?imageAssetIds:[])
    .map(value=>String(value||'').trim()).filter(Boolean))).slice(0,8);
  const result=await client.functions.invoke('v21-order-scribe',{
    body:{action,contactId:String(contactId||''),text:String(text||''),imageAssetIds:assets},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  return await normalizeInvokeResult(result);
}

const api={
  normalizeInvokeResult,
  quick(input){return invoke('quick',input);},
  ai(input){return invoke('ai',input);},
};

globalThis.V21OrderScribeClient=api;
if(typeof exports==='object')exports.normalizeInvokeResult=normalizeInvokeResult;
if(typeof window==='object'){
  import('./admin-ai-extract.js').catch(error=>console.error('[V21AIExtract bootstrap]',error));
}
})();
