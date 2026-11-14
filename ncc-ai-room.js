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
let embeddedHost=null;
let selectedPhoto=null,selectVersion=0,supportsRecheck=false,supportsProductLinks=false;
let productCatalog=null;
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
 productCatalog=null;supportsProductLinks=false;
 ready=false;supportsRecheck=false;busy=false;session="";sync();
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
// NCC-010: Admin alone confirms a supplier's printed name -> canonical code.
// Product name and Vietnamese label remain distinct; invoice price is read-only.
const findProductLink=(record,line)=>Array.isArray(record.product_links)
 ?record.product_links.find(x=>Number(x.row_no)===Number(line.row_no)):null;
const normalizedSearch=value=>String(value||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLowerCase();
async function openProductLinkEditor(bubble,record,line,refresh){
 bubble.querySelector(".ncc-ai-link-editor")?.remove();
 const editor=node(bubble,"section",undefined,"ncc-ai-link-editor");
 const feedback=node(editor,"p","Đang tải danh mục sản phẩm…");
 const owner=accountSession();
 if(!supportsProductLinks||!record?.hash){
  feedback.textContent="Chức năng liên kết sản phẩm chưa sẵn sàng.";return;
 }
 try{
  if(!productCatalog){
   const result=await api("catalog");
   if(!Array.isArray(result.products))throw Error("product_identity_unavailable");
   productCatalog=result.products;
  }
  if(!editor.isConnected||owner!==accountSession())return;
  feedback.textContent="Chọn đúng mã SP. Chỉ lưu liên kết tên, không sửa giá vốn.";
  const search=node(editor,"input");
  search.type="search";search.placeholder="Tìm tên hoặc mã sản phẩm TAPHOA";
  search.className="ncc-ai-link-search";
  search.setAttribute("aria-label","Tìm mã sản phẩm");
  const results=node(editor,"div",undefined,"ncc-ai-link-results");
  const viLabel=node(editor,"label","Tên tiếng Việt (Admin xác nhận)","ncc-ai-link-vi-label");
  const vi=node(viLabel,"input");
  vi.type="text";vi.maxLength=180;vi.placeholder="Ví dụ: Sữa Fami canxi";
  vi.setAttribute("aria-label","Tên tiếng Việt của sản phẩm");
  const save=node(editor,"button","Xác nhận liên kết","ncc-ai-recheck");
  save.type="button";save.disabled=true;
  const status=node(editor,"small","");
  let selected=null;
  const productByCode=new Map(productCatalog.map(p=>[String(p.product_code),p]));
  const current=findProductLink(record,line);
  const suggestions=(Array.isArray(current?.candidates)?current.candidates:[])
    .map(p=>productByCode.get(String(p.product_code))).filter(Boolean);
  function choose(p){
   selected=p;
   search.value=p.product_code+" · "+p.product_name;
   vi.value=String(p.vietnamese_name||"");
   save.disabled=false;
   status.textContent="Đã chọn "+p.product_code+". Kiểm tra tên và quy cách trước khi lưu.";
  }
  function renderMatches(){
   results.replaceChildren();
   const query=normalizedSearch(search.value).trim();
   const matches=query?productCatalog.filter(p=>
    normalizedSearch(p.product_code+" "+p.product_name+" "+(p.vietnamese_name||"")).includes(query)
   ).slice(0,12):suggestions.slice(0,12);
   for(const item of matches){
    const option=node(results,"button",item.product_code+" · "+item.product_name+
      (item.vietnamese_name?" · "+item.vietnamese_name:""));
    option.type="button";option.className="ncc-ai-link-option";
    option.addEventListener("click",()=>choose(item));
   }
   if(!matches.length)node(results,"small",query?"Không tìm thấy mã SP phù hợp.":"Gõ tên hoặc mã sản phẩm để tìm.");
  }
  search.addEventListener("input",()=>{selected=null;save.disabled=true;renderMatches();});
  save.addEventListener("click",async()=>{
   if(!selected||owner!==accountSession())return;
   save.disabled=true;status.textContent="Đang lưu liên kết đã xác nhận…";
   try{
    const result=await api("link_product",{
     hash:record.hash,row_no:line.row_no,product_code:selected.product_code,
     vietnamese_name:vi.value.trim()
    });
    if(owner!==accountSession()||!editor.isConnected)return;
    record.product_links=result.record?.product_links||record.product_links;
    refresh();editor.remove();
    say("Đã liên kết mã SP "+selected.product_code+". Giá nhập chỉ để đối chiếu.");
   }catch(error){
    const message=String(error?.message||"");
    status.textContent=message==="product_alias_conflict"?
     "Tên này đã liên kết với mã SP khác. Cần rà soát, không tự ghi đè.":
     "Chưa lưu được liên kết. Danh mục hoặc kết nối chưa sẵn sàng.";
    save.disabled=false;
   }
  });
  renderMatches();
 }catch{
  feedback.textContent="Không tải được danh mục sản phẩm. Chưa lưu liên kết.";
 }
}
function appendTable(record,{duplicate=false,recheck=false}={}){
 const created=recheck?(record.rechecked_at||new Date().toISOString()):
  (record.created_at||new Date().toISOString());
 dateSeparator(created);
 const bubble=message("bot","NCC AI",created);
 if(duplicate)node(bubble,"p","Ảnh trùng — đã xử lý trước đó, không đọc AI lần nữa.","ncc-ai-duplicate");
 if(recheck)node(bubble,"strong","Kết quả đọc lại tổng và chiết khấu");
 const lines=Array.isArray(record.lines)?record.lines:[];
 const rowViews=[];
 const refreshLinks=()=>rowViews.forEach(fn=>fn());
 if(record.status==="not_invoice"){
  node(bubble,"p","Ảnh này không phải phiếu nhập hàng. Không lập bảng.","ncc-ai-explanation");
 }else if(!lines.length){
  node(bubble,"p","Chưa đọc được dòng hàng rõ ràng. Có thể gửi ảnh rõ hơn.","ncc-ai-explanation");
 }else{
  node(bubble,"strong","Đã trích xuất "+lines.length+" dòng hàng · Bản nháp");
  const wrap=node(bubble,"div",undefined,"ncc-ai-table-scroll");
  const table=node(wrap,"table",undefined,"ncc-ai-table");
  const tr=node(node(table,"thead"),"tr");
  ["STT","Mã SP","Tên hàng trên phiếu","Tên sản phẩm","Tên tiếng Việt","SL","ĐVT","Đơn giá gốc/1","Thành tiền gốc","CK/1","Sau CK/1","Tổng sau CK"].forEach(label=>node(tr,"th",label));
  const tbody=node(table,"tbody");
  for(const line of lines){
   const row=node(tbody,"tr");
   node(row,"td",line.row_no??"");
   const codeCell=node(row,"td");
   const codeButton=node(codeCell,"button",undefined,"ncc-ai-link-button");
   codeButton.type="button";
   node(row,"td",line.printed_name||"Chưa đọc rõ");
   const productCell=node(row,"td"),vietCell=node(row,"td");
   [line.quantity??"—",line.printed_unit||"—",money(line.unit_price_vnd),
    money(line.gross_line_vnd??line.line_total_vnd),
    money(line.discount_per_unit_vnd),money(line.net_unit_vnd),
    money(line.net_line_vnd)].forEach(value=>node(row,"td",value));
   const refreshRow=()=>{
    const link=findProductLink(record,line);
    const suggested=link?.status==="suggested"?(link?.candidates||[])[0]:null;
    const confirmed=link?.status==="linked";
    codeButton.textContent=confirmed?"✓ "+String(link.product_code):
     link?.status==="suggested"?"Gợi ý "+String(suggested?.product_code||link.product_code||""):
     record.product_mapping_ready===false?"Chưa sẵn sàng":"Chọn mã SP";
    codeButton.disabled=record.product_mapping_ready===false;
    productCell.textContent=link?.product_name||suggested?.product_name||"—";
    vietCell.textContent=link?.vietnamese_name||suggested?.vietnamese_name||"—";
    codeButton.setAttribute("aria-label","Liên kết "+String(line.printed_name||"")+" với mã sản phẩm");
   };
   codeButton.addEventListener("click",()=>void openProductLinkEditor(bubble,record,line,refreshLinks));
   rowViews.push(refreshRow);refreshRow();
  }
  const copy=node(bubble,"button","Sao chép bảng","ncc-ai-copy");
  copy.type="button";
  copy.addEventListener("click",async()=>{
   const clean=x=>String(x??"").replace(/[\r\n\t]/g," ").trim();
   const linesText=lines.map(line=>{
    const link=findProductLink(record,line)||{};
    return [line.row_no,line.printed_name,
    line.quantity,line.printed_unit,line.unit_price_vnd,line.gross_line_vnd,
    line.discount_per_unit_vnd,line.net_unit_vnd,line.net_line_vnd,
    link.product_code,link.product_name,link.vietnamese_name].map(clean).join("\t");
   });
   const summary=record.summary||{};
   const summaryRows=[
    ["Tổng hàng trên phiếu",summary.subtotal_printed_vnd],
    ["Cộng tiền các dòng",summary.gross_lines_vnd],
    ["Chiết khấu tổng",summary.discount_total_vnd],
    ["Phải trả tính",summary.payable_calculated_vnd],
    ["Phải trả trên phiếu",summary.payable_printed_vnd],
    ["Chênh lệch",summary.difference_vnd]
   ].map(([label,value])=>[label,clean(value)].join("\t"));
   try{
    await navigator.clipboard.writeText(
     ["STT\tTên hàng trên phiếu\tSL\tĐVT\tĐơn giá gốc/1\tThành tiền gốc\tCK/1\tSau CK/1\tTổng sau CK\tMã SP\tTên sản phẩm\tTên tiếng Việt",
      ...linesText,"",...summaryRows].join("\n")
    );say("Đã sao chép "+lines.length+" dòng hàng cùng thông tin tổng/chiết khấu.");
   }catch{say("Không sao chép được trên thiết bị này.");}
  });
 }
 const summary=record.summary;
 const summaryPanel=node(bubble,"section",undefined,"ncc-ai-summary");
 // Totals belong above a 17+ row table, not hidden after a long scroll.
 const tableAnchor=bubble.querySelector(".ncc-ai-table-scroll");
 if(tableAnchor)bubble.insertBefore(summaryPanel,tableAnchor);
 node(summaryPanel,"strong","Tổng tiền & chiết khấu của phiếu");
 function summaryRow(label,value,emph=false){
  const row=node(summaryPanel,"div",undefined,emph?"ncc-ai-total-row ncc-ai-total-strong":"ncc-ai-total-row");
  node(row,"span",label);
  node(row,"b",value==null?"Chưa đọc được":money(value)+" đ");
 }
 if(summary){
  summaryRow("Tiền hàng trên phiếu",summary.subtotal_printed_vnd);
  summaryRow("Cộng từ từng dòng",summary.gross_lines_vnd);
  summaryRow("Chiết khấu tổng",summary.discount_total_vnd);
  if(summary.discount_percent!==null)
   node(summaryPanel,"small","Tỷ lệ CK in trên phiếu: "+summary.discount_percent+"%");
  summaryRow("Phải trả tính từ bảng",summary.payable_calculated_vnd);
  summaryRow("Phải trả in trên phiếu",summary.payable_printed_vnd,true);
  if(summary.payable_printed_vnd===null&&summary.legacy_printed_total_vnd!==null)
   summaryRow("Tổng in (chưa rõ trước/sau CK)",summary.legacy_printed_total_vnd);
  const matching={
   verified:"Đã khớp tổng và chiết khấu",
   mismatch:"CHÊNH LỆCH — cần đối chiếu lại ảnh",
   review:"Có số liệu cần kiểm tra",
   insufficient:"CHƯA ĐỦ GIÁ — không thể chia CK về từng sản phẩm",
   calculated_not_verified:"Đã tính tạm, chưa có tổng thực trả để xác minh"
  };
  node(summaryPanel,"p",matching[summary.status]||"Chưa xác minh tổng","ncc-ai-summary-status");
  for(const warning of (Array.isArray(summary.warnings)?summary.warnings:[]).slice(0,6))
   node(summaryPanel,"small","• "+warning,"ncc-ai-summary-warning");
  if(summary.discount_total_vnd!==null&&summary.all_line_amounts_known)
   node(summaryPanel,"small","CK tổng phân bổ theo tỷ trọng tiền hàng; chia về từng đơn vị, làm tròn 2 chữ số. Tổng số tiền giảm vẫn chính xác từng đồng.");
 }else{
  node(summaryPanel,"p","Bản đọc cũ chưa có tổng, chiết khấu và phép đối chiếu. Hãy đọc lại từ ảnh gốc.","ncc-ai-summary-status");
 }
 if(record.hash&&supportsRecheck){
  const recheckButton=node(bubble,"button","Đọc lại tổng & chiết khấu","ncc-ai-recheck");
  recheckButton.type="button";
  recheckButton.addEventListener("click",async()=>{
   if(!isAdmin()||recheckButton.disabled)return;
   const owner=accountSession();if(!owner)return;
   recheckButton.disabled=true;
   say("Đang đọc lại toàn bộ ảnh và phần tổng/chiết khấu…");
   try{
    const data=await api("recheck",{hash:record.hash});
    if(accountSession()!==owner||!opened)return;
    if(!data.record)throw Error("missing_recheck_result");
    appendTable(data.record,{recheck:true});
    say("Đã đọc lại. Hãy đối chiếu tổng tiền và giá sau CK/1.");
   }catch{
    if(accountSession()===owner&&opened)say("Chưa đọc lại được tổng/chiết khấu. Không có giá nào bị thay đổi.");
   }finally{recheckButton.disabled=false;}
  });
 }
 node(bubble,"p","Bảng dùng để đối chiếu. Không tự ghi giá vốn, công nợ hoặc nhập kho.","ncc-ai-disclaimer");
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
async function open(options={}){
 if(!isAdmin())return;
 const owner=accountSession();if(!owner)return;
 if(session!==owner){purge();session=owner;}
 const host=options?.inlineHost?.isConnected?options.inlineHost:null;
 if(host){
  if(room.parentNode!==host)host.appendChild(room);
  embeddedHost=host;room.dataset.embedded="true";
  document.body.classList.remove("ncc-ai-room-open");
 }else{
  if(room.parentNode!==document.body)document.body.appendChild(room);
  embeddedHost=null;delete room.dataset.embedded;
  document.body.classList.add("ncc-ai-room-open");
 }
 room.hidden=false;opened=true;
 // Switching between two Work tabs never calls the AI again merely to redraw
 // the same Admin session history. Explicit new photos still call the server.
 if(host&&ready&&thread.children.length){sync();return;}
 ready=false;presence.textContent="Đang kết nối";sync();
 if(!thread.children.length)appendInfo("Gửi ảnh phiếu nhập vào đây. Mình sẽ đọc bảng hàng, báo ảnh trùng và lưu lịch sử cho Admin.");
 try{
  const health=await api("health");
  if(!opened||accountSession()!==owner)return;
  ready=health.ready===true;
  supportsRecheck=Array.isArray(health.features)&&health.features.includes("invoice_totals_v2");
  supportsProductLinks=Array.isArray(health.features)&&health.features.includes("canonical_product_links_v1");
  presence.textContent=ready?"Sẵn sàng":"Chưa có AI";
  if(!ready){say("Máy chủ AI chưa sẵn sàng.");sync();return;}
  say("Bấm dấu + chọn ảnh. Ảnh sẽ tự gửi và AI tự tạo bảng.");
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
 if(embeddedHost){
  embeddedHost=null;delete room.dataset.embedded;
  if(room.parentNode!==document.body)document.body.appendChild(room);
 }
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
 btn.addEventListener("click",()=>{if(!showWorkTab("supplier"))void open();});
 return btn;
}
// WORK-365: one real Work surface, two tabs and one Chat back path.
// Reuse the existing report and the existing private supplier room: no iframe,
// duplicate Chat contact, duplicate AI flow, polling, or financial write.
let workReport=null,workBankPanel=null,workSupplierPanel=null,workSection="bank";
function updateWorkTabControls(){
 const controls=workReport?.querySelectorAll("[data-bank-work-tab]")||[];
 for(const button of controls){
  const selected=button.dataset.bankWorkTab===workSection;
  button.setAttribute("aria-selected",String(selected));
  button.tabIndex=selected?0:-1;
 }
}
function resetWorkTabsIfInactive(){
 if(!workReport)return;
 const stage=document.getElementById("stageLayout");
 if(!workReport.hidden&&stage?.dataset.bankReportActive==="true"&&isAdmin())return;
 if(workSection==="supplier"){
  if(embeddedHost)close();
  workSection="bank";
  workReport.dataset.workSection="bank";
  workBankPanel.hidden=false;workSupplierPanel.hidden=true;
  updateWorkTabControls();
 }
}
function showWorkTab(next){
 const stage=document.getElementById("stageLayout");
 if(!workReport||workReport.hidden||!isAdmin()||stage?.dataset.bankReportActive!=="true")return false;
 const target=next==="supplier"?"supplier":"bank";
 if(target===workSection)return true;
 workSection=target;workReport.dataset.workSection=target;
 if(target==="supplier"){
  workBankPanel.hidden=true;
  workSupplierPanel.hidden=false;
  workReport.scrollTop=0;
  void open({inlineHost:workSupplierPanel});
 }else{
  if(embeddedHost)close();
  workSupplierPanel.hidden=true;
  workBankPanel.hidden=false;
  workReport.scrollTop=0;
 }
 updateWorkTabControls();
 return true;
}
function backToChats(){
 if(embeddedHost)close();
 const mobile=window.V21WorkCustomerSummary?.showMobileDirectory?.("work-back-to-chats");
 if(mobile)return;
 const nav=window.ChatAppShell?.NavigationCommand;
 nav?.clearActiveContact?.();
 nav?.openChat?.();
}
function mount(){
 const report=document.getElementById("bankReportDashboard");
 if(!report)return;
 if(!report.querySelector("[data-bank-work-nav]")){
  workReport=report;
  const bankPanel=document.createElement("div");
  bankPanel.className="bank-work-bank-panel";
  bankPanel.id="bankWorkBankPanel";
  bankPanel.setAttribute("role","tabpanel");
  bankPanel.setAttribute("aria-labelledby","bankWorkBankTab");
  while(report.firstChild)bankPanel.appendChild(report.firstChild);
  const nav=document.createElement("nav");
  nav.className="bank-work-navigation";
  nav.dataset.bankWorkNav="";
  nav.setAttribute("aria-label","Công việc");
  nav.innerHTML=[
   '<div class="bank-work-heading"><button type="button" class="bank-work-back" data-bank-work-back aria-label="Quay lại Trò chuyện">← Trò chuyện</button></div>',
   '<div class="bank-work-tabs" role="tablist" aria-label="Loại công việc">',
   '<button type="button" role="tab" id="bankWorkBankTab" data-bank-work-tab="bank" aria-controls="bankWorkBankPanel" aria-selected="true">Chuyển khoản</button>',
   '<button type="button" role="tab" id="bankWorkSupplierTab" data-bank-work-tab="supplier" aria-controls="bankWorkSupplierPanel" aria-selected="false" tabindex="-1">Nhập hàng</button>',
   '</div>'
  ].join("");
  const supplierPanel=document.createElement("div");
  supplierPanel.className="bank-work-supplier-panel";
  supplierPanel.id="bankWorkSupplierPanel";
  supplierPanel.setAttribute("role","tabpanel");
  supplierPanel.setAttribute("aria-labelledby","bankWorkSupplierTab");
  supplierPanel.hidden=true;
  report.append(nav,bankPanel,supplierPanel);
  report.dataset.workTabsReady="true";
  report.dataset.workSection="bank";
  workBankPanel=bankPanel;workSupplierPanel=supplierPanel;workSection="bank";
  nav.querySelector("[data-bank-work-back]")?.addEventListener("click",backToChats);
  for(const tab of nav.querySelectorAll("[data-bank-work-tab]")){
   tab.addEventListener("click",()=>showWorkTab(tab.dataset.bankWorkTab));
   tab.addEventListener("keydown",event=>{
    if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
    event.preventDefault();
    const target=tab.dataset.bankWorkTab==="bank"?"supplier":"bank";
    if(showWorkTab(target))nav.querySelector('[data-bank-work-tab="'+target+'"]')?.focus();
   });
  }
  document.addEventListener("v21-active-contact-change",resetWorkTabsIfInactive);
  document.addEventListener("v21-conversation-context",resetWorkTabsIfInactive);
  document.addEventListener("navigation-change",resetWorkTabsIfInactive);
 }
 // Retain existing authorized launchers for any legacy deep links, but the
 // Work surface displays supplier content directly via its tab above.
 const title=report.querySelector(".bank-report-title-row");
 if(title&&!title.querySelector("[data-ncc-room-shortcut]")){
  const btn=launchButton();btn.dataset.nccRoomShortcut="";
  title.appendChild(btn);
 }
 const slot=report.querySelector("[data-bank-report-ncc-slot]");
 if(slot&&!slot.querySelector("[data-ncc-room-launch]")){
  slot.replaceChildren();
  const btn=launchButton(true);btn.dataset.nccRoomLaunch="";
  slot.appendChild(btn);
 }
}
mount();
document.addEventListener("v21-auth-state",()=>{if(isAdmin())mount();else resetWorkTabsIfInactive();});
window.V21NccAiRoom=Object.freeze({open,close,mount,showWorkTab});
})();
