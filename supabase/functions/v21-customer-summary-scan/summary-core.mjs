const clean=(value,max=12000)=>String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);

export const MASTER_PROMPT=`
Bạn là AI tổng hợp hàng hóa từ lịch sử CHAT đầy đủ của MỘT khách hàng.
Mục tiêu duy nhất: trả danh sách hàng mà khách thực sự muốn lấy/mua sau khi đã xét các câu thêm, bỏ, đổi, sửa và các lần đọc lại đơn.

NGUỒN VÀ VAI TRÒ:
- KHACH là nguồn quyết định hàng hóa.
- ADMIN_CONTEXT chỉ là ngữ cảnh nối câu. Admin có thể hỏi để làm rõ tên, số lượng, quy cách, màu, loại hoặc xác nhận mua.
- Không được tạo hàng từ lời Admin. Chỉ dùng Admin để nối với câu KHACH ngay trước/sau khi đó là một cặp hỏi-đáp trực tiếp.
- Chỉ dùng ADMIN_CONTEXT khi Admin thực sự HỎI trực tiếp phần còn thiếu và khách trả lời ngay sau đó. Admin tự ghi chú, tự nhắc lại, tự nhớ hàng, tự xác nhận một chiều hoặc nhắn tên hàng/số lượng mà không hỏi khách thì KHÔNG được dùng để tạo hay bổ sung dòng hàng.
- Ví dụ hợp lệ: KHACH "Có ensure rẻ k a" -> ADMIN_CONTEXT "Lấy mấy thùng?" -> KHACH "2 a" thì hiểu Ensure = 2 thùng.
- Ví dụ không hợp lệ: KHACH gửi đơn -> ADMIN_CONTEXT "Thọ 380g" hoặc "Tho giay 380g 1" để người bán tự ghi nhớ. Không lấy hai câu Admin này làm hàng của khách.
- Nếu đã chen sang chủ đề hoặc mặt hàng khác thì không được nối.

GIỮ NGUYÊN LỜI KHÁCH:
- Không sửa chính tả, không chuẩn hóa tên sản phẩm, không tự mở rộng viết tắt, không đổi tên theo kho.
- raw_evidence phải giữ nguyên phần gốc dùng để kết luận. Nếu có Admin làm ngữ cảnh, raw_evidence vẫn phải chứa rõ lời KHACH; có thể thêm admin_context riêng trong reasoning nội bộ nhưng không thay lời khách.
- Không tự thêm số lượng nếu nguồn không có số lượng. Mặc định quantity=null, ambiguous=true và giữ nguyên raw_evidence.
- Khi câu đã có số lượng rõ ở ĐẦU, không được lấy một số trần ở CUỐI làm quantity chỉ vì nó là số. Số cuối có thể là mã/quy cách/tên rút gọn và phải giữ trong name nếu không có dấu hiệu rõ đó là số lượng.
- Ví dụ bắt buộc: "1 sim 2" => name="sim 2", quantity=1; "1 nép 2" => name="nép 2", quantity=1; "1 nép 1" => name="nép 1", quantity=1; "1 mezan 5" => name="mezan 5", quantity=1.
- Giữ các mã/quy cách trong tên như "mì chính 454", "Knorr 400", "Knorr 900", "Danisa 681", "grenfam 110", "Mezan 5L".
- Nếu khách sửa một tên đã gõ nhầm bằng cụm như "đánh nhầm ...", giữ đầy đủ phần tên hàng TRƯỚC cụm sửa sai. Ví dụ "lấy 2 thùng bánh tipo gói đánh nhầm bánh koro" => name="bánh tipo gói", quantity=2; không được cắt mất chữ "gói".
- Các cụm hội thoại như "như mọi khi" có thể bỏ khỏi name nếu chúng chỉ là ngữ cảnh/thói quen và không phải mô tả hàng; raw_evidence vẫn phải giữ nguyên câu gốc.

ẢNH:
- Ảnh đơn in hoặc ảnh đơn viết tay là nguồn hàng hóa hợp lệ. Hãy tập trung đọc vùng đơn/bảng/danh sách hàng, không bị phân tán bởi giao diện xung quanh.
- Ảnh minh họa sản phẩm, ảnh chụp riêng một sản phẩm, banner hoặc hình không chứa đơn thì bỏ qua, không sinh dòng hàng.
- Nếu ảnh vừa có vùng đơn vừa có hình minh họa sản phẩm, ưu tiên vùng đơn.
- Lọc trùng giữa ảnh và văn bản, giữa nhiều ảnh, hoặc giữa hai lần khách gửi lại cùng một đơn. Không cộng đôi cùng một mặt hàng chỉ vì nó xuất hiện ở hai nguồn mô tả cùng một giao dịch.

LỊCH SỬ / SỬA ĐƠN:
- Đọc theo đúng thứ tự thời gian.
- "thêm" là cộng/bổ sung; "bỏ", "không lấy", "hủy" là loại/giảm theo ngữ cảnh.
- Nếu khách đọc lại gần như toàn bộ đơn ngay sau một bản trước và bản sau rõ/đầy đủ hơn, coi bản sau là bản cập nhật/thay thế cho phần trùng, không cộng chồng hai lần.
- Câu hỏi giá/tồn kho không phải hàng mua nếu chưa có xác nhận lấy/mua. Một câu trả lời ngắn sau câu hỏi làm rõ của Admin có thể hoàn tất ý mua như quy tắc ADMIN_CONTEXT ở trên.

OUTPUT:
Trả đúng MỘT JSON, không Markdown:
{
  "items":[
    {
      "name":"tên theo lời khách/ảnh, không tự chuẩn hóa",
      "quantity":2,
      "unit":"thùng",
      "source":"text | image | text+admin-context | image+text",
      "raw_evidence":"nguyên văn nguồn quan trọng nhất",
      "ambiguous":false,
      "inferred":false
    }
  ],
  "notes":["ghi chú ngắn cho các điểm cần đối chiếu nếu có"]
}
- quantity là số hoặc null. Không dùng 0 thay cho không biết.
- ambiguous=true nếu tên/SL/đơn vị thực sự chưa đủ chắc.
- inferred=true chỉ khi áp dụng một quy ước khách-specific được cung cấp bên dưới; vẫn phải giữ raw_evidence gốc.
`;

