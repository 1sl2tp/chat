export function createReceiptOcrGateway({endpoint,bridgeToken,fetchImpl=fetch}={}){
  const url=String(endpoint||"").trim();
  const token=String(bridgeToken||"").trim();
  if(!url||!token)throw new Error("receipt_ocr_gateway_config_missing");

  async function post(body){
    const response=await fetchImpl(url,{
      method:"POST",
      headers:{"content-type":"application/json","x-bridge-token":token},
      body:JSON.stringify(body),
    });
    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok||payload?.ok===false){
      const code=String(payload?.error||payload?.reason||`receipt_ocr_bridge_http_${response.status}`);
      const error=new Error(code);
      error.status=response.status;
      throw error;
    }
    return payload||{};
  }

  return Object.freeze({
    async claim(jobId){
      return post({action:"claim",job_id:String(jobId||"")});
    },
    async finalize(jobId,result){
      return post({action:"finalize",job_id:String(jobId||""),result:result||{}});
    },
    async fail(jobId,code){
      return post({action:"fail",job_id:String(jobId||""),error_code:String(code||"receipt_ocr_failed").slice(0,120)});
    },
  });
}
