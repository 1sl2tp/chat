export function createBridge({adapter,gateway,clock=()=>new Date().toISOString(),logger=console}){
  let started=false;
  let polling=false;
  const processingInbound=new Set();
  const seenInbound=new Set();

  const rememberInbound=key=>{
    seenInbound.add(key);
    if(seenInbound.size<=1000)return;
    const oldest=seenInbound.values().next().value;
    if(oldest)seenInbound.delete(oldest);
  };

  const onMessage=async event=>{
    const zaloId=String(event?.zaloId||'').trim();
    const messageId=String(event?.messageId||'').trim();
    const text=String(event?.text||'').trim();
    if(!zaloId||!messageId||!text)return;

    const key=`${zaloId}:${messageId}`;
    if(seenInbound.has(key)||processingInbound.has(key))return;
    processingInbound.add(key);
    try{
      if(event?.profile){
        try{await gateway.upsertContact(event.profile);}
        catch(error){logger?.warn?.('[zalo-bridge] profile upsert failed',error);}
      }
      await gateway.ingestText({...event,zaloId,messageId,text,eventAt:event?.eventAt||clock()});
      rememberInbound(key);
    }finally{
      processingInbound.delete(key);
    }
  };

  return {
    async start(){
      if(started)return false;
      started=true;
      try{
        await adapter.start(onMessage);
        return true;
      }catch(error){
        started=false;
        throw error;
      }
    },

    async pollOutbound(){
      if(!started||polling)return 0;
      polling=true;
      try{
        const rows=await gateway.listOutbound(20);
        for(const row of rows){
          try{
            const external=await adapter.sendText({zaloId:row.zaloId,text:row.text});
            await gateway.markOutboundResult({
              deliveryId:row.deliveryId,
              ok:true,
              zaloMessageId:external?.messageId||null,
            });
          }catch(error){
            await gateway.markOutboundResult({
              deliveryId:row.deliveryId,
              ok:false,
              error:String(error?.message||error),
            });
          }
        }
        return rows.length;
      }finally{
        polling=false;
      }
    },

    async stop(){
      if(!started)return false;
      started=false;
      await adapter.stop();
      return true;
    },
  };
}
