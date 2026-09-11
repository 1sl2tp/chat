function normalizedOutboundMedia(row){
  const list=Array.isArray(row?.media)?row.media:[];
  return list.map(asset=>({
    kind:String(asset?.kind||'file'),
    signedUrl:String(asset?.signed_url||''),
    fileName:asset?.file_name==null?null:String(asset.file_name),
    mimeType:String(asset?.mime_type||'application/octet-stream'),
    sizeBytes:Number(asset?.size_bytes)||0,
    widthPx:asset?.width_px==null?null:Number(asset.width_px)||null,
    heightPx:asset?.height_px==null?null:Number(asset.height_px)||null,
    sortIndex:Number(asset?.sort_index)||0,
  })).filter(asset=>asset.signedUrl).sort((a,b)=>a.sortIndex-b.sortIndex);
}

export function createMessageGateway({endpoint,bridgeToken,fetchImpl=fetch}={}){
  const url=String(endpoint||'').trim();
  const token=String(bridgeToken||'').trim();
  if(!url||!token)throw new Error('zalo_message_gateway_config_missing');

  async function parseResponse(response){
    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||payload?.code||`zalo_bridge_http_${response.status}`);
    return payload||{};
  }

  async function post(body){
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{'content-type':'application/json','x-bridge-token':token},
      body:JSON.stringify(body),
    });
    return parseResponse(response);
  }

  async function postForm(form){
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{'x-bridge-token':token},
      body:form,
    });
    return parseResponse(response);
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
    async ingestMedia(event,binary){
      const meta=Array.isArray(event?.media)?event.media[0]:event?.media;
      const mimeType=String(binary?.mimeType||meta?.mimeType||'application/octet-stream').split(';',1)[0].trim().toLowerCase();
      const filename=String(binary?.filename||meta?.fileName||'file').trim();
      const data=binary?.data;
      if(!meta||!data||!filename)throw new Error('zalo_media_ingress_invalid');
      const form=new FormData();
      form.set('action','ingress_media');
      form.set('zalo_id',String(event?.zaloId||''));
      form.set('zalo_message_id',String(event?.messageId||''));
      form.set('body',String(event?.text||''));
      form.set('event_at',event?.eventAt||new Date().toISOString());
      form.set('kind',String(meta?.kind||''));
      form.set('mime_type',mimeType);
      form.set('size_bytes',String(Number(binary?.sizeBytes)||Number(data?.length)||0));
      if(meta?.fileName||String(meta?.kind||'')==='file')form.set('file_name',String(meta?.fileName||filename));
      const width=Number(binary?.widthPx??meta?.widthPx)||0;
      const height=Number(binary?.heightPx??meta?.heightPx)||0;
      if(width>0)form.set('width_px',String(width));
      if(height>0)form.set('height_px',String(height));
      const blob=data instanceof Blob?data:new Blob([data],{type:mimeType});
      form.set('file',blob,filename);
      const payload=await postForm(form);
      return{messageId:payload?.message_id||null,assetId:payload?.asset_id||null};
    },
    async listOutbound(limit=20){
      const payload=await post({action:'outbound_due',limit:Math.max(1,Math.min(Number(limit)||20,100))});
      return (Array.isArray(payload?.rows)?payload.rows:[]).map(row=>{
        const media=normalizedOutboundMedia(row);
        return{
          deliveryId:String(row?.delivery_id||''),
          zaloId:String(row?.zalo_id||''),
          text:String(row?.body||''),
          ...(media.length?{media}:{}),
        };
      }).filter(row=>row.deliveryId&&row.zaloId&&(row.text||row.media?.length));
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