export function customerSpecificHints(account={}){
  const username=String(account?.username||'').trim().toLowerCase();
  const display=String(account?.display_name||'').trim().toLowerCase();
  if(username==='ngocle'||display==='e ngọc tt'||display==='e ngoc tt'){
    return `
QUY ƯỚC RIÊNG CHO KHÁCH E NGỌC tt / ngocle (đã được người bán xác nhận):
- Khi khách ghi "thùng <tên hàng>" mà không có số ở trước, hiểu là 1 thùng. Đây là ngoại lệ riêng khách này; đặt inferred=true và raw_evidence vẫn giữ nguyên.
- Khi cùng một loại hàng liệt kê nhiều màu trong cùng câu, mỗi màu là 1 thùng nếu câu đang dùng quy ước "thùng" ở trên.
- Ví dụ: "Thùng comfort xanh lá, xanh dương" => Comfort xanh lá: 1 thùng; Comfort xanh dương: 1 thùng. Mỗi màu là một dòng, inferred=true, cùng raw_evidence gốc.
`;
  }
  return '';
}

export function buildConversationHistory(rows=[]){
  return (Array.isArray(rows)?rows:[]).map((row,index)=>{
    const role=String(row?.sender_role||'').toLowerCase()==='customer'?'KHACH':'ADMIN_CONTEXT';
    const at=clean(row?.created_at,80)||'?';
    const body=clean(row?.body,12000);
    return `TIN ${index+1} [${at}] ${role}: ${body}`;
  }).join('\n');
}

function normalizedCompare(value){
  return clean(value,500).toLocaleLowerCase('vi-VN').replace(/\s+/g,' ');
}

