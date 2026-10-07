function normalizeSearch(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

function normalizeContacts(rows){
  const out=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const threadType=String(row?.threadType||row?.thread_type||'user').toLowerCase()==='group'?'group':'user';
    const zaloId=String(row?.userId||row?.groupId||row?.zalo_id||'').trim();
    const displayName=String(row?.displayName||row?.zaloName||row?.name||row?.display_name||'').trim();
    const avatar=String(row?.avatar||row?.fullAvt||row?.avt||row?.avatar_url||'').trim();
    if(!zaloId||!displayName)continue;
    const contact={
      zalo_id:zaloId,
      display_name:displayName,
      avatar_url:avatar||null,
      thread_type:threadType,
    };
    if(Object.prototype.hasOwnProperty.call(row,'alias_name')){
      contact.alias_name=String(row?.alias_name||'').trim()||null;
    }
    out.push(contact);
  }
  return out;
}

async function loadAliasSnapshot(api,{pageSize=100,maxPages=50}={}){
  if(!api||typeof api.getAliasList!=='function')return{complete:false,aliases:new Map()};
  const aliases=new Map();
  try{
    for(let page=1;page<=maxPages;page+=1){
      const result=await api.getAliasList(pageSize,page);
      const items=Array.isArray(result?.items)?result.items:[];
      for(const item of items){
        const zaloId=String(item?.userId||'').trim();
        const alias=String(item?.alias||'').trim();
        if(zaloId&&alias)aliases.set(zaloId,alias);
      }
      if(items.length<pageSize)return{complete:true,aliases};
    }
    return{complete:false,aliases:new Map()};
  }catch(_error){
    return{complete:false,aliases:new Map()};
  }
}

export function createContactSync({endpoint,bridgeToken,fetchImpl=fetch}){
  const url=String(endpoint||'').trim();
  const token=String(bridgeToken||'').trim();
  if(!url||!token)return null;

  return async function syncContacts(rows,options={}){
    const contacts=normalizeContacts(rows);
    const payload={contacts};
    if(Object.prototype.hasOwnProperty.call(options,'aliasSnapshotComplete')){
      payload.alias_snapshot_complete=Boolean(options.aliasSnapshotComplete);
    }
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-bridge-token':token,
      },
      body:JSON.stringify(payload),
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error||`contact_sync_failed_${response.status}`);
    return body;
  };
}

export async function syncApiContacts({api,sync}){
  if(!api||typeof api.getAllFriends!=='function'||typeof sync!=='function')return null;
  const friends=await api.getAllFriends();
  const aliasSnapshot=await loadAliasSnapshot(api);
  const rows=(Array.isArray(friends)?friends:[]).map(friend=>{
    if(!aliasSnapshot.complete)return friend;
    const zaloId=String(friend?.userId||friend?.zalo_id||'').trim();
    return{
      ...friend,
      alias_name:aliasSnapshot.aliases.get(zaloId)||null,
    };
  });
  return sync(rows,{aliasSnapshotComplete:aliasSnapshot.complete});
}

export async function syncApiGroups({api,sync,filter}){
  const wanted=normalizeSearch(filter);
  if(!wanted||!api||typeof api.getAllGroups!=='function'||typeof api.getGroupInfo!=='function'||typeof sync!=='function'){
    return null;
  }

  const directory=await api.getAllGroups();
  const ids=Object.keys(directory?.gridVerMap||{}).filter(Boolean);
  const groups=[];
  for(let offset=0;offset<ids.length;offset+=40){
    const info=await api.getGroupInfo(ids.slice(offset,offset+40));
    groups.push(...Object.values(info?.gridInfoMap||{}));
  }

  let matches=groups.filter(group=>normalizeSearch(group?.name)===wanted);
  if(!matches.length){
    matches=groups.filter(group=>normalizeSearch(group?.name).includes(wanted));
  }

  const rows=matches.map(group=>({
    groupId:String(group?.groupId||'').trim(),
    name:String(group?.name||'').trim(),
    fullAvt:String(group?.fullAvt||group?.avt||'').trim(),
    threadType:'group',
  })).filter(row=>row.groupId&&row.name);

  const result=await sync(rows);
  return {...result,total:groups.length,matched:rows.length,names:rows.map(row=>row.name)};
}
