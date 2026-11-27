import assert from "node:assert/strict";
import jpeg from "npm:jpeg-js@0.4.4";
import {buildAccountCrop,safeJpegDimensions} from "../supabase/functions/v21-bank-bill-event/bill-account-crop.mjs";
const width=320,height=200,data=new Uint8Array(width*height*4).fill(255);
for(let y=90;y<105;y++)for(let x=75;x<240;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
const bytes=jpeg.encode({width,height,data},95).data;
assert.deepEqual(safeJpegDimensions(bytes),{width,height});
const out=await buildAccountCrop(bytes,"image/jpeg",{role:"recipient_account",box:[420,180,550,820]});
assert(out);assert.equal(out.scale,3);
const read=jpeg.decode(out.bytes,{useTArray:true});
assert(read.width>width/2);assert(read.height>20);
assert(read.data.some((v,i)=>i%4!==3&&v<40));
console.log("Real JPEG encode/decode and crop executed; no production OCR or finance.");
