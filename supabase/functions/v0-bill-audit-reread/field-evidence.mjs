// Audit only: never authorizes collection. Explicit evidence for each field.
export const FIELD_KEYS=["amount_vnd","date_raw","clock","account_raw","recipient","memo","reference","trace","sending_bank","receiving_bank"];
export const FIELD_EVIDENCE_PROMPT=[
"RÀ SOÁT 10 TRƯỜNG TRÊN ẢNH GỐC. Phân biệt rõ có giá trị nhìn thấy, chữ hiện hữu nhưng không đọc được, thực sự không xuất hiện, và chưa xác định.",
"Trả thêm field_evidence là object với đúng 10 khóa amount_vnd,date_raw,clock,account_raw,recipient,memo,reference,trace,sending_bank,receiving_bank; mỗi giá trị là read, unreadable, absent, hoặc unknown.",
"read: chép đúng giá trị vào trường OCR tương ứng. unreadable: thấy vùng chữ nhưng mờ/che/cắt, không đoán. absent: đã kiểm tra cả ảnh, xác định trường không xuất hiện; không dùng absent nếu ảnh bị cắt hoặc mờ. unknown: chưa xác định được có hay không.",
"Nhìn lại dòng chữ nhỏ ngay dưới số tiền và cột giá trị bên phải; ngày và giờ là hai trường riêng. Nếu ngày giờ hoặc nội dung xuống nhiều dòng, chép hết cùng giao dịch, không lấy đồng hồ điện thoại.",
"STK người nhận: đếm từng ký tự từ trái sang phải và phải sang trái, giữ cả các chữ số 9 lặp lại; không thêm số theo mẫu. Nội dung chuyển khoản nối các dòng bằng một khoảng trắng, không nhầm với mã giao dịch. Phân biệt logo ngân hàng gửi với ngân hàng nhận.",
"Số tiền âm bên gửi là số tiền chuyển đi, không phải số dư hoặc giao dịch thất bại. Mã tra soát riêng chỉ có khi thực sự in trên ảnh. Không bịa giá trị thiếu.",
"Đây là tác vụ đọc lại ảnh lịch sử độc lập, không ghi thu, không dùng ngày hôm nay làm ngày giao dịch."
].join("\n");
export function evidenceStatuses(values,first,second){
 const out={};
 for(const key of FIELD_KEYS){
  const v=values[key],present=v!==null&&v!==undefined&&String(v).trim()!=="";
  const x=first?.[key],y=second?.[key];
  if(present){out[key]="read";continue}
  if(x==="unreadable"||y==="unreadable"){out[key]="unreadable";continue}
  if(x==="absent"&&y==="absent"){out[key]="absent";continue}
  out[key]="unknown";
 }
 return out;
}
export function mergeVerifiedValues(first,second){
 // The caller supplies normalized values only; conflicting populated fields
 // prevent borrowing any value from a potentially different transaction.
 const keys=["amount_vnd","transfer_date_vn","clock","account_raw","recipient","reference"];
 const norm=x=>String(x??"").trim().toUpperCase().replace(/\s+/g," ");
 if(!first||!second)return {values:first,conflict:false};
 const conflict=keys.some(k=>first[k]!=null&&second[k]!=null&&norm(first[k])!==norm(second[k]));
 const sameAmount=first.amount_vnd!=null&&first.amount_vnd===second.amount_vnd;
 const sameAnchor=["account_raw","reference","clock"].some(k=>first[k]!=null&&second[k]!=null&&norm(first[k])===norm(second[k]));
 if(conflict||!sameAmount||!sameAnchor)return {values:first,conflict};
 const out={...first};
 for(const k of [...FIELD_KEYS,"transfer_date_vn"])if((out[k]===null||out[k]===undefined||out[k]==="")&&second[k]!=null&&second[k]!=="")out[k]=second[k];
 return {values:out,conflict:false};
}
