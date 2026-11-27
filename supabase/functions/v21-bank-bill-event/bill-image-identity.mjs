// Canonical original-image MIME. Header sniff is a necessary check, not full decode.
// No transcode, rotation, byte replacement or widening of financial eligibility.
export function normalizeBillImageMime(value){
 if(typeof value!=="string")return null;
 const mime=value.trim().toLowerCase();
 if(mime==="image/jpg")return "image/jpeg";
 return ["image/jpeg","image/png","image/webp"].includes(mime)?mime:null;
}
export function detectBillImageMime(bytes){
 if(!(bytes instanceof Uint8Array))return null;
 const matches=(offset,values)=>values.every((v,i)=>bytes[offset+i]===v);
 if(bytes.length>=4&&matches(0,[255,216,255])&&bytes[3]!==0&&bytes[3]!==255)return "image/jpeg";
 if(bytes.length>=24&&matches(0,[137,80,78,71,13,10,26,10])&&matches(12,[73,72,68,82]))return "image/png";
 if(bytes.length>=20&&matches(0,[82,73,70,70])&&matches(8,[87,69,66,80])&&(matches(12,[86,80,56,32])||matches(12,[86,80,56,76])||matches(12,[86,80,56,88])))return "image/webp";
 return null;
}
export function validateBillImageMime(bytes,declared){
 const mime=normalizeBillImageMime(declared);
 return mime&&detectBillImageMime(bytes)===mime?mime:null;
}
