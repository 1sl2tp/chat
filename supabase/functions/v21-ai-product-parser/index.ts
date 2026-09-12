import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { finalizeProductLines, splitCustomerSegments } from "./parser-core.mjs";

const SUPABASE_URL=String(Deno.env.get("SUPABASE_URL")||"").trim();
const SERVICE_KEY=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const GROQ_URL="https://api.groq.com/openai/v1/chat/completions";
const clean=(value:unknown,max=8000)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

async function runtimeConfig(){
  const result=await db.rpc("getlink_ai_runtime_config");
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    mode:clean(row?.mode,40),
    model:clean(row?.model_name,120),
    secret:clean(row?.webhook_secret,500),
    apiKey:clean(row?.groq_api_key,500),
    pilotIds:new Set<string>((row?.pilot_customer_ids||[]).map((v:unknown)=>clean(v,100)).filter(Boolean)),
  };
}

async function loadCatalog(){
  const result=await db.from("getlink_supplier_products")
    .select("product_code,product_name")
    .eq("is_active",true)
    .order("product_code",{ascending:true})
    .limit(1000);
  if(result.error)throw result.error;
  return (result.data||[])
    .filter((row:any)=>row?.product_code&&row?.product_name)
    .map((row:any)=>({productCode:String(row.product_code),productName:String(row.product_name)}));
}

async function loadLearningLibrary(customerId:string){
  const [rules,storeAliases,customerAliases,examples]=await Promise.all([
    db.from("getlink_ai_knowledge_rules")
      .select("rule_type,rule_text")
      .eq("customer_account_id",customerId)
      .eq("is_active",true)
      .order("updated_at",{ascending:false})
      .limit(300),
    db.from("getlink_ai_product_aliases")
      .select("alias_normalized,product_code,scope")
      .eq("scope","store")
      .limit(1000),
    db.from("getlink_ai_product_aliases")
      .select("alias_normalized,product_code,scope")
      .eq("scope","customer")
      .eq("customer_account_id",customerId)
      .limit(1000),
    db.from("getlink_ai_training_examples")
      .select("raw_text,product_name,product_code,quantity,unit_hint,status")
      .eq("customer_account_id",customerId)
      .neq("status","rejected")
      .order("updated_at",{ascending:false})
      .limit(120),
  ]);
  for(const result of [rules,storeAliases,customerAliases,examples])if(result.error)throw result.error;
  return {
    rules:(rules.data||[]).map((row:any)=>({rule_type:clean(row.rule_type,40),rule_text:clean(row.rule_text,800)})),
    aliases:[...(storeAliases.data||[]),...(customerAliases.data||[])].map((row:any)=>({
      alias:clean(row.alias_normalized,300),product_code:clean(row.product_code,120),scope:clean(row.scope,20),
    })),
    examples:(examples.data||[]).map((row:any)=>({
      raw_text:clean(row.raw_text,800),product_name:clean(row.product_name,300),product_code:row.product_code?clean(row.product_code,120):null,
      quantity:row.quantity==null?null:Number(row.quantity),unit_hint:row.unit_hint?clean(row.unit_hint,80):null,status:clean(row.status,40),
    })),
  };
}

function responseSchema(){
  return {
    type:"object",
    additionalProperties:false,
    properties:{
      results:{
        type:"array",
        items:{
          type:"object",
          additionalProperties:false,
          properties:{
            segment_index:{type:"integer",minimum:0},
            is_product:{type:"boolean"},
            product_name:{type:"string"},
            product_code:{type:["string","null"]},
            quantity:{type:"number",minimum:0.000001},
            unit_hint:{type:["string","null"]},
          },
          required:["segment_index","is_product","product_name","product_code","quantity","unit_hint"],
        },
      },
    },
    required:["results"],
  };
}

