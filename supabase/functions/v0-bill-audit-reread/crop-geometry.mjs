// Pixel-only crop: no generated text, no reconstruction of missing digits.
export const REGION_PROMPT="Trả thêm field_boxes: object theo các khóa amount_vnd,date_raw,clock,account_raw,recipient,memo,reference,trace,sending_bank,receiving_bank. Mỗi ô là null hoặc [ymin,xmin,ymax,xmax] trong 0..1000 trên toàn ảnh gốc, chứa cả nhãn và giá trị. Nếu chữ nhỏ/mờ nhưng xác định vùng thì vẫn trả tọa độ. Không tự điền giá trị.";
export function planRegions(boxes,keys,w,h){
 const valid=b=>Array.isArray(b)&&b.length===4&&b.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1000)&&b[2]>b[0]&&b[3]>b[1]&&(b[2]-b[0])*(b[3]-b[1])<850000;
 const raw=keys.map(k=>boxes?.[k]).filter(valid);
 const regions=[];
 for(const b of raw){
  const padY=Math.max(35,(b[2]-b[0])*.25),padX=Math.max(35,(b[3]-b[1])*.15);
  const r=[Math.max(0,b[0]-padY),Math.max(0,b[1]-padX),Math.min(1000,b[2]+padY),Math.min(1000,b[3]+padX)];
  const similar=regions.find(t=>Math.max(0,Math.min(t[2],r[2])-Math.max(t[0],r[0]))*Math.max(0,Math.min(t[3],r[3])-Math.max(t[1],r[1]))>=.55*Math.min((t[2]-t[0])*(t[3]-t[1]),(r[2]-r[0])*(r[3]-r[1])));
  if(similar){similar[0]=Math.min(similar[0],r[0]);similar[1]=Math.min(similar[1],r[1]);similar[2]=Math.max(similar[2],r[2]);similar[3]=Math.max(similar[3],r[3]);}else regions.push(r);
 }
 const bands=w>h?[[0,0,1000,420],[0,290,1000,710],[0,580,1000,1000]]:[[0,0,420,1000],[290,0,710,1000],[580,0,1000,1000]];
 // If any requested field lacks a reliable location, cover the original with
 // overlapping bands, instead of guessing a single bank template.
 const use=raw.length===keys.length&&regions.length>0&&regions.length<=3?regions:bands;
 return use.slice(0,3).map(b=>{const x=Math.floor(b[1]*w/1000),y=Math.floor(b[0]*h/1000),right=Math.min(w,Math.ceil(b[3]*w/1000)),bottom=Math.min(h,Math.ceil(b[2]*h/1000));return {x,y,w:right-x,h:bottom-y}});
}
export function zoomRegion(src,r){
 if(!Number.isInteger(src.width)||!Number.isInteger(src.height)||src.data.length!==src.width*src.height*4)throw Error("invalid_raster");
 if(![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.x<0||r.y<0||r.w<1||r.h<1||r.x+r.w>src.width||r.y+r.h>src.height)throw Error("invalid_crop");
 const scale=Math.min(3,1400/Math.max(r.w,r.h),Math.sqrt(1300000/(r.w*r.h)));
 const width=Math.max(1,Math.floor(r.w*scale)),height=Math.max(1,Math.floor(r.h*scale)),data=new Uint8Array(width*height*4);
 // Nearest-neighbor preserves the original glyph pixels, without invented detail.
 for(let y=0;y<height;y++){const sy=r.y+Math.min(r.h-1,Math.floor(y*r.h/height));for(let x=0;x<width;x++){const sx=r.x+Math.min(r.w-1,Math.floor(x*r.w/width));const i=(sy*src.width+sx)*4,j=(y*width+x)*4;data[j]=src.data[i];data[j+1]=src.data[i+1];data[j+2]=src.data[i+2];data[j+3]=src.data[i+3];}}
 return {width,height,data,scale};
}
