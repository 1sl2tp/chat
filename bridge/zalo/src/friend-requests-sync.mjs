// ZFR-200: The Zalo 2.x "getFriendRecommendations" response mixes actual
// received requests (recommType=2) with people-you-may-know suggestions.
// Never treat a recommendation as an invitation without checking reqstatus.
function asEntries(result){
 const obj=result?.data?.recommItems?result.data:result;
 if(!obj||!Array.isArray(obj.recommItems))throw Error("zalo_request_inbox_format_changed");
 return obj.recommItems;
}
function isPotentialRequest(entry){
 const info=entry?.dataInfo||{};
 return Number(info.recommType)===2||Number(entry?.recommItemType)===2;
}
export async function readVerifiedIncomingRequests(api){
 if(!api||typeof api.getFriendRecommendations!=='function'
   ||typeof api.getFriendRequestStatus!=='function')
  throw Error("zalo_friend_requests_unsupported");
 const result=await api.getFriendRecommendations();
 const items=asEntries(result);
 if(items.length>500)throw Error("zalo_friend_requests_too_large");
 const candidate=items.filter(isPotentialRequest);
 const unique=new Map();
 for(let start=0;start<candidate.length;start+=4){
  const matches=await Promise.all(candidate.slice(start,start+4).map(async entry=>{
   const d=entry?.dataInfo||{};
   const id=String(d.userId||'').trim();
   if(!/^\d{5,32}$/.test(id))return null;
   const status=await api.getFriendRequestStatus(id);
   const flags=status?.data||status;
   if(Number(flags?.is_requested)!==1||Number(flags?.is_friend)===1)return null;
   let rawTime=Number(d.recommTime)||0;
   if(rawTime>1e12)rawTime=Math.floor(rawTime/1000);
   return {zalo_id:id,
     display_name:String(d.displayName||d.zaloName||id).trim().slice(0,120),
     avatar_url:String(d.avatar||'').trim()||null,
     message:String(d.recommInfo?.message||'').slice(0,500)||null,
     request_ts:rawTime};
  }));
  for(const item of matches)if(item)unique.set(item.zalo_id,item);
 }
 return [...unique.values()];
}
export async function syncIncomingFriendRequests({api,endpoint,bridgeToken,fetchImpl=fetch}){
 const requests=await readVerifiedIncomingRequests(api);
 const response=await fetchImpl(endpoint,{
  method:'POST',headers:{'content-type':'application/json','x-bridge-token':bridgeToken},
  body:JSON.stringify({kind:'incoming_friend_requests_snapshot',requests})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result?.ok!==true)throw Error(result?.error||'zalo_friend_request_sync_failed');
 return {count:requests.length};
}
