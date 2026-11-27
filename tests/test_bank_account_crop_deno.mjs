import assert from "node:assert/strict";
import jpeg from "npm:jpeg-js@0.4.4";
import {buildAccountCrop,safeJpegDimensions,inspectJpeg,probeJpegCodec} from "../supabase/functions/v21-bank-bill-event/bill-account-crop.mjs";
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

// Inject real EXIF APP1 orientation into a valid JPEG without changing pixels.
function withOrientation(original,orientation){
 const app=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
 const result=new Uint8Array(original.length+app.length);
 result.set(original.slice(0,2));result.set(app,2);result.set(original.slice(2),2+app.length);
 return result;
}
const upright=withOrientation(bytes,1),rotated=withOrientation(bytes,6);
assert.equal(inspectJpeg(upright).reason,"eligible");
assert.equal(inspectJpeg(upright).exif,true);
assert.equal(inspectJpeg(rotated).reason,"exif_rotation");
assert.equal(await probeJpegCodec(upright),"decoded");
assert(await buildAccountCrop(upright,"image/jpeg",{role:"recipient_account",box:[420,180,550,820]}));
assert.equal(await buildAccountCrop(rotated,"image/jpeg",{role:"recipient_account",box:[420,180,550,820]}),null);
console.log("Upright EXIF JPEG real decode and crop passed; rotated EXIF is rejected explicitly.");
