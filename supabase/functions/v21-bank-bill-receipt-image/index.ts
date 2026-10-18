import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const base=Deno.env.get("SUPABASE_URL")||"";
const db=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
const json=(o:any,status=200)=>new Response(JSON.stringify(o),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const FONT:Record<string,string[]>={
" ":["00000","00000","00000","00000","00000","00000","00000"],
"A":["01110","10001","10001","11111","10001","10001","10001"],
"B":["11110","10001","10001","11110","10001","10001","11110"],
"C":["01111","10000","10000","10000","10000","10000","01111"],
"D":["11110","10001","10001","10001","10001","10001","11110"],
"E":["11111","10000","10000","11110","10000","10000","11111"],
"F":["11111","10000","10000","11110","10000","10000","10000"],
"G":["01111","10000","10000","10111","10001","10001","01110"],
"H":["10001","10001","10001","11111","10001","10001","10001"],
"I":["11111","00100","00100","00100","00100","00100","11111"],
"J":["00111","00010","00010","00010","10010","10010","01100"],
"K":["10001","10010","10100","11000","10100","10010","10001"],
"L":["10000","10000","10000","10000","10000","10000","11111"],
"M":["10001","11011","10101","10101","10001","10001","10001"],
"N":["10001","11001","10101","10011","10001","10001","10001"],
"O":["01110","10001","10001","10001","10001","10001","01110"],
"P":["11110","10001","10001","11110","10000","10000","10000"],
"Q":["01110","10001","10001","10001","10101","10010","01101"],
"R":["11110","10001","10001","11110","10100","10010","10001"],
"S":["01111","10000","10000","01110","00001","00001","11110"],
"T":["11111","00100","00100","00100","00100","00100","00100"],
"U":["10001","10001","10001","10001","10001","10001","01110"],
"V":["10001","10001","10001","10001","10001","01010","00100"],
"W":["10001","10001","10001","10101","10101","10101","01010"],
"X":["10001","10001","01010","00100","01010","10001","10001"],
"Y":["10001","10001","01010","00100","00100","00100","00100"],
"Z":["11111","00001","00010","00100","01000","10000","11111"],
"0":["01110","10001","10011","10101","11001","10001","01110"],
"1":["00100","01100","00100","00100","00100","00100","01110"],
"2":["01110","10001","00001","00010","00100","01000","11111"],
"3":["11110","00001","00001","00110","00001","00001","11110"],
"4":["00010","00110","01010","10010","11111","00010","00010"],
"5":["11111","10000","10000","11110","00001","00001","11110"],
"6":["01110","10000","10000","11110","10001","10001","01110"],
"7":["11111","00001","00010","00100","01000","01000","01000"],
"8":["01110","10001","10001","01110","10001","10001","01110"],
"9":["01110","10001","10001","01111","00001","00001","01110"],
".":["00000","00000","00000","00000","00000","00110","00110"],
":":["00000","00110","00110","00000","00110","00110","00000"],
"/":["00001","00001","00010","00100","01000","10000","10000"],
"-":["00000","00000","00000","11111","00000","00000","00000"],
"?":["01110","10001","00001","00010","00100","00000","00100"],
"_":["00000","00000","00000","00000","00000","00000","11111"]
};
function pngReceipt({amount,bank,ref,customer,at,before,after}:{amount:number;bank:string;ref:string;customer:string;at:string;before:number|null;after:number|null}){
 const W=720,H=530,px=new Uint8Array(W*H*4);
 const paint=(x:number,y:number,w:number,h:number,color:number[])=>{
  for(let yy=Math.max(0,y);yy<Math.min(H,y+h);yy++){
   for(let xx=Math.max(0,x);xx<Math.min(W,x+w);xx++){
    const i=(yy*W+xx)*4;px[i]=color[0];px[i+1]=color[1];px[i+2]=color[2];px[i+3]=255;
   }
  }
 };
 const NAVY=[17,41,64],WHITE=[255,255,255],LIGHT=[245,248,251],INK=[39,55,72],MUTED=[102,119,135],GREEN=[2,137,85],PALE=[235,248,241];
 function txt(value:any,x:number,y:number,scale:number,color:number[],max=50){
  const msg=String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[Đđ]/g,"D").toUpperCase().slice(0,max);
  let col=0;
  for(const c of msg){
   const pattern=FONT[c]||FONT["?"];
   for(let j=0;j<7;j++)for(let k=0;k<5;k++)if(pattern[j][k]==="1")paint(x+col*scale*6+k*scale,y+j*scale,scale,scale,color);
   col++;
  }
 }
 const money=(v:number)=>Math.abs(v).toLocaleString("vi-VN");
 paint(0,0,W,H,WHITE);paint(0,0,W,122,NAVY);
 txt("TAP HOA / PHIEU THU",36,24,2,[170,204,223],40);
 txt("THU CHUYEN KHOAN",36,64,4,WHITE,32);
 paint(30,151,660,139,PALE);
 txt("SO TIEN DA THU",49,174,2,MUTED,38);
 txt(money(amount),49,217,6,GREEN,15);
 txt("KHACH HANG",36,324,2,MUTED,30);
 txt(customer||"KHACH HANG",245,324,2,INK,29);
 txt("NGAN HANG",36,360,2,MUTED,30);
 txt(bank||"NGAN HANG",245,360,2,INK,28);
 txt("MA GIAO DICH",36,396,2,MUTED,30);
 txt(ref||"KHONG CO MA",245,396,2,INK,30);
 if(before!==null&&after!==null){
   txt("NO TRUOC",36,433,2,MUTED,22);txt(money(before),245,433,2,INK,20);
   txt("CON NO",383,433,2,MUTED,20);txt(money(after),513,433,2,GREEN,15);
 }
 paint(30,476,660,2,[222,232,239]);
 txt("DOI CHIEU TRONG MUC CONG NO",36,494,2,MUTED,40);
 // Standard PNG rgba row filter=0 + zlib compression + CRC32 chunks.
 const filtered=new Uint8Array((W*4+1)*H);
 for(let y=0;y<H;y++){const dst=y*(W*4+1);filtered[dst]=0;filtered.set(px.subarray(y*W*4,(y+1)*W*4),dst+1)}
 return {width:W,height:H,filtered};
}
function u32(n:number){return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);}
function join(arr:Uint8Array[]){const all=new Uint8Array(arr.reduce((n,x)=>n+x.length,0));let n=0;for(const x of arr){all.set(x,n);n+=x.length;}return all}
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1}return (c^0xffffffff)>>>0;}
function chunk(name:string,data:Uint8Array){const type=new TextEncoder().encode(name);return join([u32(data.length),type,data,u32(crc32(join([type,data])))]);}
async function encodePng(img:ReturnType<typeof pngReceipt>){
 const stream=new Blob([img.filtered]).stream().pipeThrough(new CompressionStream("deflate"));
 const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
 return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk("IHDR",join([u32(img.width),u32(img.height),new Uint8Array([8,6,0,0,0])])),chunk("IDAT",compressed),chunk("IEND",new Uint8Array())]);
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const {data:conf,error:configErr}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(conf)?conf[0]:conf;
 if(configErr||!cfg?.scan_key||req.headers.get("x-internal-dispatch-key")!==cfg.scan_key)return json({error:"not_authorized"},403);
 const {asset_id}=await req.json().catch(()=>({}));
 if(!/^[0-9a-f-]{36}$/i.test(String(asset_id||"")))return json({error:"asset_id_required"},400);
 const {data:r,error:err}=await db.from("chat_bank_bill_receipts").select("id,media_asset_id,customer_account_id,status,amount_vnd,ledger_id,sending_bank,transfer_reference,transfer_at_vn,balance_before_thousands,balance_after_thousands").eq("media_asset_id",String(asset_id)).maybeSingle();
 if(err||!r||r.customer_account_id!=="8c4ac6ec-3178-4661-8696-04e345bf443e"||r.status!=="received"||!r.ledger_id||!r.amount_vnd)return json({error:"no_committed_receipt"},403);
 const clientId="taphoa:bill:"+r.media_asset_id+":collection";
 const {data:m}=await db.from("v21_messages").select("id,conversation_id,sender_account_id,client_id,deleted_at").eq("client_id",clientId).is("deleted_at",null).maybeSingle();
 if(!m||m.client_id!==clientId)return json({error:"receipt_notice_not_sent"},409);
 const {data:a}=await db.from("v21_accounts").select("role").eq("id",m.sender_account_id).maybeSingle();
 if(a?.role!=="admin")return json({error:"not_admin_message"},403);
 const {data:cv}=await db.from("v21_conversations").select("member_a,member_b").eq("id",m.conversation_id).maybeSingle();
 if(!cv||![cv.member_a,cv.member_b].includes(r.customer_account_id))return json({error:"message_not_customer"},403);
 const {data:old}=await db.from("v21_media_assets").select("id").eq("id",r.id).is("deleted_at",null).maybeSingle();
 if(old)return json({ok:true,already_attached:true,message_id:m.id,asset_id:r.id});
 const {data:customer}=await db.from("v21_accounts").select("display_name,username").eq("id",r.customer_account_id).maybeSingle();
 const img=pngReceipt({
  amount:r.amount_vnd/1000,bank:r.sending_bank||"",ref:r.transfer_reference||"",
  customer:customer?.display_name||customer?.username||"TEST",at:String(r.transfer_at_vn||""),
  before:r.balance_before_thousands===null?null:Number(r.balance_before_thousands),
  after:r.balance_after_thousands===null?null:Number(r.balance_after_thousands)
 });
 const png=await encodePng(img);
 if(png.length<200||png.length>2000000)return json({error:"invalid_png"},500);
 const path=m.sender_account_id+"/"+m.conversation_id+"/"+r.id;
 const up=await db.storage.from("v21-media").upload(path,new Blob([png],{type:"image/png"}),{contentType:"image/png",upsert:false,cacheControl:"3600"});
 if(up.error&&!String(up.error.message||"").toLowerCase().includes("already exists")&&String(up.error.statusCode||"")!=="409")return json({error:"upload_failed"},500);
 const {error:saved}=await db.from("v21_media_assets").upsert({
  id:r.id,conversation_id:m.conversation_id,message_id:m.id,owner_account_id:m.sender_account_id,
  kind:"image",mime_type:"image/png",size_bytes:png.length,storage_key:path,
  width_px:img.width,height_px:img.height,sort_index:0
 },{onConflict:"id",ignoreDuplicates:true});
 if(saved)return json({error:"media_link_failed"},500);
 return json({ok:true,message_id:m.id,asset_id:r.id,image_bytes:png.length,width:img.width,height:img.height});
});