async function parseWithGroq(customerText:string,catalog:any[],library:any,cfg:any){
  const segments=splitCustomerSegments(customerText);
  if(!segments.length)return [];
  const input_segments=segments.map((text,index)=>({segment_index:index,text}));
  const input={
    input_segments,
    catalog:catalog.map(row=>({product_code:row.productCode,product_name:row.productName})),
    learning_library:library,
  };
  const systemInstruction=[
    "Bạn là bộ phân tích tên hàng trong Chat của một cửa hàng tạp hóa.",
    "Tầng 1 đã tách input thành input_segments bằng dấu phân cách thật: xuống dòng, dấu phẩy, dấu chấm phẩy hoặc dấu / có khoảng trắng.",
    "Mỗi input_segment là một món tối đa. Tuyệt đối không tách thêm một segment chỉ vì bên trong có số khác.",
    "Ví dụ 'T2 cho em 2t chân gà 1 cửu ca' là một segment: số lượng 2, tên là 'chân gà 1 cửu ca'; số 1 nằm trong tên, không tạo món mới.",
    "Nếu nhiều segment đứng cùng cụm, được dùng ngữ cảnh giữa các segment để hiểu cha/nhóm chung, nhưng vẫn phải trả tối đa một result cho mỗi segment_index.",
    "Lấy từng segment, bỏ câu dẫn nếu có, xác định số lượng và nhận diện tên hàng.",
    "Không tạo đơn hàng, không tính giá, không xử lý giỏ hàng, công nợ hay trạng thái bán hàng.",
    "Phải giữ mọi segment có sản phẩm; chưa nhận diện được SKU cũng không được bỏ.",
    "Input có thể có ít thành phần hơn tên trong catalog. Sửa lỗi chữ, viết tắt và từ tương đương bằng learning_library rồi đặt các thành phần vào đúng ngữ cảnh.",
    "Một số số là thành phần tên hoặc cỡ như 120g, 3 ngăn, 1.8kg; không được lấy chúng làm số lượng nếu cấu trúc segment cho thấy chúng thuộc tên hàng.",
    "aliases, rules và examples trong learning_library là tham chiếu đã học. Quy tắc theo ngữ cảnh phải giữ đúng ngữ cảnh, không biến thành alias toàn cục.",
    "Nếu nhận diện chắc chắn một sản phẩm có trong catalog, product_code phải là đúng mã có sẵn trong catalog.",
    "Tuyệt đối không tự tạo product_code. Nếu chưa đủ chắc hoặc catalog chưa có, product_code=null và product_name giữ cách gọi của khách sau sửa lỗi chữ tối thiểu, không làm mất thành phần tên.",
    "Nếu có SKU thì product_name có thể dùng tên catalog; backend sẽ kiểm tra lại bằng product_code.",
    "quantity là số lượng khách đặt; unit_hint chỉ để hiểu nội bộ và không xuất hiện trong câu trả lời Chat.",
    "Với segment không phải sản phẩm, trả is_product=false. Không tự sinh thêm segment_index ngoài input_segments.",
    "Chỉ trả JSON theo schema, không thêm văn bản giải thích.",
  ].join(" ");
  const response=await fetch(GROQ_URL,{
    method:"POST",
    headers:{authorization:`Bearer ${cfg.apiKey}`,"content-type":"application/json"},
    body:JSON.stringify({
      model:cfg.model,
      messages:[
        {role:"system",content:systemInstruction},
        {role:"user",content:JSON.stringify(input)},
      ],
      temperature:0,
      max_completion_tokens:2200,
      response_format:{
        type:"json_schema",
        json_schema:{name:"chat_product_segments",strict:true,schema:responseSchema()},
      },
    }),
  });
  let payload:any;
  try{payload=await response.json();}catch{throw new Error("model_response_not_json");}
  if(!response.ok)throw new Error(`model_request_failed:${response.status}:${clean(payload?.error?.message||"unknown",220)}`);
  const output=payload?.choices?.[0]?.message?.content;
  if(typeof output!=="string"||!output.trim())throw new Error("model_output_missing");
  let parsed:any;
  try{parsed=JSON.parse(output);}catch{throw new Error("model_output_invalid");}
  const seen=new Set<number>();
  const items:any[]=[];
  for(const row of Array.isArray(parsed?.results)?parsed.results:[]){
    const index=Number(row?.segment_index);
    if(!Number.isInteger(index)||index<0||index>=segments.length||seen.has(index))continue;
    seen.add(index);
    if(row?.is_product!==true)continue;
    const quantity=Number(row?.quantity);
    const productName=clean(row?.product_name,500);
    if(!Number.isFinite(quantity)||quantity<=0||!productName)continue;
    items.push({
      raw_text:segments[index],
      product_name:productName,
      product_code:row?.product_code?clean(row.product_code,120):null,
      quantity,
      unit_hint:row?.unit_hint?clean(row.unit_hint,80):null,
    });
  }
  return items;
}