function repairFromRawEvidence(item){
  const rawEvidence=clean(item?.rawEvidence,2000);
  let name=clean(item?.name,500);
  let quantity=item?.quantity??null;
  let ambiguous=Boolean(item?.ambiguous);
  if(!rawEvidence)return {...item,name,quantity,ambiguous};

  // Customer correction wording: keep the complete intended product phrase before "đánh nhầm ...".
  // Example: "lấy 2 thùng bánh tipo gói đánh nhầm bánh koro" -> 2 x "bánh tipo gói".
  const correction=rawEvidence.match(/^\s*(?:lấy|lay)\s+(\d+(?:[.,]\d+)?)\s+(?:(thùng|thung|t|bao|bịch|bich|gói|goi|chai|lon|hộp|hop|cây|cay)\s+)?(.+?)\s+(?:đánh\s+nhầm|danh\s+nham)\b/i);
  if(correction){
    const leading=Number(String(correction[1]).replace(',','.'));
    const intended=clean(correction[3],500);
    if(Number.isFinite(leading)&&leading>0&&intended){
      name=intended;
      quantity=leading;
      ambiguous=false;
      return {...item,name,quantity,ambiguous};
    }
  }

  // Structural guard for "SL + product name ending in a bare numeric code/variant".
  // Only repair when the model demonstrably stripped that final number and used it as quantity.
  // Delimiter-style rows such as "555 dẹt | 5" are intentionally excluded.
  if(!/[|:*]/.test(rawEvidence)){
    const edge=rawEvidence.match(/^\s*(\d+(?:[.,]\d+)?)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/);
    if(edge){
      const leading=Number(String(edge[1]).replace(',','.'));
      const middle=clean(edge[2],500);
      const trailingText=clean(edge[3],80);
      const trailing=Number(trailingText.replace(',','.'));
      const modelNameMatchesMiddle=normalizedCompare(name)===normalizedCompare(middle);
      const modelUsedTrailingAsQuantity=Number.isFinite(trailing)&&quantity!==null&&Number(quantity)===trailing;
      if(Number.isFinite(leading)&&leading>0&&middle&&modelNameMatchesMiddle&&modelUsedTrailingAsQuantity){
        name=`${middle} ${trailingText}`;
        quantity=leading;
        ambiguous=false;
      }
    }
  }

  return {...item,name,quantity,ambiguous};
}

export function normalizeSummaryPayload(payload={}){
  const items=[];
  for(const raw of Array.isArray(payload?.items)?payload.items:[]){
    const name=clean(raw?.name,500);
    const rawEvidence=clean(raw?.raw_evidence??raw?.rawEvidence,2000);
    if(!name&&!rawEvidence)continue;
    let quantity=null;
    if(raw?.quantity!==null&&raw?.quantity!==undefined&&raw?.quantity!==''){
      const numeric=Number(raw.quantity);
      if(Number.isFinite(numeric)&&numeric>0)quantity=numeric;
    }
    const repaired=repairFromRawEvidence({
      name:name||rawEvidence,
      quantity,
      unit:clean(raw?.unit,80)||null,
      source:clean(raw?.source,80)||'text',
      rawEvidence,
      ambiguous:Boolean(raw?.ambiguous)||quantity===null,
      inferred:Boolean(raw?.inferred),
    });
    items.push(repaired);
  }
  const totalsMap=new Map();
  for(const item of items){
    if(item.quantity===null)continue;
    const key=item.unit??'__NULL__';
    totalsMap.set(key,(totalsMap.get(key)||0)+item.quantity);
  }
  const totals=Array.from(totalsMap.entries()).map(([key,quantity])=>({unit:key==='__NULL__'?null:key,quantity}));
  return {
    items,
    notes:(Array.isArray(payload?.notes)?payload.notes:[]).map(note=>clean(note,1000)).filter(Boolean),
    totalLines:items.length,
    totals,
  };
}
