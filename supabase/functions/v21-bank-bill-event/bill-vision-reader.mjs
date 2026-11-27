// Canonical inbound reader; regional guide adapted from 0v @ 99ca8ea7.
// Keep the existing ten-field evidence schema and independent collection gates.
export const BILL_READER_VERSION="regional-bill-v2";
export const REGION_GUIDE=[
 "Chỉ đọc một giao dịch trên màn hình biên lai chính, xoay theo chiều chữ. Nhận diện ngân hàng gửi từ logo/tiêu đề; bỏ qua nền, đồng hồ, quảng cáo, số dư và phí.",
 "VietinBank: số tiền lớn, ngày giờ nhỏ ngay dưới số tiền, mã giao dịch riêng; dưới mũi tên là tên và STK nhận, rồi ngân hàng nhận. Ô Nội dung ở cột phải: lấy đủ mọi dòng kể cả tên ở dòng đầu và lời nhắn ở dòng sau.",
 "Vietcombank: STK nhận trên tên người nhận, ngân hàng nhận dưới tên; lấy toàn bộ nội dung đến trước phí/hình thức/mã giao dịch. Techcombank: bỏ thông báo nổi, đọc khung Chuyển thành công, Tới + tên, STK nhận, Lời nhắn, Ngày thực hiện; Tới là nhãn.",
 "BIDV nhật ký: TK thanh toán là nguồn, không lấy tên/STK nhận từ memo SMB-TkThe. MB biến động: GD là giao dịch, SD bỏ qua, DEN nhận, ND nội dung. VPBank, MB, SHB, MSB, Co-opBank, MoMo và bố cục khác: xác định nhãn thật, không áp vị trí cứng.",
 "BIDV biên lai Chuyển thành công: trong khối Đến, đọc nguyên dòng Tài khoản ngay dưới tên người nhận; kết thúc trước dòng Tại/ngân hàng. Không lấy Số tham chiếu ở cuối bill làm STK.",
 "Đọc STK nhận từng chữ số từ hai phía. Với dãy số lặp sát nhau, xác định ký tự đầu/cuối của vùng, đếm theo vị trí nhìn thấy, kiểm tra tổng độ dài trước khi chép nguyên chuỗi; không rút gọn hoặc tự bù số. Nếu nét chữ mờ không đủ bằng chứng thì không đoán. Không lấy số cấu hình làm bằng chứng. Ngày giờ phải thuộc đúng giao dịch.",
 "Nếu xác định được đúng vùng số tài khoản nhận và nhãn của nó, trả thêm recipient_account_region={role:\"recipient_account\",box:[ymin,xmin,ymax,xmax]} với tọa độ nguyên 0..1000 trên toàn ảnh gốc CHƯA xoay/cắt. Khung bao toàn bộ dòng số và nhãn, kể cả ký tự đầu/cuối. Nếu không xác định được vùng hoặc hướng ảnh thì trả null. Không suy ra số từ tọa độ.",
 "Trong cùng lần đọc, xác định trọn ô Nội dung/Nội dung CK/Lời nhắn, đọc từng dòng trên xuống. Trả thêm memo_lines là mảng từng dòng nguyên văn trong chính ô nội dung, hoặc null nếu không đủ rõ. transfer_content là toàn bộ dòng nối bằng khoảng trắng. Không lấy tên người gửi ở ô riêng, tên khách Chat hoặc tự thêm lời nhắn. Dừng trước nhãn khác.",
 "Giữ đúng khóa, enum, vai trò tiền, ngày giờ nguyên văn, mã tham chiếu và mã tra soát của JSON hiện hành. Không suy đoán trường thiếu, không ghi thu."
].join("\n");
export function buildBillVisionPrompt(base,tenFields,executionDateGuide=""){
 return [base,tenFields,REGION_GUIDE,executionDateGuide].filter(Boolean).join("\n\n");
}
const flat=s=>typeof s==="string"?s.trim().replace(/\s+/gu," "):"";
export function normalizeVisionMemo(data){
 if(!data||typeof data!=="object"||Array.isArray(data))return data;
 const raw=typeof data.transfer_content==="string"?data.transfer_content:null;
 const lines=data.memo_lines;
 const valid=Array.isArray(lines)&&lines.length>0&&lines.length<=16&&lines.every(v=>typeof v==="string"&&v.trim()&&v.length<=220&&!/[\r\n]/u.test(v));
 const joined=valid?lines.map(flat).join(" "):"",first=flat(raw);
 const agrees=valid&&(!first||lines.some((_,i)=>lines.slice(i).some((__,j)=>lines.slice(i,i+j+1).map(flat).join(" ")===first)));
 const complete=agrees&&joined.length<=220?joined:null;
 return {...data,transfer_content:complete??(first.length<=220?first||null:null),
  memo_lines:valid&&joined.length<=220?lines.slice():null,
  memo_raw:raw&&raw.length<=1000?raw:null,
  memo_line_state:complete?"complete_lines":valid?"line_disagreement":"literal_only"};
}
