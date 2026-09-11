const USER_THREAD_TYPE=0;

function eventAtFromTs(value){
  const raw=Number(value);
  if(!Number.isFinite(raw)||raw<=0)return new Date().toISOString();
  const ms=raw<1e12?raw*1000:raw;
  return new Date(ms).toISOString();
}

export function normalizeIncomingMessage(message,{userThreadType=USER_THREAD_TYPE}={}){
  if(!message||message.type!==userThreadType||message.isSelf)return null;
  if(typeof message?.data?.content!=='string')return null;
  const zaloId=String(message.threadId||'').trim();
  const messageId=String(message?.data?.msgId||message?.data?.cliMsgId||'').trim();
  const text=message.data.content.trim();
  if(!zaloId||!messageId||!text)return null;
  return {
    zaloId,
    messageId,
    text,
    eventAt:eventAtFromTs(message?.data?.ts),
  };
}

export function bindIncomingMessageListener({api,onMessage,logger=console,userThreadType=USER_THREAD_TYPE}){
  if(!api?.listener?.on||typeof onMessage!=='function')return ()=>{};
  const handler=async raw=>{
    const event=normalizeIncomingMessage(raw,{userThreadType});
    if(!event)return;
    try{await onMessage(event);}
    catch(error){logger?.warn?.('[zalo-incoming] handler failed',String(error?.message||error));}
  };
  api.listener.on('message',handler);
  return ()=>{
    try{api.listener.off?.('message',handler);}catch{}
  };
}
