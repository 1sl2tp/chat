function normalizeContacts(rows){
  const out=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const zaloId=String(row?.userId||'').trim();
    const displayName=String(row?.displayName||row?.zaloName||'').trim();
    if(!zaloId||!displayName)continue;
    out.push({
      zalo_id:zaloId,
      display_name:displayName,
      avatar_url:String(row?.avatar||'').trim()||null,
    });
  }
  return out;
}

export function createContactSync({endpoint,bridgeToken,fetchImpl=fetch}){
  const url=String(endpoint||'').trim();
  const token=String(bridgeToken||'').trim();
  if(!url||!token)return null;

  return async function syncContacts(rows){
    const contacts=normalizeContacts(rows);
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-bridge-token':token,
      },
      body:JSON.stringify({contacts}),
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error||`contact_sync_failed_${response.status}`);
    return body;
  };
}

export async function syncApiContacts({api,sync}){
  if(!api||typeof api.getAllFriends!=='function'||typeof sync!=='function')return null;
  const friends=await api.getAllFriends();
  return sync(friends);
}
