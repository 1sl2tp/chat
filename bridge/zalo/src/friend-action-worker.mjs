// ZFR-203: One Admin click in Chat -> authenticated bridge -> Zalo findUser
// -> sendFriendRequest. No public URL launch and no Chat-account side effects.
export async function performZaloFriendAction(api,job){
 const phone=String(job?.phone||'').trim();
 if(!/^0\d{9}$/.test(phone))return {status:'failed',error_code:'invalid_phone'};
 if(!api||typeof api.findUser!=='function'||typeof api.getFriendRequestStatus!=='function'
    ||typeof api.sendFriendRequest!=='function'||typeof api.acceptFriendRequest!=='function')
   return {status:'unknown',error_code:'zalo_api_not_ready'};
 let person;
 try{ person=await api.findUser(phone); }
 catch(error){
   const code=Number(error?.code);
   if(code===216||code===404)return {status:'not_found',error_code:'zalo_profile_not_found'};
   return {status:'unknown',error_code:'zalo_phone_lookup_failed'};
 }
 const zaloId=String(person?.uid||person?.userId||'').trim();
 const zaloName=String(person?.display_name||person?.displayName||person?.zalo_name||'').trim().slice(0,120);
 if(!/^\d{5,32}$/.test(zaloId))return {status:'not_found',error_code:'zalo_profile_not_found'};
 const detail={zalo_id:zaloId,zalo_name:zaloName};
 let flags;
 try{
   const result=await api.getFriendRequestStatus(zaloId);
   flags=result?.data||result;
 }catch{
   return {...detail,status:'unknown',error_code:'zalo_relationship_unknown'};
 }
 if(Number(flags?.is_friend)===1)return {...detail,status:'already_friends'};
 if(Number(flags?.is_requesting)===1)return {...detail,status:'already_sent'};
 // The user explicitly requested friendship. If the same person already
 // invited us, accept that existing request instead of sending a duplicate.
 if(Number(flags?.is_requested)===1){
   try{
     await api.acceptFriendRequest(zaloId);
     return {...detail,status:'accepted'};
   }catch(error){
     return {...detail,status:'unknown',error_code:'zalo_accept_unconfirmed'};
   }
 }
 try{
   await api.sendFriendRequest('Xin chào, mình muốn kết bạn trên Zalo.',zaloId);
   return {...detail,status:'sent'};
 }catch(error){
   const code=Number(error?.code);
   if(code===225)return {...detail,status:'already_friends'};
   if(code===215)return {...detail,status:'blocked',error_code:'zalo_request_blocked'};
   if(code===222)return {...detail,status:'accepted'};
   // Network timeout after POST is ambiguous. Never retry automatically.
   return {...detail,status:'unknown',error_code:'zalo_send_unconfirmed'};
 }
}

export function createZaloFriendActionWorker({
 api,endpoint,bridgeToken,fetchImpl=fetch,logger=console,
}={}){
 const url=String(endpoint||'').trim();
 const token=String(bridgeToken||'').trim();
 if(!url||!token)throw Error('friend_worker_config_missing');
 let running=false;
 async function post(body){
   const res=await fetchImpl(url,{
    method:'POST',headers:{'content-type':'application/json','x-bridge-token':token},
    body:JSON.stringify(body),
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok||data?.ok!==true)throw Error(data?.error||'friend_worker_network_error');
   return data;
 }
 return async function run(){
   if(running||!api)return false;
   running=true;
   try{
     const {job}=await post({kind:'friend_action_next'});
     if(!job?.id)return false;
     let result;
     try{result=await performZaloFriendAction(api,job);}
     catch{result={status:'unknown',error_code:'zalo_request_unconfirmed'};}
     try{
       await post({kind:'friend_action_complete',id:job.id,...result});
       logger.info?.('[zalo-bridge] friend request processed',result.status);
     }catch(error){
       logger.warn?.('[zalo-bridge] friend request result not persisted',
         String(error?.message||error));
     }
     return true;
   }catch(error){
     logger.warn?.('[zalo-bridge] friend request queue unavailable',
       String(error?.message||error));
     return false;
   }finally{running=false;}
 };
}
