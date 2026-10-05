import {createWorker} from "tesseract.js";
import {parseReceiptOcr} from "./receipt-ocr-core.mjs";

const MAX_IMAGE_BYTES=12*1024*1024;
let ocrTail=Promise.resolve();

function serial(task){
  const run=ocrTail.then(task,task);
  ocrTail=run.catch(()=>{});
  return run;
}

async function fetchImage(url,fetchImpl){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  timer.unref?.();
  try{
    const response=await fetchImpl(url,{signal:controller.signal,headers:{"cache-control":"no-cache"}});
    if(!response.ok)throw new Error(`receipt_image_http_${response.status}`);
    const declared=Number(response.headers.get("content-length"))||0;
    if(declared>MAX_IMAGE_BYTES)throw new Error("receipt_image_too_large");
    const buffer=Buffer.from(await response.arrayBuffer());
    if(!buffer.length||buffer.length>MAX_IMAGE_BYTES)throw new Error("receipt_image_invalid");
    return buffer;
  }finally{
    clearTimeout(timer);
  }
}

async function recognizeReceipt(image){
  return serial(async()=>{
    const worker=await createWorker("eng",1,{logger:()=>{}});
    try{
      await worker.setParameters({
        tessedit_pageseg_mode:"3",
        preserve_interword_spaces:"1",
        tessedit_char_whitelist:"",
      });
      const full=await worker.recognize(image,{rotateAuto:true});
      await worker.setParameters({
        tessedit_pageseg_mode:"11",
        preserve_interword_spaces:"1",
        tessedit_char_whitelist:"0123456789",
      });
      const digits=await worker.recognize(image,{rotateAuto:true});
      return parseReceiptOcr(String(full?.data?.text||""),String(digits?.data?.text||""));
    }finally{
      try{await worker.terminate();}catch{}
    }
  });
}

function safeCode(error){
  return String(error?.message||error||"receipt_ocr_failed")
    .replace(/[^a-zA-Z0-9_:\-.]/g,"_")
    .slice(0,120);
}

export function createReceiptOcrRunner({gateway,fetchImpl=fetch,logger=console}={}){
  if(!gateway)throw new Error("receipt_ocr_gateway_required");
  return async function runReceiptOcr(jobId){
    const id=String(jobId||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("receipt_job_id_invalid");
    let claimed=false;
    try{
      const claim=await gateway.claim(id);
      if(claim?.skip)return {ok:true,status:String(claim.status||"skipped"),skipped:true};
      const signedUrl=String(claim?.signed_url||"").trim();
      if(!/^https:\/\//i.test(signedUrl))throw new Error("receipt_signed_url_missing");
      claimed=true;
      const image=await fetchImage(signedUrl,fetchImpl);
      const extracted=await recognizeReceipt(image);
      const finalized=await gateway.finalize(id,extracted);
      logger?.log?.("[receipt-ocr] complete",JSON.stringify({job_id:id,status:finalized?.status||finalized?.result?.status||"ok"}));
      return {ok:true,status:finalized?.status||finalized?.result?.status||"ok"};
    }catch(error){
      const code=safeCode(error);
      if(claimed){
        try{await gateway.fail(id,code);}catch{}
      }
      logger?.warn?.("[receipt-ocr] failed",JSON.stringify({job_id:id,error:code}));
      throw error;
    }
  };
}
