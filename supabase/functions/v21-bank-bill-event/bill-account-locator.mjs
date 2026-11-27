// Bounded location-only request. Coordinates are not OCR or financial evidence.
import {normalizeAccountRegion,safeJpegDimensions,inspectJpeg,regionRect,accountImageParts} from "./bill-account-crop.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
export const ACCOUNT_REGION_PROMPT=[
 "Chỉ định vị vùng tài khoản NGƯỜI NHẬN của một giao dịch thành công trên ảnh gốc.",
 "Tìm nhãn và dòng số thuộc người nhận; không chọn TK gửi, mã tham chiếu, số tiền, nội dung hay thông báo ngoài biên lai.",
 "Trả tọa độ nguyên [ymin,xmin,ymax,xmax] từ 0 đến 1000 trên toàn ảnh gốc, bao trọn nhãn và dãy số từ đầu đến cuối. Không xoay ảnh.",
 "Chỉ trả JSON {role:\"recipient_account\" hoặc \"unknown\",box:[ymin,xmin,ymax,xmax] hoặc null}. Không đọc, đoán hoặc trả chữ số tài khoản. Không rõ thì role=unknown,box=null."
].join("\n");
export function canLocateAccountRegion(bytes,mime,stored){
 const dim=safeJpegDimensions(bytes);
 return ["image/jpeg","image/jpg"].includes(mime)&&!!dim&&!regionRect(stored,dim.width,dim.height);
}
export async function locateAccountRegion({bytes,mime,stored,encode,key,model="gemini-3.5-flash-lite",fetchFn=fetch,signal,trace=()=>{}}){
 const fail=reason=>{trace({stage:"locator",reason});return null;};
 if(signal?.aborted)return fail("aborted");
 if(!["image/jpeg","image/jpg"].includes(mime))return fail("unsupported_mime");
 const info=inspectJpeg(bytes),dim=safeJpegDimensions(bytes);
 if(!dim)return fail(info.reason);
 const known=normalizeAccountRegion(stored);
 if(known&&regionRect(known,dim.width,dim.height)){trace({stage:"locator",reason:"stored_region"});return known;}
 // A stale or invalid stored box may be re-located under the same budget.
 // Locator has its own deadline, while the parent owns the combined budget.
 const bounded=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,bounded]):bounded;
 try{
  const v=await requestBillGemini({key,model,maxRequests:1,fetchFn,signal:combined,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_REGION_PROMPT},{inlineData:{mimeType:"image/jpeg",data:encode(bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:1024}}});
  const region=normalizeAccountRegion(await parseBillGeminiResponse(v.response,{signal:combined}));
  if(!region)return fail("region_missing_or_invalid");
  if(!regionRect(region,dim.width,dim.height))return fail("region_bounds");
  trace({stage:"locator",reason:"located"});return region;
 }catch(error){const m=String(error?.message||"");return fail(combined.aborted?"timeout":m==="gemini_invalid_json"?"invalid_json":/^gemini_http_\d{3}$/.test(m)?m:"request_failed");}
}
export async function prepareLocatedAccountParts(args){
 const region=await locateAccountRegion(args);
 return accountImageParts({...args,region});
}
