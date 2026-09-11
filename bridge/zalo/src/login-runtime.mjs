export async function startZaloLogin({ZaloClass,state,qrPath,logger=console}){
  state.setWaitingQr();
  try{
    const zalo=new ZaloClass({selfListen:true});
    const api=await zalo.loginQR({qrPath});
    const context=typeof api?.getContext==='function'?api.getContext():null;
    state.setLoggedIn({userId:context?.uid||context?.userId||null});
    if(typeof api?.listener?.start==='function')api.listener.start();
    logger?.info?.('[zalo-login] logged in');
    return api;
  }catch(error){
    state.setError(error);
    logger?.error?.('[zalo-login] failed',String(error?.message||error));
    throw error;
  }
}
