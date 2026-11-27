// Bounded location-only request. Coordinates are not OCR or financial evidence.
import {normalizeAccountRegion,safeJpegDimensions,regionRect,accountImageParts} from "./bill-account-crop.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
export const ACCOUNT_REGION_PROMPT=[
 "Chỉ định vị vùng tài khoản NGƯỜI NHẬN của một giao dịch thành công trên ảnh gốc.",
 "Tìm nhãn và dòng số thuộc người nhận; không chọn TK gửi, mã tham chiếu, số tiền, nội dung hay thông báo ngoài biên lai.",
 "Trả tọa độ nguyên [ymin,xmin,ymax,xmax] từ 0 đến 1000 trên toàn ảnh gốc, bao trọn nhãn và dãy số từ đầu đến cuối. Không xoay ảnh.",
 "Chỉ trả JSON {role:\"recipient_account\" hoặc \"unknown\",box:[ymin,xmin,ymax,xmax] hoặc null}. Không đọc, đoán hoặc trả chữ số tài khoản. Không rõ thì role=unknown,box=null."
].join("\n");
export function canLocateAccountRegion(bytes,mime,stored){
 return !normalizeAccountRegion(stored)&&["image/jpeg","image/jpg"].includes(mime)&&!!safeJpegDimensions(bytes);
}
export async function locateAccountRegion({bytes,mime,stored,encode,key,model="gemini-3.5-flash-lite",fetchFn=fetch,signal}){
 const dim=safeJpegDimensions(bytes);
 if(!dim||!["image/jpeg","image/jpg"].includes(mime)||signal?.aborted)return null;
 const known=normalizeAccountRegion(stored);
 if(known&&regionRect(known,dim.width,dim.height))return known;
 if(known)return null;
 // Locator has its own deadline, while the parent owns the combined budget.
 const bounded=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,bounded]):bounded;
 try{
  const v=await requestBillGemini({key,model,maxRequests:1,fetchFn,signal:combined,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_REGION_PROMPT},{inlineData:{mimeType:"image/jpeg",data:encode(bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:256}}});
  const region=normalizeAccountRegion(await parseBillGeminiResponse(v.response,{signal:combined}));
  return region&&regionRect(region,dim.width,dim.height)?region:null;
 }catch{return null;}
}
export async function prepareLocatedAccountParts(args){
 const region=await locateAccountRegion(args);
 return accountImageParts({...args,region});
}
