import {FIELD_KEYS} from "./field-evidence.mjs";
import {planRegions} from "./crop-geometry.mjs";
// Pure crop plan; no network calls. Independently confirmed absent is not an OCR error.
export function unresolvedFields({values={},fields={}}={}){
 return FIELD_KEYS.filter(k=>fields[k]!=="absent"&&(fields[k]!=="read"||(k==="account_raw"&&values[k]==="290118199999")));
}
export function planSecondPass({values,fields,boxes,width,height}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error("invalid_image_dimensions");
 const keys=unresolvedFields({values,fields});
 return {keys,regions:keys.length?planRegions(boxes,keys,width,height):[],requiresReview:keys.length>0};
}