async function activeAdminId(conversationId:string){
  const conversation=await db.from("v21_conversations")
    .select("member_a,member_b")
    .eq("id",conversationId)
    .maybeSingle();
  if(conversation.error)throw conversation.error;
  const ids=[conversation.data?.member_a,conversation.data?.member_b].map(v=>clean(v,100)).filter(Boolean);
  if(!ids.length)throw new Error("conversation_not_found");
  const accounts=await db.from("v21_accounts")
    .select("id,role,created_at,deleted_at,locked_at")
    .in("id",ids)
    .eq("role","admin")
    .is("deleted_at",null)
    .is("locked_at",null)
    .order("created_at",{ascending:true})
    .limit(1)
    .maybeSingle();
  if(accounts.error)throw accounts.error;
  if(!accounts.data?.id)throw new Error("active_admin_not_found");
  return String(accounts.data.id);
}

async function sendChatReply(conversationId:string,turnKey:string,body:string){
  const adminId=await activeAdminId(conversationId);
  const clientId=`ai:product:${clean(turnKey,90)}`.slice(0,120);
  const existing=await db.from("v21_messages")
    .select("id")
    .eq("sender_account_id",adminId)
    .eq("client_id",clientId)
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.id)return String(existing.data.id);
  const inserted=await db.from("v21_messages").insert({
    conversation_id:conversationId,
    sender_account_id:adminId,
    client_id:clientId,
    body,
  }).select("id").single();
  if(inserted.error)throw inserted.error;
  return String(inserted.data.id);
}

async function markInbox(ids:string[],status:"processed"|"ignored"|"failed",lastError:string|null=null){
  if(!ids.length)return;
  const result=await db.from("getlink_ai_message_inbox").update({
    status,
    processed_at:new Date().toISOString(),
    last_error:lastError,
  }).in("id",ids);
  if(result.error)throw result.error;
}

async function processConversation(conversationId:string,cfg:any){
  const claimed=await db.rpc("getlink_ai_claim_turn",{p_conversation_id:conversationId});
  if(claimed.error)throw claimed.error;
  const rows=Array.isArray(claimed.data)?claimed.data:[];
  if(!rows.length)return {claimed:0,replied:false};
  const inboxIds=rows.map((row:any)=>String(row.inbox_id));
  const customerId=clean(rows[0]?.customer_account_id,100);
  if(cfg.mode!=="pilot"||!cfg.pilotIds.has(customerId)){
    await markInbox(inboxIds,"ignored");
    return {claimed:rows.length,replied:false};
  }
  try{
    const [catalog,library]=await Promise.all([loadCatalog(),loadLearningLibrary(customerId)]);
    const customerText=rows.map((row:any)=>String(row.message_body||"").trim()).filter(Boolean).join("\n");
    const modelItems=await parseWithGroq(customerText,catalog,library,cfg);
    const lines=finalizeProductLines(modelItems,catalog);
    if(lines.length){
      const body=lines.map((row:any)=>row.line).join("\n");
      await sendChatReply(conversationId,clean(rows[0]?.turn_key,100)||String(rows[0]?.message_id||Date.now()),body);
    }
    await markInbox(inboxIds,"processed");
    return {claimed:rows.length,replied:lines.length>0,items:lines.length};
  }catch(error){
    await markInbox(inboxIds,"failed",String(error).slice(0,500));
    throw error;
  }
}

Deno.serve(async(req:Request)=>{
  try{
    const cfg=await runtimeConfig();
    if(req.method==="GET"){
      return new Response(JSON.stringify({
        ok:true,chat_ai:true,order_workflow:false,provider:"groq",model:cfg.model,
        model_configured:Boolean(cfg.model&&cfg.apiKey),mode:cfg.mode,
      }),{headers:{"content-type":"application/json"}});
    }
    if(req.method!=="POST")return new Response("method not allowed",{status:405});
    if(!cfg.secret||req.headers.get("x-order-agent-secret")!==cfg.secret)return new Response("unauthorized",{status:401});
    if(!cfg.apiKey||!cfg.model)return new Response(JSON.stringify({ok:false,error:"model_not_configured"}),{status:503,headers:{"content-type":"application/json"}});
    let body:any={};
    try{body=await req.json();}catch{body={};}
    const conversationId=clean(body?.conversation_id,100);
    if(!conversationId)return new Response(JSON.stringify({ok:false,error:"conversation_id_required"}),{status:400,headers:{"content-type":"application/json"}});
    await sleep(4200);
    const result=await processConversation(conversationId,cfg);
    return new Response(JSON.stringify({ok:true,...result}),{headers:{"content-type":"application/json"}});
  }catch(error){
    return new Response(JSON.stringify({ok:false,error:clean(error instanceof Error?error.message:error,500)}),{status:500,headers:{"content-type":"application/json"}});
  }
});
