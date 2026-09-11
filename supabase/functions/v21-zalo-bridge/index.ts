import { createClient } from "npm:@supabase/supabase-js@2";

const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"});
  const url=Deno.env.get("SUPABASE_URL")??"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!service)return reply(500,{ok:false,error:"server_config_missing"});

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const bridgeToken=req.headers.get("x-bridge-token")??"";
  if(!bridgeToken)return reply(401,{ok:false,error:"unauthorized"});
  const tokenHash=await sha256Hex(bridgeToken);
  const {data:authRow,error:authError}=await admin.from("v21_zalo_bridge_auth").select("token_sha256").eq("id","primary").maybeSingle();
  if(authError)return reply(500,{ok:false,error:"auth_lookup_failed"});
  if(!authRow||authRow.token_sha256!==tokenHash)return reply(403,{ok:false,error:"unauthorized"});

  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"});}
  const action=String(body?.action??"").trim();

  if(action==="ingress"){
    const {data,error}=await admin.rpc("v21_zalo_ingress",{
      p_zalo_id:String(body.zalo_id??""),
      p_zalo_message_id:String(body.zalo_message_id??""),
      p_body:String(body.body??""),
      p_event_at:body.event_at??null,
    });
    if(error)return reply(500,{ok:false,error:"ingress_failed"});
    return reply(200,{ok:true,message_id:data??null});
  }

  if(action==="outbound_due"){
    const limit=Math.max(1,Math.min(Number(body.limit)||20,100));
    const {data,error}=await admin.rpc("v21_zalo_outbound_due",{p_limit:limit});
    if(error)return reply(500,{ok:false,error:"outbound_due_failed"});
    return reply(200,{ok:true,rows:Array.isArray(data)?data:[]});
  }

  if(action==="outbound_result"){
    const {data,error}=await admin.rpc("v21_zalo_outbound_result",{
      p_delivery_id:String(body.delivery_id??""),
      p_ok:Boolean(body.ok),
      p_zalo_message_id:body.zalo_message_id==null?null:String(body.zalo_message_id),
      p_error:body.error==null?null:String(body.error),
    });
    if(error)return reply(500,{ok:false,error:"outbound_result_failed"});
    return reply(200,{ok:true,updated:Boolean(data)});
  }

  if(action==="sync_linked_avatars"){
    const {data:links,error:linksError}=await admin.from("zalo_user_links").select("chat_account_id,zalo_id");
    if(linksError)return reply(500,{ok:false,error:"links_read_failed"});
    if(!links?.length)return reply(200,{ok:true,count:0});

    const zaloIds=[...new Set(links.map(row=>String(row.zalo_id||"")).filter(Boolean))];
    const accountIds=[...new Set(links.map(row=>String(row.chat_account_id||"")).filter(Boolean))];
    const [{data:contacts,error:contactsError},{data:accounts,error:accountsError}]=await Promise.all([
      admin.from("zalo_contacts").select("zalo_id,avatar_url").in("zalo_id",zaloIds),
      admin.from("v21_accounts").select("id,avatar_path").in("id",accountIds),
    ]);
    if(contactsError||accountsError)return reply(500,{ok:false,error:"avatar_lookup_failed"});

    const avatarByZalo=new Map((contacts??[]).map(row=>[String(row.zalo_id),String(row.avatar_url??"").trim()]));
    const currentByAccount=new Map((accounts??[]).map(row=>[String(row.id),String(row.avatar_path??"").trim()]));
    let count=0;
    for(const link of links){
      const accountId=String(link.chat_account_id||"");
      const avatarUrl=avatarByZalo.get(String(link.zalo_id||""))||"";
      const current=currentByAccount.get(accountId)||"";
      if(!accountId||!/^https?:\/\//i.test(avatarUrl))continue;
      if(current&&!/^https?:\/\//i.test(current))continue;
      if(current===avatarUrl)continue;
      const {error}=await admin.from("v21_accounts").update({avatar_path:avatarUrl,updated_at:new Date().toISOString()}).eq("id",accountId);
      if(error)return reply(500,{ok:false,error:"avatar_update_failed"});
      count++;
    }
    return reply(200,{ok:true,count});
  }

  return reply(400,{ok:false,error:"invalid_action"});
});
