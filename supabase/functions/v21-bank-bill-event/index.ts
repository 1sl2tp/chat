import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const base=Deno.env.get("SUPABASE_URL")||"";
const db=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({ok:false},405);
 const body=await req.json().catch(()=>({})), asset=String(body.asset_id||"");
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(asset))return reply({ok:false},400);
 const {data:r}=await db.from("chat_bank_bill_receipts").select("id,customer_account_id,status,sent_at,created_at").eq("media_asset_id",asset).maybeSingle();
 if(!r||r.customer_account_id!=="8c4ac6ec-3178-4661-8696-04e345bf443e")return reply({ok:false},404);
 if(r.status!=="queued")return reply({ok:true,already_handled:true},202);
 if(Date.now()-new Date(r.sent_at).getTime()>10*60*1000)return reply({ok:true,old_asset_ignored:true},202);
 const today=new Date();today.setUTCHours(0,0,0,0);
 const {count}=await db.from("chat_bank_bill_receipts").select("*",{count:"exact",head:true}).eq("customer_account_id",r.customer_account_id).gte("created_at",today.toISOString());
 if((count||0)>30)return reply({ok:false,reason:"pilot_daily_image_cap"},429);
 const {data:conf,error:configError}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(conf)?conf[0]:conf;
 if(configError||!cfg?.scan_key)return reply({ok:false,reason:"missing_service_configuration"},503);
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),32000);
  let out:Response;
  try{out=await fetch(base+"/functions/v1/v21-bank-bill-pilot",{method:"POST",headers:{"content-type":"application/json","x-internal-dispatch-key":cfg.scan_key},body:JSON.stringify({asset_id:asset}),signal:ctrl.signal});}
  finally{clearTimeout(timer);}
  if(!out.ok)return reply({ok:false,reader_status:out.status},502);
  const parsed=await out.json().catch(()=>({}));
  if(parsed?.status==="review"&&parsed?.reason==="pilot_valid_bill_not_yet_posted"){
    const {data:row}=await db.from("chat_bank_bill_receipts").select("amount_vnd,status,sending_bank,transfer_reference,transfer_at_vn").eq("media_asset_id",asset).maybeSingle();
    if(!row||row.status!=="review"||!row.amount_vnd||row.amount_vnd>10000000)return reply({ok:true,status:"review",reason:"pilot_amount_limit_or_unknown"});
    const {data:posted,error:postError}=await db.rpc("chat_bank_bill_commit_test",{p_asset_id:asset});
    if(postError)return reply({ok:false,status:"review",reason:"collection_failed"},500);
    if(posted?.status==="received"&&posted?.ledger_id){
      const {data:media}=await db.from("v21_media_assets").select("conversation_id").eq("id",asset).maybeSingle();
      const {data:conversation}=await db.from("v21_conversations").select("member_a,member_b").eq("id",media?.conversation_id).maybeSingle();
      const adminId=conversation?.member_a===r.customer_account_id?conversation?.member_b:conversation?.member_a;
      const {data:admin}=await db.from("v21_accounts").select("role").eq("id",adminId).maybeSingle();
      if(admin?.role==="admin"){
        const money=(value:any)=>Math.abs(Number(value)||0).toLocaleString("vi-VN");
        const balanceLine=(value:any,previous:boolean)=>{
          if(value===null||value===undefined)return "";
          const n=Number(value);
          return (n>0?(previous?"Nợ trước: ":"Còn nợ: "):
            n<0?(previous?"Dư trước: ":"Còn dư: "):
            previous?"Trước giao dịch: ":"Đã hết nợ: ")+money(n);
        };
        const bank=String(row?.sending_bank||"").trim().toUpperCase();
        const displayBank=({TECHCOMBANK:"Techcombank",VIETINBANK:"VietinBank",VIETCOMBANK:"Vietcombank",AGRIBANK:"Agribank",BIDV:"BIDV",VPBANK:"VPBank"})[bank]||bank||"Ngân hàng";
        const transferRef=String(row?.transfer_reference||"").trim();
        const bodyText=[
          "✅ Đã thu · "+money(posted.amount_thousands),
          balanceLine(posted.balance_before,true),
          balanceLine(posted.balance_after,false),
          "Ghi chú: Thu chuyển khoản · "+displayBank,
          transferRef?"Mã GD: "+transferRef:"",
          "Phiếu thu kèm bên dưới. Xem chi tiết trong mục Công nợ."
        ].filter(Boolean).join("\n");
        const {data:sent,error:noticeError}=await db.rpc("taphoa_chat_notify_customer",{
          p_customer_id:r.customer_account_id,p_sender_account_id:adminId,
          p_client_id:"taphoa:bill:"+asset+":collection",p_body:bodyText
        });
        if(!noticeError&&sent){
          try{
            const imageResp=await fetch(base+"/functions/v1/v21-bank-bill-receipt-image",{
              method:"POST",headers:{"content-type":"application/json","x-internal-dispatch-key":cfg.scan_key},
              body:JSON.stringify({asset_id:asset})
            });
            if(!imageResp.ok)console.warn("bank_bill_receipt_image_pending",imageResp.status);
          }catch{console.warn("bank_bill_receipt_image_retry_needed");}
        }
      }
      return reply({ok:true,status:"received",amount_thousands:posted.amount_thousands,ledger_id:posted.ledger_id});
    }
    return reply({ok:true,status:posted?.status||"review",reason:posted?.reason||"not_collected"});
  }
  if(parsed?.status==="hold"||parsed?.status==="duplicate"){
    const {data:media}=await db.from("v21_media_assets").select("conversation_id").eq("id",asset).maybeSingle();
    const {data:conversation}=await db.from("v21_conversations").select("member_a,member_b").eq("id",media?.conversation_id).maybeSingle();
    const adminId=conversation?.member_a===r.customer_account_id?conversation?.member_b:conversation?.member_a;
    const {data:admin}=await db.from("v21_accounts").select("role").eq("id",adminId).maybeSingle();
    if(admin?.role==="admin"){
      const text=parsed.status==="duplicate"
       ?"⚠️ Bill đã được ghi nhận trước đó. Không ghi thu lần hai; vui lòng không chuyển thêm để thử."
       :parsed.reason==="old_or_wrong_transaction_day"
         ?"⚠️ Bill thuộc ngày giao dịch cũ. Chưa ghi thu; vui lòng tạm dừng chuyển thêm và liên hệ quản trị."
         :"⚠️ Người nhận hoặc STK nhận không đúng. Chưa ghi thu; vui lòng dừng chuyển thêm và liên hệ quản trị.";
      await db.rpc("taphoa_chat_notify_customer",{
        p_customer_id:r.customer_account_id,p_sender_account_id:adminId,
        p_client_id:"taphoa:bill:"+asset+":collection",p_body:text
      });
    }
  }
  return reply({ok:true,status:parsed?.status||"review",reason:parsed?.reason||""});
 }catch{return reply({ok:false,reason:"reader_temporarily_unavailable"},503)}
});