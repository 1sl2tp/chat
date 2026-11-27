// Original image crop for display-only account reread. Never infer missing digits.
// BBox uses [ymin,xmin,ymax,xmax] on the original encoded image (0..1000).
export function normalizeAccountRegion(region){
 if(region?.role!=="recipient_account"||!Array.isArray(region.box)||region.box.length!==4||!region.box.every(x=>Number.isInteger(x)&&x>=0&&x<=1000))return null;
 const [y0,x0,y1,x1]=region.box;
 if(y1-y0<8||y1-y0>220||x1-x0<70||x1-x0>950)return null;
 return {role:"recipient_account",box:[y0,x0,y1,x1]};
}
export function regionRect(region,width,height){
 const r=normalizeAccountRegion(region);
 if(!r||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>3_000_000)return null;
 const [y0,x0,y1,x1]=r.box;
 const x=Math.max(0,Math.floor((x0-30)*width/1000)),y=Math.max(0,Math.floor((y0-25)*height/1000));
 const right=Math.min(width,Math.ceil((x1+30)*width/1000)),bottom=Math.min(height,Math.ceil((y1+25)*height/1000));
 const w=right-x,h=bottom-y;
 if(w<40||h<12||w*h>700_000)return null;
 return {x,y,w,h};
}
// Read EXIF orientation, not mere EXIF presence. Only upright/absent is
// accepted: coordinates on an auto-rotated raster are otherwise ambiguous.
export function exifOrientation(bytes,start,end){
 if(end-start<14)return null;
 const base=start+6;
 const le=bytes[base]===73&&bytes[base+1]===73,be=bytes[base]===77&&bytes[base+1]===77;
 if(!le&&!be)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16=i=>view.getUint16(i,le),u32=i=>view.getUint32(i,le);
 if(u16(base+2)!==42)return null;
 const ifd=base+u32(base+4);
 if(ifd<base+8||ifd+2>end)return null;
 const count=u16(ifd);if(count>512||ifd+2+count*12+4>end)return null;
 let orientation=1,seen=false;
 for(let n=0;n<count;n++){
  const i=ifd+2+n*12;
  if(u16(i)!==274)continue;
  if(seen||u16(i+2)!==3||u32(i+4)!==1)return null;
  orientation=u16(i+8);seen=true;
  if(orientation<1||orientation>8)return null;
 }
 return orientation;
}
export function inspectJpeg(bytes){
 const info={reason:"invalid_jpeg",width:null,height:null,orientation:1,exif:false,bytes:bytes instanceof Uint8Array?bytes.length:0};
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==255||bytes[1]!==216)return info;
 if(bytes.length>4_000_000)return {...info,reason:"byte_limit"};
 let i=2,dimensions=null,orientation=1,exif=false;
 while(i<bytes.length){
  if(bytes[i++]!==255)return info;
  while(i<bytes.length&&bytes[i]===255)i++;
  const marker=bytes[i++];
  if(marker===218){
   if(!dimensions)return info;
   const reason=orientation===null?"exif_invalid":orientation!==1?"exif_rotation":dimensions.width*dimensions.height>3_000_000?"pixel_limit":"eligible";
   return {...info,...dimensions,orientation,exif,reason};
  }
  if(marker===217||i+2>bytes.length)return info;
  const length=bytes[i]*256+bytes[i+1];
  if(length<2||i+length>bytes.length)return info;
  if(marker===225&&length>=8&&bytes[i+2]===69&&bytes[i+3]===120&&bytes[i+4]===105&&bytes[i+5]===102&&bytes[i+6]===0&&bytes[i+7]===0){
   orientation=exif?null:exifOrientation(bytes,i+2,i+length);exif=true;
  }
  if([192,193,194].includes(marker)){
   if(length<8||dimensions)return info;
   const height=bytes[i+3]*256+bytes[i+4],width=bytes[i+5]*256+bytes[i+6];
   if(!width||!height)return info;
   dimensions={width,height};
  }
  i+=length;
 }
 return info;
}
export function safeJpegDimensions(bytes){
 const info=inspectJpeg(bytes);
 return info.reason==="eligible"?{width:info.width,height:info.height}:null;
}
// Integer nearest-neighbour expansion keeps original pixels, no AI enhancement.
export function cropRgba(image,rect){
 const {width,height,data}=image||{}, {x,y,w,h}=rect||{};
 if(![width,height,x,y,w,h].every(Number.isInteger)||width<1||height<1||width*height>3_000_000||x<0||y<0||w<1||h<1||x+w>width||y+h>height||w*h>700_000||!(data instanceof Uint8Array)||data.length!==width*height*4)return null;
 const scale=Math.min(3,Math.max(1,Math.floor(Math.sqrt(1_500_000/(w*h)))),Math.max(1,Math.floor(1800/Math.max(w,h))));
 const outWidth=w*scale,outHeight=h*scale,out=new Uint8Array(outWidth*outHeight*4);
 for(let row=0;row<outHeight;row++)for(let col=0;col<outWidth;col++){
  const s=((y+Math.floor(row/scale))*width+x+Math.floor(col/scale))*4,d=(row*outWidth+col)*4;
  out[d]=data[s];out[d+1]=data[s+1];out[d+2]=data[s+2];out[d+3]=data[s+3];
 }
 return {width:outWidth,height:outHeight,data:out,scale};
}
async function jpegCodec(){
 const mod=await import("npm:jpeg-js@0.4.4");
 return mod.default??mod;
}
export async function probeJpegCodec(bytes,{loadCodec=jpegCodec,signal}={}){
 const info=inspectJpeg(bytes);if(info.reason!=="eligible")return info.reason;
 if(signal?.aborted)return "aborted";
 let codec,image;
 try{codec=await loadCodec();}catch{return "codec_import";}
 if(signal?.aborted)return "aborted";
 try{image=codec.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:3,maxMemoryUsageInMB:48});}catch{return "codec_decode";}
 return image.width===info.width&&image.height===info.height?"decoded":"codec_dimensions";
}
export async function buildAccountCrop(bytes,mime,region,{loadCodec=jpegCodec,signal,trace=()=>{}}={}){
 const fail=reason=>{trace({stage:"crop",reason});return null;};
 if(signal?.aborted)return fail("aborted");
 if(!["image/jpeg","image/jpg"].includes(mime))return fail("unsupported_mime");
 const info=inspectJpeg(bytes);
 if(info.reason!=="eligible")return fail(info.reason);
 if(!normalizeAccountRegion(region))return fail("region_missing_or_invalid");
 const rect=regionRect(region,info.width,info.height);if(!rect)return fail("region_bounds");
 let codec,image,encoded;
 try{codec=await loadCodec();}catch{return fail("codec_import");}
 if(signal?.aborted)return fail("aborted");
 try{image=codec.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:3,maxMemoryUsageInMB:48});}catch{return fail("codec_decode");}
 if(image.width!==info.width||image.height!==info.height)return fail("codec_dimensions");
 const crop=cropRgba(image,rect);if(!crop)return fail("crop_bounds");
 if(signal?.aborted)return fail("aborted");
 try{encoded=codec.encode(crop,95).data;}catch{return fail("codec_encode");}
 if(signal?.aborted)return fail("aborted");
 if(!(encoded instanceof Uint8Array)||!encoded.length||encoded.length>900_000)return fail("output_limit");
 trace({stage:"crop",reason:"used",scale:crop.scale});
 return {bytes:encoded,mime:"image/jpeg",scale:crop.scale};
}
export async function accountImageParts({bytes,mime,region,encode,signal,loadCodec,trace}){
 const parts=[{inlineData:{mimeType:mime==="image/jpg"?"image/jpeg":mime,data:encode(bytes)}}];
 const crop=await buildAccountCrop(bytes,mime,region,{signal,loadCodec,trace});
 if(crop)parts.push({text:"Ảnh thứ hai là vùng phóng to từ ảnh thứ nhất, chỉ dùng để kiểm tra từng nét số. Xác minh nhãn và vai trò người nhận trên ảnh thứ nhất; nếu hai ảnh hoặc vị trí không khớp, clear=false."},{inlineData:{mimeType:crop.mime,data:encode(crop.bytes)}});
 return parts;
}
