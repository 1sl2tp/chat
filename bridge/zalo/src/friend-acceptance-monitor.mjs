// ZFR-204: Independent of browser visibility. Only GET Zalo relationship state,
// never re-sends the friendship request. One verified acceptance triggers Push.
export function createZaloFriendAcceptanceMonitor({
 api,endpoint,bridgeToken,fetchImpl=fetch,logger=console,
}={}){
 if(!endpoint||!bridgeToken)throw Error("zalo_friend_monitor_config_missing");
 let running=false;
 async function post(body){
  const response=await fetchImpl(endpoint,{
   method:"POST",headers:{"content-type":"application/json","x-bridge-token":bridgeToken},
   body:JSON.stringify(body),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.ok)throw Error(payload?.error||"zalo_friend_monitor_failed");
  return payload;
 }
 return async function run(){
  if(running||!api||typeof api.getFriendRequestStatus!=="function")return false;
  running=true;
  try{
   const result=await post({kind:"friend_watch_list"});
   for(const job of Array.isArray(result.rows)?result.rows:[]){
    const id=String(job.id||"");
    const zaloId=String(job.zalo_id||"");
    if(!id||!/^\d{5,32}$/.test(zaloId))continue;
    try{
     const relationship=await api.getFriendRequestStatus(zaloId);
     const flags=relationship?.data||relationship;
     // Avoid false successes on unexpected Zalo payloads.
     if(!flags||![0,1].includes(Number(flags.is_friend)))continue;
     const verified=Number(flags.is_friend)===1;
     await post({kind:"friend_watch_result",id,is_friend:verified});
     if(verified)logger.info?.("[zalo-bridge] friendship confirmed");
    }catch(error){
     logger.warn?.("[zalo-bridge] friendship check incomplete",
      String(error?.message||error).slice(0,130));
    }
   }
   // Handles queued notifications even when no new friend changed today.
   await post({kind:"friend_notify_drain"});
   return true;
  }catch(error){
   logger.warn?.("[zalo-bridge] friend acceptance monitor unavailable",
    String(error?.message||error).slice(0,180));
   return false;
  }finally{running=false;}
 };
}
