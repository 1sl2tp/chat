const jsonHeaders={"Content-Type":"application/json; charset=utf-8"};
const renderUrl="https://taphoa-zalo-login.onrender.com/outbound-now";

function json(status:number,body:unknown){
  return new Response(JSON.stringify(body),{status,headers:jsonHeaders});
}

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json(405,{ok:false,error:"method_not_allowed"});

  const bridgeToken=String(Deno.env.get("ZALO_BRIDGE_TOKEN")||"").trim();
  if(!bridgeToken)return json(503,{ok:false,error:"bridge_token_missing"});

  const nowParts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Ho_Chi_Minh",
    hour:"2-digit",
    hourCycle:"h23",
  }).formatToParts(new Date());
  const hour=Number(nowParts.find(part=>part.type==="hour")?.value||0);
  if(hour<5)return json(200,{ok:true,skipped:"quiet_hours"});

  const tokenHash=await sha256(bridgeToken);
  try{
    const response=await fetch(renderUrl,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-bridge-token-sha256":tokenHash,
      },
      body:"{}",
    });
    const text=await response.text();
    if(!response.ok)return json(502,{ok:false,error:"render_signal_failed",status:response.status});
    let payload:unknown={};
    try{payload=text?JSON.parse(text):{};}catch{payload={};}
    return json(200,{ok:true,render:payload});
  }catch(error){
    return json(502,{ok:false,error:"render_signal_unreachable",detail:String(error?.message||error)});
  }
});
