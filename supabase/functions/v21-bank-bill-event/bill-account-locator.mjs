import {normalizeBillImageMime} from "./bill-image-identity.mjs";
// Bounded location-only request. Coordinates are not OCR or financial evidence.
import {normalizeAccountRegion,safeJpegDimensions,inspectJpeg,regionRect,accountImageParts} from "./bill-account-crop.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
export const ACCOUNT_REGION_RESPONSE_SCHEMA={type:"object",properties:{role:{type:"string",enum:["recipient_account","unknown"]},box:{type:"array",items:{type:"integer",minimum:0,maximum:1000},maxItems:4}},required:["role","box"]};
export function accountRegionRejectReason(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return "region_response_invalid";
 if(value.role==="unknown")return "region_role_unknown";
 if(value.role!=="recipient_account")return "region_role_invalid";
 if(!Array.isArray(value.box)||value.box.length!==4)return "region_box_shape";
 if(!value.box.every(n=>Number.isInteger(n)&&n>=0&&n<=1000))return "region_coordinate_invalid";
 if(!normalizeAccountRegion(value))return "region_geometry_invalid";
 return null;
}
export const ACCOUNT_REGION_PROMPT=[
 "Chỉ định vị vùng tài khoản NGƯỜI NHẬN của một giao dịch thành công trên ảnh gốc.",
 "Tìm nhãn và dòng số thuộc người nhận; không chọn TK gửi, mã tham chiếu, số tiền, nội dung hay thông báo ngoài biên lai.",
 "Dùng hệ tọa độ chuẩn hóa 0..1000 của toàn ảnh gốc: y tăng từ trên xuống, x tăng từ trái sang phải. box theo thứ tự [ymin,xmin,ymax,xmax], không phải pixel hoặc phần trăm.",
 "Bao trọn dòng số và nhãn người nhận liên quan; vùng cao 8..220 và rộng 70..950 đơn vị chuẩn hóa. Không xoay ảnh, không lấy cả biên lai. Không tự nới vùng nếu không xác định đúng vai trò.",
 "Chỉ trả đối tượng JSON theo schema. Nếu xác định đúng người nhận: role=recipient_account và box gồm đúng 4 số nguyên. Nếu không rõ: role=unknown, box=[]; không tạo tọa độ giả. Không đọc, đoán hoặc trả chữ số tài khoản."
].join("\n");
export function canLocateAccountRegion(bytes,mime,stored){
 const dim=safeJpegDimensions(bytes);
 return normalizeBillImageMime(mime)==="image/jpeg"&&!!dim&&!regionRect(stored,dim.width,dim.height);
}
export async function locateAccountRegion({bytes,mime,stored,encode,key,model="gemini-3.5-flash-lite",fetchFn=fetch,signal,trace=()=>{}}){
 const fail=reason=>{trace({stage:"locator",reason});return null;};
 if(signal?.aborted)return fail("aborted");
 if(normalizeBillImageMime(mime)!=="image/jpeg")return fail("unsupported_mime");
 const info=inspectJpeg(bytes),dim=safeJpegDimensions(bytes);
 if(!dim)return fail(info.reason);
 const known=normalizeAccountRegion(stored);
 if(known&&regionRect(known,dim.width,dim.height)){trace({stage:"locator",reason:"stored_region"});return known;}
 // A stale or invalid stored box may be re-located under the same budget.
 // Locator has its own deadline, while the parent owns the combined budget.
 const bounded=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,bounded]):bounded;
 try{
  const v=await requestBillGemini({key,model,maxRequests:1,fetchFn,signal:combined,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_REGION_PROMPT},{inlineData:{mimeType:"image/jpeg",data:encode(bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseJsonSchema:ACCOUNT_REGION_RESPONSE_SCHEMA,maxOutputTokens:1024}}});
  const value=await parseBillGeminiResponse(v.response,{signal:combined});
  const reason=accountRegionRejectReason(value);
  if(reason)return fail(reason);
  const region=normalizeAccountRegion(value);
  if(!regionRect(region,dim.width,dim.height))return fail("region_bounds");
  trace({stage:"locator",reason:"located"});return region;
 }catch(error){const m=String(error?.message||"");return fail(combined.aborted?"timeout":m==="gemini_invalid_json"?"invalid_json":/^gemini_http_\d{3}$/.test(m)?m:"request_failed");}
}
export async function prepareLocatedAccountParts(args){
 const dim=safeJpegDimensions(args.bytes);
 let stored=args.stored,cacheHit=false;
 if(dim&&!regionRect(stored,dim.width,dim.height)&&args.cache&&!args.signal?.aborted){
  const cached=normalizeAccountRegion(await args.cache.get());
  if(regionRect(cached,dim.width,dim.height)){stored=cached;cacheHit=true;args.trace?.({stage:"cache",reason:"hit"});}
  else args.trace?.({stage:"cache",reason:"miss"});
 }
 const region=await locateAccountRegion({...args,stored});
 const parts=await accountImageParts({...args,region});
 if(parts.length===3&&region)args.onCropRegion?.(region,cacheHit);
 else if(cacheHit&&!args.signal?.aborted)await args.cache.remove();
 return parts;
}
