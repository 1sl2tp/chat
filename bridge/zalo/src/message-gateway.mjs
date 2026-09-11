export function createMessageGateway({endpoint,bridgeToken,fetchImpl=fetch}={}){
  const url=String(endpoint||'').trim();
  const token=String(bridgeToken||'').trim();
  if(!url||!token)throw new Error('zalo_message_gateway_config_missing');

  async function post(body){
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{'content-type':'application/json','x-bridge-token':token},
      body:JSON.stringify(body),
    });
    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||payload?.code||`zalo_bridge_http_${response.status}`);
    return payload||{};
  }

  return Object.freeze({
    async ingestText(event){
      const payload=await post({
        action:'ingress',
        zalo_id:String(event?.zaloId||''),
        zalo_message_id:String(event?.messageId||''),
        body:String(event?.text||''),
        event_at:event?.eventAt||new Date().toISOString(),
      });
      return{messageId:payload?.message_id||null};
    },
    async listOutbound(limit=20){
      const payload=await post({action:'outbound_due',limit:Math.max(1,Math.min(Number(limit)||20,100))});
      return (Array.isArray(payload?.rows)?payload.rows:[]).map(row=>({
        deliveryId:String(row?.delivery_id||''),
        zaloId:String(row?.zalo_id||''),
        text:String(row?.body||''),
      })).filter(row=>row.deliveryId&&row.zaloId&&row.text);
    },
    async markOutboundResult(result){
      return post({
        action:'outbound_result',
        delivery_id:String(result?.deliveryId||''),
        ok:Boolean(result?.ok),
        zalo_message_id:result?.zaloMessageId==null?null:String(result.zaloMessageId),
        error:result?.error==null?null:String(result.error),
      });
    },
    async syncLinkedAvatars(){
      const payload=await post({action:'sync_linked_avatars'});
      return{count:Number(payload?.count)||0};
    },
  });
}
