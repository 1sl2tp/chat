import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeBillImageMime,detectBillImageMime,validateBillImageMime} from "../supabase/functions/v21-bank-bill-event/bill-image-identity.mjs";
const jpeg=new Uint8Array([255,216,255,224]),png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]),webp=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,76,0,0,0,0]);
assert.equal(normalizeBillImageMime(" IMAGE/JPG "),"image/jpeg");
for(const [bytes,mime] of [[jpeg,"image/jpeg"],[png,"image/png"],[webp,"image/webp"]]){
 assert.equal(detectBillImageMime(bytes),mime);
 assert.equal(validateBillImageMime(bytes,mime),mime);
 for(const wrong of ["image/jpeg","image/png","image/webp"].filter(x=>x!==mime))assert.equal(validateBillImageMime(bytes,wrong),null);
 for(const bad of [null,"","application/octet-stream","image/gif","image/svg+xml","image/heic"])assert.equal(validateBillImageMime(bytes,bad),null);
 assert.equal(validateBillImageMime(bytes.subarray(0,2),mime),null);
}
assert.equal(validateBillImageMime(jpeg,"image/jpg"),"image/jpeg");
assert.equal(validateBillImageMime(new Uint8Array([1,2,3,4]),"image/jpeg"),null);
const main=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert(main.includes("const imageMime=validateBillImageMime(bytes,media.mime_type)"));
assert(main.includes('if(!imageMime)throw new Error("invalid_image_mime")'));
assert.equal((main.match(/mimeType:imageMime/g)||[]).length,2);
assert(main.includes("mime:imageMime"));
assert(!main.includes('media.mime_type||"image/jpeg"'));
console.log("H2 MIME canonical alias, byte header, mismatch and all main OCR paths passed (synthetic signatures, not decoder tests)");
