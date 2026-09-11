function validCredentials(value){
  return !!value&&Array.isArray(value.cookie)&&value.cookie.length>0&&!!value.imei&&!!value.userAgent;
}

function credentialsFromContext(context){
  if(!context)return null;
  const cookie=typeof context.cookie?.toJSON==='function'?context.cookie.toJSON()?.cookies:null;
  const value={cookie,imei:context.imei,userAgent:context.userAgent};
  return validCredentials(value)?value:null;
}

export async function startZaloLogin({ZaloClass,state,qrPath,logger=console,sessionStore=null}){
  try{
    const zalo=new ZaloClass({selfListen:true});
    let api=null;

    if(sessionStore?.load){
      try{
        const saved=await sessionStore.load();
        if(validCredentials(saved)&&typeof zalo.login==='function'){
          api=await zalo.login(saved);
          logger?.info?.('[zalo-login] restored saved session');
        }
      }catch(error){
        logger?.warn?.('[zalo-login] saved session restore failed; falling back to QR',String(error?.message||error));
      }
    }

    if(!api){
      state.setWaitingQr();
      api=await zalo.loginQR({qrPath});
      if(sessionStore?.save){
        const credentials=credentialsFromContext(typeof api?.getContext==='function'?api.getContext():null);
        if(credentials){
          try{await sessionStore.save(credentials);}
          catch(error){logger?.warn?.('[zalo-login] session save failed',String(error?.message||error));}
        }
      }
    }

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
