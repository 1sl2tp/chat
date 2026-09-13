(()=>{
'use strict';

function normalizeInvokeResult({data,error}={}){
  if(data?.ok===true)return data;
  const code=String(data?.error||'').trim();
  if(code)throw new Error(code);
  if(error)throw new Error('invalid_response');
  throw new Error('invalid_response');
}

function authStore(){return globalThis.V21AuthSessionStore||null;}
async function invoke(action,{contactId,text}={}){
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const session=await client.auth.getSession();
  const accessToken=String(session?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const result=await client.functions.invoke('v21-order-scribe',{
    body:{action,contactId:String(contactId||''),text:String(text||'')},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  return normalizeInvokeResult(result);
}

const api={
  normalizeInvokeResult,
  quick(input){return invoke('quick',input);},
  ai(input){return invoke('ai',input);},
};

globalThis.V21OrderScribeClient=api;
if(typeof exports==='object')exports.normalizeInvokeResult=normalizeInvokeResult;
})();
