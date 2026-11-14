// NCC-007: NCC AI is a private virtual Admin room, not a customer contact.
// The server is the sole source of truth; Chat/Zalo, debts and cost prices stay untouched.
(()=>{"use strict";
const FUNCTION="v21-ncc-ai-room";
const auth=()=>window.V21AuthSessionStore||null;
const isAdmin=()=>{
 const s=auth()?.snapshot?.()||{};
 return s.state==="AUTHENTICATED"&&s.account?.role==="admin";
};
const clock=value=>new Intl.DateTimeFormat("vi-VN",{
 timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
}).format(new Date(value||Date.now()));
const day=value=>new Intl.DateTimeFormat("vi-VN",{
 timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric"
}).format(new Date(value||Date.now()));
const money=value=>value==null?"—":Number(value).toLocaleString("vi-VN",{maximumFractionDigits:2});
const room=document.createElement("section");
room.className="ncc-ai-room";
room.id="nccAiRoom";
room.hidden=true;
room.setAttribute("aria-label","NCC AI · Trò chuyện đọc phiếu nhập");
room.innerHTML=[
 '<header class="ncc-ai-head"><button type="button" class="ncc-ai-back" data-ncc-room-back aria-label="Quay lại Công việc">‹</button>',
 '<span class="ncc-ai-avatar" aria-hidden="true">AI</span>',
 '<span class="ncc-ai-identity"><strong>NCC AI</strong><small>Đọc phiếu nhập · Tài khoản công việc</small></span>',
 '<span class="ncc-ai-presence" data-ncc-room-presence>Chưa kết nối</span></header>',
 '<div class="ncc-ai-thread" data-ncc-room-thread role="log" aria-live="polite" aria-label="Tin nhắn và bảng AI"></div>',
 '<div class="ncc-ai-composer">',
  '<div data-ncc-room-preview class="ncc-ai-preview" hidden><img alt="Ảnh chuẩn bị gửi"><span data-ncc-room-filename></span>',
   '<button type="button" data-ncc-room-remove aria-label="Bỏ ảnh">×</button></div>',
  '<div class="ncc-ai-composer-row">',
   '<label class="ncc-ai-attach" aria-label="Chọn ảnh từ thư viện hoặc camera">＋<input type="file" data-ncc-room-file accept="image/*" aria-label="Chọn ảnh từ thư viện hoặc camera"></label>',
   '<div class="ncc-ai-input-hint">Bấm + chọn ảnh · AI tự đọc ngay</div>',
   '<button class="ncc-ai-send" type="button" data-ncc-room-send disabled aria-label="Gửi ảnh và đọc bảng">↑</button>',
  '</div><p class="ncc-ai-state" data-ncc-room-state role="status">Chỉ Admin · Không tự ghi giá vốn hay công nợ</p>',
 '</div>'
].join("");
document.body.appendChild(room);
const thread=room.querySelector("[data-ncc-room-thread]");
const fileInput=room.querySelector("[data-ncc-room-file]");
const send=room.querySelector("[data-ncc-room-send]");
const state=room.querySelector("[data-ncc-room-state]");
const presence=room.querySelector("[data-ncc-room-presence]");
const preview=room.querySelector("[data-ncc-room-preview]");
let previewUrl="",ready=false,busy=false,session="",opened=false;
let selectedPhoto=null,selectVersion=0;
const visibleHashes=new Set();
const attachedUrls=new Set();
const say=text=>{state.textContent=text;};
function valid(file){
 return !!(file&&["image/jpeg","image/png","image/webp"].includes(file.type)&&
 file.size>=100&&file.size<=4000000);
}
function sync(){
 send.disabled=!ready||busy||!valid(selectedPhoto)||!isAdmin();
}
function clearPreview(){
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl="";}
 fileInput.value="";selectedPhoto=null;preview.hidden=true;preview.querySelector("img").removeAttribute("src");
 sync();
}
function purge(){
 selectVersion++;
 clearPreview();
 for(const url of attachedUrls)URL.revokeObjectURL(url);
 attachedUrls.clear();visibleHashes.clear();thread.replaceChildren();
 ready=false;busy=false;session="";sync();
}
function node(parent,tag,text,className){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=String(text);
 parent.appendChild(el);return el;
}
function message(side,title,date){
 const row=node(thread,"article",undefined,"ncc-ai-message "+(side==="me"?"ncc-ai-me":"ncc-ai-bot"));
 const header=node(row,"div",undefined,"ncc-ai-msg-meta");
 node(header,"strong",title);
 const stamp=node(header,"time",clock(date));
 stamp.dateTime=new Date(date||Date.now()).toISOString();
 const bubble=node(row,"div",undefined,"ncc-ai-bubble");
 thread.scrollTop=thread.scrollHeight;
 return bubble;
}
function dateSeparator(date){
 const today=day(date);
 if(thread.dataset.day===today)return;
 node(thread,"div",today,"ncc-ai-date");
 thread.dataset.day=today;
}
function appendAdmin(file,date,imageUrl){
 dateSeparator(date);
 const bubble=message("me","Admin · Ảnh phiếu nhập",date);
 if(file||imageUrl){
  const img=node(bubble,"img",undefined,"ncc-ai-photo");
  if(file){const url=URL.createObjectURL(file);attachedUrls.add(url);img.src=url;}
  else img.src=imageUrl;
  img.alt="Ảnh phiếu đã gửi";
 }
 node(bubble,"small",file?.name||"Ảnh phiếu nhập");
 return bubble;
}
function appendTable(record,{duplicate=false}={}){
 const created=record.created_at||new Date().toISOString();
 dateSeparator(created);
 const bubble=message("bot","NCC AI",created);
 if(duplicate)node(bubble,"p","Ảnh trùng — đã xử lý trước đó, không đọc AI lần nữa.","ncc-ai-duplicate");
 const lines=Array.isArray(record.lines)?record.lines:[];
 if(record.status==="not_invoice"){
  node(bubble,"p","Ảnh này không phải phiếu nhập hàng. Không lập bảng.","ncc-ai-explanation");
 }else if(!lines.length){
  node(bubble,"p","Chưa đọc được dòng hàng rõ ràng. Có thể gửi ảnh rõ hơn.","ncc-ai-explanation");
 }else{
  node(bubble,"strong","Đã trích xuất "+lines.length+" dòng hàng · Bản nháp");
  const wrap=node(bubble,"div",undefined,"ncc-ai-table-scroll");
  const table=node(wrap,"table",undefined,"ncc-ai-table");
  const tr=node(node(table,"thead"),"tr");
  ["STT","Tên hàng","SL","ĐVT","Đơn giá","Thành tiền"].forEach(label=>node(tr,"th",label));
  const tbody=node(table,"tbody");
  for(const line of lines){
   const row=node(tbody,"tr");
   [line.row_no??"",line.printed_name||"Chưa đọc rõ",line.quantity??"—",
    line.printed_unit||"—",money(line.unit_price_vnd),money(line.line_total_vnd)]
    .forEach(value=>node(row,"td",value));
  }
  const copy=node(bubble,"button","Sao chép bảng","ncc-ai-copy");
  copy.type="button";
  copy.addEventListener("click",async()=>{
   const clean=x=>String(x??"").replace(/[\r\n\t]/g," ").trim();
   const linesText=lines.map(line=>[line.row_no,line.printed_name,
    line.quantity,line.printed_unit,line.unit_price_vnd,line.line_total_vnd].map(clean).join("\t"));
   try{
    await navigator.clipboard.writeText(
     ["STT\tTên hàng\tSL\tĐVT\tĐơn giá\tThành tiền",...linesText].join("\n")
    );say("Đã sao chép "+lines.length+" dòng hàng.");
   }catch{say("Không sao chép được trên thiết bị này.");}
  });
 }
 node(bubble,"p","Chỉ lấy thông tin từ ảnh. Chưa nhập kho, liên kết sản phẩm hoặc sửa giá vốn.","ncc-ai-disclaimer");
 thread.scrollTop=thread.scrollHeight;
}
function renderRecord(record){
 if(!record?.hash||visibleHashes.has(record.hash))return;
 visibleHashes.add(record.hash);
 appendAdmin(null,record.created_at,record.image_url);
 appendTable(record);
}
function appendInfo(text){
 const bubble=message("bot","NCC AI",new Date().toISOString());
 node(bubble,"p",text);
 thread.scrollTop=thread.scrollHeight;
}
function accountSession(){
 const s=auth()?.snapshot?.()||{};
 return isAdmin()&&s.account?.id&&s.appSessionId?
  s.account.id+"|"+s.appSessionId:"";
}
async function api(action,values={}){
 const client=auth()?.getClient?.();
 if(!client||!isAdmin())throw Error("admin_required");
 const {data,error}=await client.functions.invoke(FUNCTION,{body:{action,...values}});
 if(error||!data?.ok)throw Error(data?.code||"function_unavailable");
 return data;
}
function errorText(error){
 const reason=String(error?.message||"");
 if(reason==="ai_unavailable"||reason==="ai_invalid_json"||reason==="ai_empty")
  return "AI chưa đọc được ảnh. Có thể gửi lại sau.";
 if(reason==="ai_not_configured")return "Máy chủ chưa kết nối được với AI.";
 if(reason==="invalid_image_type"||reason==="invalid_image_size")
  return "Chỉ nhận JPG, PNG hoặc WebP tối đa 4 MB.";
 if(reason==="storage_unavailable"||reason.includes("storage"))
  return "Chưa lưu được ảnh; hệ thống lưu trữ đang gián đoạn.";
 if(reason==="admin_required")return "Cần đăng nhập tài khoản Admin.";
 return "Chưa xử lý được ảnh. Kiểm tra kết nối và thử lại.";
}
// NCC-008: iOS Photos may return HEIC/HEIF or images larger than the
// 4 MB server limit. Convert locally to JPEG while keeping receipt text clear.
// Only the explicitly selected image is read; nothing is auto-imported.
async function prepareSelectedPhoto(file){
 if(!file||file.size<100||file.size>25000000)
  throw Error("invalid_image_size");
 if(["image/jpeg","image/png","image/webp"].includes(file.type)&&file.size<=4000000)
  return file;
 const plausible=/^image\//.test(file.type)||
  /\.(?:jpg|jpeg|png|webp|heic|heif)$/i.test(file.name||"");
 if(!plausible)throw Error("invalid_image_type");
 let bitmap=null,source=null;
 let objectUrl="";
 try{
  if(typeof createImageBitmap==="function"){
   try{bitmap=await createImageBitmap(file);}catch{}
  }
  if(!bitmap){
   objectUrl=URL.createObjectURL(file);
   source=await new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(Error("image_decode_failed"));
    image.src=objectUrl;
   });
  }
  const width=bitmap?.width||source?.naturalWidth||0;
  const height=bitmap?.height||source?.naturalHeight||0;
  if(!width||!height)throw Error("image_decode_failed");
  const canvas=document.createElement("canvas");
  const fit=Math.min(1,2600/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*fit));
  canvas.height=Math.max(1,Math.round(height*fit));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("image_decode_failed");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap||source,0,0,canvas.width,canvas.height);
  const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
  let blob=await encode(.88);
  if(blob?.size>4000000)blob=await encode(.72);
  if(!blob||blob.size<100||blob.size>4000000)
   throw Error("image_too_large");
  const basename=(file.name||"phieu-nhap").replace(/\.[^.]+$/,"");
  return new File([blob],basename+".jpg",{type:"image/jpeg",lastModified:Date.now()});
 }finally{
  if(bitmap&&typeof bitmap.close==="function")bitmap.close();
  if(objectUrl)URL.revokeObjectURL(objectUrl);
 }
}
function fileBase64(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error("file_read_failed"));
  reader.onload=()=>{
   const val=String(reader.result||"").split(",")[1];
   val?resolve(val):reject(Error("file_read_failed"));
  };
  reader.readAsDataURL(file);
 });
}
async function checkStatus(hash,owner){
 for(let i=0;i<18;i++){
  if(!opened||accountSession()!==owner)return null;
  await new Promise(resolve=>setTimeout(resolve,1000));
  if(!opened||accountSession()!==owner)return null;
  const res=await api("status",{hash});
  if(res.record)return res.record;
 }
 return null;
}
async function submit(){
 const file=selectedPhoto;
 if(busy||!ready||!isAdmin()||!valid(file))return;
 const owner=accountSession();if(!owner)return;
 busy=true;sync();
 const at=new Date().toISOString();
 appendAdmin(file,at);
 clearPreview();
 say("Đã nhận thao tác. Đang gửi ảnh để AI đọc bảng…");
 try{
  const base64=await fileBase64(file);
  if(accountSession()!==owner||!opened)return;
  const result=await api("send",{mime:file.type,base64});
  if(accountSession()!==owner||!opened)return;
  if(result.record){
   if(result.duplicate){
    say("Ảnh trùng — đã đọc trước đó.");
    appendTable(result.record,{duplicate:true});
   }else{
    visibleHashes.add(result.record.hash);
    appendTable(result.record);
    say("Đã đọc xong. Kiểm tra bảng trước khi sử dụng.");
   }
  }else if(result.status==="processing"){
   say("Ảnh đã có lượt đọc đang chạy. Đang chờ kết quả…");
   const previous=await checkStatus(result.hash,owner);
   if(previous){appendTable(previous,{duplicate:true});say("Ảnh trùng — kết quả đã có trước đó.");}
   else say("Đang xử lý. Mở lại NCC AI để xem kết quả.");
  }else{
   say("Ảnh chưa có kết quả. Kiểm tra lại trong lịch sử.");
  }
 }catch(error){
  if(opened&&accountSession()===owner){
   say(errorText(error));
   appendInfo("Ảnh chưa được xử lý thành công. Có thể thử gửi lại.");
  }
 }finally{
  busy=false;sync();
 }
}
async function open(){
 if(!isAdmin())return;
 const owner=accountSession();if(!owner)return;
 if(session!==owner){purge();session=owner;}
 room.hidden=false;opened=true;
 document.body.classList.add("ncc-ai-room-open");
 ready=false;presence.textContent="Đang kết nối";sync();
 if(!thread.children.length)appendInfo("Gửi ảnh phiếu nhập vào đây. Mình sẽ đọc bảng hàng, báo ảnh trùng và lưu lịch sử cho Admin.");
 try{
  const health=await api("health");
  if(!opened||accountSession()!==owner)return;
  ready=health.ready===true;
  presence.textContent=ready?"Sẵn sàng":"Chưa có AI";
  if(!ready){say("Máy chủ AI chưa sẵn sàng.");sync();return;}
  say("Sẵn sàng nhận ảnh phiếu nhập.");
  const history=await api("history");
  if(!opened||accountSession()!==owner)return;
  const records=Array.isArray(history.records)?history.records.slice().reverse():[];
  if(records.length){
   thread.replaceChildren();visibleHashes.clear();delete thread.dataset.day;
   records.forEach(renderRecord);
  }
 }catch{
  if(opened&&accountSession()===owner){
   presence.textContent="Chưa kết nối";
   say("Chưa kết nối được NCC AI. Tính năng đang cần máy chủ.");
  }
 }
 sync();
}
function close(){
 room.hidden=true;opened=false;
 document.body.classList.remove("ncc-ai-room-open");
 clearPreview();
}
room.querySelector("[data-ncc-room-back]").addEventListener("click",close);
room.querySelector("[data-ncc-room-remove]").addEventListener("click",()=>{
 selectVersion++;
 clearPreview();
 say("Đã bỏ ảnh chưa gửi.");
});
fileInput.addEventListener("click",()=>{
 if(!ready&&!busy)say("AI chưa kết nối; ảnh chưa được gửi.");
});
fileInput.addEventListener("change",async()=>{
 const inputFile=fileInput.files?.[0];
 if(!inputFile)return;
 const owner=accountSession();
 const version=++selectVersion;
 say("Đang chuẩn bị ảnh để đọc bảng…");
 try{
  const photo=await prepareSelectedPhoto(inputFile);
  if(version!==selectVersion||!opened||owner!==accountSession())return;
  if(!ready){say("AI chưa sẵn sàng, chưa gửi ảnh.");return;}
  selectedPhoto=photo;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(photo);
  preview.querySelector("img").src=previewUrl;
  room.querySelector("[data-ncc-room-filename]").textContent=photo.name;
  preview.hidden=false;
  sync();
  // Choosing a photo is the explicit Admin action. Automatically send it
  // through the authenticated NCC room, without an extra arrow tap.
  await submit();
 }catch(error){
  if(version!==selectVersion||!opened||owner!==accountSession())return;
  const reason=String(error?.message||"");
  say(reason==="image_decode_failed"
   ?"iPhone chưa chuyển được ảnh HEIC. Hãy chọn ảnh JPG/PNG hoặc chụp lại."
   :reason==="image_too_large"||reason==="invalid_image_size"
    ?"Ảnh quá lớn để đọc. Hãy chọn ảnh nhỏ hơn 25 MB."
    :"Ảnh không hợp lệ. Hãy chọn JPG, PNG, WebP hoặc HEIC.");
  clearPreview();
 }
});
send.addEventListener("click",()=>{void submit();});
document.addEventListener("v21-auth-state",()=>{
 if(!isAdmin()){close();purge();}
});
function launchButton(full=false){
 const btn=document.createElement("button");
 btn.type="button";btn.className=full?"ncc-ai-launch ncc-ai-launch-full":"ncc-ai-launch";
 btn.textContent=full?"Mở trò chuyện NCC AI":"NCC AI";
 btn.addEventListener("click",()=>{void open();});
 return btn;
}
function mount(){
 const report=document.getElementById("bankReportDashboard");
 if(!report)return;
 const title=report.querySelector(".bank-report-title-row");
 if(title&&!title.querySelector("[data-ncc-room-shortcut]")){
  const btn=launchButton();
  btn.dataset.nccRoomShortcut="";
  title.appendChild(btn);
 }
 const slot=report.querySelector("[data-bank-report-ncc-slot]");
 if(slot&&!slot.querySelector("[data-ncc-room-launch]")){
  slot.replaceChildren();
  const btn=launchButton(true);
  btn.dataset.nccRoomLaunch="";
  slot.appendChild(btn);
 }
}
mount();
document.addEventListener("v21-auth-state",()=>{if(isAdmin())mount();});
window.V21NccAiRoom=Object.freeze({open,close,mount});
})();
