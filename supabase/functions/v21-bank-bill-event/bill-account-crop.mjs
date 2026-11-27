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
// Reject EXIF-oriented or ambiguous JPEGs instead of risking a rotated bbox.
// The original image remains available to the model on all fallback paths.
export function safeJpegDimensions(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>4_000_000||bytes[0]!==255||bytes[1]!==216)return null;
 let i=2,dimensions=null;
 while(i<bytes.length){
  if(bytes[i++]!==255)return null;
  while(i<bytes.length&&bytes[i]===255)i++;
  const marker=bytes[i++];
  if(marker===218)return dimensions;
  if(marker===217||i+2>bytes.length)return null;
  const length=bytes[i]*256+bytes[i+1];
  if(length<2||i+length>bytes.length)return null;
  // EXIF orientation can differ from the encoded raster. Conservative fallback.
  if(marker===225&&length>=8&&bytes[i+2]===69&&bytes[i+3]===120&&bytes[i+4]===105&&bytes[i+5]===102)return null;
  if([192,193,194].includes(marker)){
   if(length<8||dimensions)return null;
   const height=bytes[i+3]*256+bytes[i+4],width=bytes[i+5]*256+bytes[i+6];
   if(!width||!height||width*height>3_000_000)return null;
   dimensions={width,height};
  }
  i+=length;
 }
 return null;
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
export async function buildAccountCrop(bytes,mime,region,{loadCodec=jpegCodec,signal}={}){
 if(signal?.aborted||!["image/jpeg","image/jpg"].includes(mime)||!normalizeAccountRegion(region))return null;
 const dim=safeJpegDimensions(bytes);if(!dim)return null;
 const rect=regionRect(region,dim.width,dim.height);if(!rect)return null;
 try{
  const codec=await loadCodec();if(signal?.aborted)return null;
  const image=codec.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:3,maxMemoryUsageInMB:48});
  if(image.width!==dim.width||image.height!==dim.height)return null;
  const crop=cropRgba(image,rect);if(!crop||signal?.aborted)return null;
  const encoded=codec.encode(crop,95).data;
  if(signal?.aborted||!(encoded instanceof Uint8Array)||!encoded.length||encoded.length>900_000)return null;
  return {bytes:encoded,mime:"image/jpeg",scale:crop.scale};
 }catch{return null;}
}
export async function accountImageParts({bytes,mime,region,encode,signal,loadCodec}){
 const parts=[{inlineData:{mimeType:mime==="image/jpg"?"image/jpeg":mime,data:encode(bytes)}}];
 const crop=await buildAccountCrop(bytes,mime,region,{signal,loadCodec});
 if(crop)parts.push({text:"Ảnh thứ hai là vùng phóng to từ ảnh thứ nhất, chỉ dùng để kiểm tra từng nét số. Xác minh nhãn và vai trò người nhận trên ảnh thứ nhất; nếu hai ảnh hoặc vị trí không khớp, clear=false."},{inlineData:{mimeType:crop.mime,data:encode(crop.bytes)}});
 return parts;
}
