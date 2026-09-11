function cleanBaseUrl(value){
  return String(value||'').trim().replace(/\/+$/,'');
}

async function parseJson(response){
  try{return await response.json();}catch{return {};}
}

export function createSupabaseSessionStore({supabaseUrl,publishableKey,bridgeToken,fetchImpl=fetch}){
  const base=cleanBaseUrl(supabaseUrl);
  const key=String(publishableKey||'').trim();
  const token=String(bridgeToken||'').trim();
  if(!base||!key||!token)throw new Error('session_store_config_missing');
  const endpoint=`${base}/functions/v1/v21-zalo-session`;
  const headers={
    apikey:key,
    authorization:`Bearer ${key}`,
    'x-bridge-token':token,
  };

  async function request(method,body){
    const options={method,headers:{...headers}};
    if(body!==undefined){
      options.headers['content-type']='application/json';
      options.body=JSON.stringify(body);
    }
    const response=await fetchImpl(endpoint,options);
    const payload=await parseJson(response);
    if(!response?.ok)throw new Error(`session_store_http_${response?.status||0}`);
    return payload;
  }

  return {
    async load(){
      const payload=await request('GET');
      return payload?.credentials||null;
    },
    async save(credentials){
      await request('POST',{credentials});
      return true;
    },
  };
}
