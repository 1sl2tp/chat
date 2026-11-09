import {normalizeIncomingMessage} from './incoming-message.mjs';
import {downloadInboundMedia} from './media-transfer.mjs';

// Read-only Zalo history retrieval, followed by the canonical, idempotent Chat
// ingress APIs. The bridge never creates Chat records for unlinked Zalo IDs.
function eventMillis(message){
  const n=Number(message?.data?.ts);
  if(!Number.isFinite(n)||n<=0)return null;
  const ms=n<1e12?n*1000:n;
  return Number.isFinite(ms)?ms:null;
}

function requestPage(listener,threadType,lastId,timeoutMs){
  return new Promise(resolve=>{
    let done=false;
    let timeout=null;
    const finish=messages=>{
      if(done)return;
      done=true;
      clearTimeout(timeout);
      listener.off?.('old_messages',onMessages);
      resolve(messages);
    };
    const onMessages=(messages,type)=>{
      if(Number(type)!==threadType)return;
      finish(Array.isArray(messages)?messages:[]);
    };
    listener.on('old_messages',onMessages);
    timeout=setTimeout(()=>finish(null),timeoutMs);
    timeout.unref?.();
    try{listener.requestOldMessages(threadType,lastId);}
    catch{finish(null);}
  });
}

export async function recoverZaloHistory({
  api,gateway,since,until=new Date().toISOString(),logger=console,
  maxPagesPerType=160,maxScanned=8000,timeoutMs=15000,
  delayMs=120,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  download=downloadInboundMedia,
}={}){
  const listener=api?.listener;
  const start=Date.parse(String(since||''));
  const end=Date.parse(String(until||''));
  if(!gateway?.listLinkedZaloIds||!listener?.on||!listener?.requestOldMessages||
      !Number.isFinite(start)||!Number.isFinite(end)||end<=start||
      end-start>7*86400000)throw new Error('zalo_history_recovery_invalid_config');
  const linked=new Set(await gateway.listLinkedZaloIds());
  const stats={scanned:0,matched:0,acceptedText:0,acceptedMedia:0,
    existingMedia:0,skipped:0,failures:0,pages:0,completeUser:false,completeGroup:false};
  const seen=new Set();
  logger.info?.('[zalo-recovery] starting',JSON.stringify({
    since:new Date(start).toISOString(),until:new Date(end).toISOString(),linked:linked.size
  }));

  for(const threadType of [0,1]){
    let cursor=null;
    let reachedStart=false;
    for(let page=0;page<maxPagesPerType && stats.scanned<maxScanned;page++){
      const batch=await requestPage(listener,threadType,cursor,timeoutMs);
      if(batch===null){logger.warn?.('[zalo-recovery] page unavailable',threadType,page);break;}
      stats.pages++;
      if(!batch.length){reachedStart=true;break;}
      let oldest=null;
      let usable=0;
      let allBefore=true;
      for(const raw of batch){
        stats.scanned++;
        const ts=eventMillis(raw);
        if(ts!==null){
          usable++;
          if(ts>=start)allBefore=false;
          if(oldest===null||ts<oldest.ts)oldest={ts,id:String(raw?.data?.msgId||raw?.data?.cliMsgId||'')};
        }
        if(ts===null||ts<start||ts>end||raw?.isSelf||
            !linked.has(String(raw?.threadId||''))){
          stats.skipped++;
          continue;
        }
        const event=normalizeIncomingMessage(raw);
        if(!event){stats.skipped++;continue;}
        const key=event.zaloId+':'+event.messageId;
        if(seen.has(key)){stats.skipped++;continue;}
        seen.add(key);
        stats.matched++;
        try{
          if(event.media?.length){
            const target=await gateway.mediaTarget(event);
            if(target?.existing){stats.existingMedia++;continue;}
            if(!target?.needed){stats.skipped++;continue;}
            const binary=await download({api,media:event.media[0]});
            if((await gateway.ingestMedia(event,binary))?.messageId)stats.acceptedMedia++;
            else stats.skipped++;
          }else{
            if((await gateway.ingestText(event))?.messageId)stats.acceptedText++;
            else stats.skipped++;
          }
        }catch(error){
          stats.failures++;
          logger.warn?.('[zalo-recovery] ingress failed',threadType,String(error?.message||error));
        }
      }
      // The history cursor must move to strictly older messages.
      if(allBefore && usable>0){reachedStart=true;break;}
      if(!oldest?.id||oldest.id===cursor){
        logger.warn?.('[zalo-recovery] no cursor progress',threadType,page);
        break;
      }
      cursor=oldest.id;
      if(delayMs>0)await wait(delayMs);
    }
    if(threadType===0)stats.completeUser=reachedStart;
    else stats.completeGroup=reachedStart;
    logger.info?.('[zalo-recovery] thread finished',threadType,JSON.stringify(stats));
  }
  logger.info?.('[zalo-recovery] complete',JSON.stringify(stats));
  return stats;
}

export function armZaloHistoryRecovery({api,gateway,since,logger=console,...options}={}){
  const listener=api?.listener;
  if(!since||!gateway||!listener?.on)return ()=>{};
  let started=false;
  const onKey=()=>{
    if(started)return;
    started=true;
    listener.off?.('cipher_key',onKey);
    void recoverZaloHistory({api,gateway,since,logger,...options}).catch(error=>
      logger.warn?.('[zalo-recovery] stopped',String(error?.message||error)));
  };
  listener.on('cipher_key',onKey);
  logger.info?.('[zalo-recovery] armed');
  return ()=>listener.off?.('cipher_key',onKey);
}
