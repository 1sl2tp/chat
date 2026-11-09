// zca-js only retries selected socket closures when retryOnClose is enabled.
// Its "closed" event means that built-in recovery has ended; supply a bounded
// fallback so a silent one-way Zalo -> Chat outage does not require redeploying.
export function superviseZaloListener(listener,{
  logger=console,
  schedule=setTimeout,
  cancel=clearTimeout,
  baseDelayMs=5000,
  maxDelayMs=300000,
}={}){
  if(typeof listener?.start!=='function')return ()=>{};
  let stopped=false;
  let retryTimer=null;
  let retryCount=0;

  function retryLater(){
    if(stopped||retryTimer!==null)return;
    const delay=Math.min(maxDelayMs,baseDelayMs*2**Math.min(retryCount,6));
    retryCount+=1;
    logger?.warn?.('[zalo-login] websocket reconnect scheduled',delay);
    retryTimer=schedule(()=>{
      retryTimer=null;
      connect();
    },delay);
    retryTimer?.unref?.();
  }

  function connect(){
    if(stopped)return;
    try{
      listener.start({retryOnClose:true});
    }catch(error){
      logger?.warn?.('[zalo-login] websocket reconnect failed',String(error?.message||error));
      retryLater();
    }
  }

  const onConnected=()=>{
    retryCount=0;
    if(retryTimer!==null){
      cancel(retryTimer);
      retryTimer=null;
    }
    logger?.info?.('[zalo-login] websocket connected');
  };
  // An ordinary disconnection may still be retried by zca-js itself.
  const onDisconnected=(code)=>logger?.warn?.('[zalo-login] websocket disconnected',code);
  // "closed" is emitted only if zca-js does not schedule another retry.
  const onClosed=(code)=>{
    logger?.warn?.('[zalo-login] websocket closed; enabling fallback recovery',code);
    retryLater();
  };
  // Without this handler an EventEmitter "error" can crash the bridge.
  const onError=(error)=>logger?.warn?.('[zalo-login] websocket error',String(error?.message||error));

  listener.on?.('connected',onConnected);
  listener.on?.('disconnected',onDisconnected);
  listener.on?.('closed',onClosed);
  listener.on?.('error',onError);
  connect();

  return ()=>{
    stopped=true;
    if(retryTimer!==null){
      cancel(retryTimer);
      retryTimer=null;
    }
    listener.off?.('connected',onConnected);
    listener.off?.('disconnected',onDisconnected);
    listener.off?.('closed',onClosed);
    listener.off?.('error',onError);
  };
}
