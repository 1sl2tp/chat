// NCC-009: Pure integer-VND math. Never silently invent missing invoice prices.
// Global supplier discount is prorated by gross line value, not by quantity.
// BigInt ensures every allocated VND sums to exactly the printed discount.
const safeVnd=value=>{
 if(value===null||value===undefined||value==="")return null;
 if(typeof value==="string"&&!/^\d{1,12}$/.test(value.trim()))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0&&n<=100000000000?n:null;
};
const safeQty=value=>{
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>0&&n<=1000000?n:null;
};
const roundUnit=n=>Math.round((n+Number.EPSILON)*100)/100;
const warning=(warnings,s)=>{if(!warnings.includes(s))warnings.push(s);};
export function reconcileInvoice(document={},inputLines=[]){
 const doc=document&&typeof document==="object"?document:{};
 const lines=(Array.isArray(inputLines)?inputLines:[]).map((source,i)=>{
  const row=source&&typeof source==="object"?source:{};
  const qty=safeQty(row.quantity);
  const listedUnit=safeVnd(row.unit_price_vnd);
  const printedLine=safeVnd(row.line_total_vnd);
  const multiplied=qty!==null&&listedUnit!==null?
   Math.round(qty*listedUnit):null;
  const computedFromUnit=multiplied!==null&&Number.isSafeInteger(multiplied)&&multiplied>=0&&multiplied<=100000000000?
   multiplied:null;
  const rowWarnings=[];
  if(qty!==null&&qty>=100)
   warning(rowWarnings,"Số lượng lớn: cần đối chiếu trực tiếp với ảnh gốc");
  if(printedLine!==null&&computedFromUnit!==null&&
    Math.abs(printedLine-computedFromUnit)>1)
   warning(rowWarnings,"Đơn giá × SL không khớp thành tiền in trên dòng");
  const gross=printedLine??computedFromUnit;
  return {
   ...row,row_no:row.row_no??i+1,quantity:qty,
   unit_price_vnd:listedUnit,line_total_vnd:printedLine,
   gross_line_vnd:gross,
   derived_gross_unit_vnd:gross!==null&&qty!==null?roundUnit(gross/qty):null,
   discount_line_vnd:null,
   discount_per_unit_vnd:null,
   net_line_vnd:null,
   net_unit_vnd:null,
   row_warnings:rowWarnings
  };
 });
 const warnings=[];
 let allGrossKnown=lines.length>0&&lines.every(x=>x.gross_line_vnd!==null);
 const sumGross=allGrossKnown?
  lines.reduce((sum,x)=>sum+x.gross_line_vnd,0):null;
 const printedSubtotal=safeVnd(doc.subtotal_vnd);
 const printedDiscount=safeVnd(doc.discount_amount_vnd);
 const discountPercent=doc.discount_percent===null||doc.discount_percent===undefined||doc.discount_percent===""?
  null:Number(doc.discount_percent);
 const percent=discountPercent!==null&&Number.isFinite(discountPercent)&&
  discountPercent>=0&&discountPercent<=100?discountPercent:null;
 const printedPayable=safeVnd(doc.total_payable_vnd);
 const printedLegacy=safeVnd(doc.printed_total_vnd);
 const shipping=safeVnd(doc.shipping_fee_vnd);
 const other=safeVnd(doc.other_fee_vnd);
 const tax=safeVnd(doc.tax_vnd);
 const base=printedSubtotal??sumGross;
 if(sumGross!==null&&printedSubtotal!==null&&
  Math.abs(sumGross-printedSubtotal)>1)
  warning(warnings,"Tổng các dòng khác tổng tiền hàng in trên phiếu");
 if(discountPercent!==null&&percent===null)
  warning(warnings,"Tỷ lệ chiết khấu đọc được không hợp lệ");
 let discount=printedDiscount;
 let discountSource=printedDiscount!==null?"printed":"missing";
 if(discount===null&&percent!==null&&base!==null){
  discount=Math.round(base*percent/100);
  discountSource="percent_estimate";
 }
 if(discount!==null&&percent!==null&&base!==null&&printedDiscount!==null&&
  Math.abs(Math.round(base*percent/100)-printedDiscount)>1)
  warning(warnings,"Số tiền chiết khấu không khớp tỷ lệ in trên phiếu");
 if(discount!==null&&base!==null&&discount>base){
  warning(warnings,"Chiết khấu lớn hơn tiền hàng");
  discount=null;discountSource="invalid";
 }
 // No guessing of zero discount: a missing discount is NOT a printed 0.
 if(discount===null)
  warning(warnings,"Không thấy đủ thông tin chiết khấu tổng");
 if(!allGrossKnown)
  warning(warnings,"Chưa đủ đơn giá hoặc thành tiền của tất cả mặt hàng");
 if(lines.some(line=>line.row_warnings.some(x=>x.includes("Đơn giá"))))
  warning(warnings,"Một hoặc nhiều dòng có giá × SL không khớp");
 if(lines.some(line=>line.row_warnings.some(x=>x.includes("Số lượng lớn"))))
  warning(warnings,"Có số lượng lớn (từ 100) cần đối chiếu ảnh gốc");

 let allocatedTotal=null;
 if(allGrossKnown&&sumGross!==null&&sumGross>0&&discount!==null&&discount<=sumGross){
  const divisor=BigInt(sumGross);
  const d=BigInt(discount);
  const portions=lines.map((line,i)=>{
   const product=d*BigInt(line.gross_line_vnd);
   return {i,share:Number(product/divisor),rem:product%divisor};
  });
  const allocated=portions.reduce((sum,x)=>sum+x.share,0);
  let residual=discount-allocated;
  portions.sort((a,b)=>a.rem===b.rem?a.i-b.i:a.rem>b.rem?-1:1);
  for(let i=0;i<portions.length&&residual>0;i++,residual--)portions[i].share++;
  portions.sort((a,b)=>a.i-b.i);
  for(let i=0;i<portions.length;i++){
   const line=lines[i],value=portions[i].share;
   line.discount_line_vnd=value;
   line.net_line_vnd=line.gross_line_vnd-value;
   if(line.quantity!==null){
    line.discount_per_unit_vnd=roundUnit(value/line.quantity);
    line.net_unit_vnd=roundUnit(line.net_line_vnd/line.quantity);
   }
  }
  allocatedTotal=lines.reduce((sum,line)=>sum+line.discount_line_vnd,0);
  if(allocatedTotal!==discount)throw Error("discount_allocation_invariant");
 }
 const calculatedPayable=sumGross!==null&&discount!==null?
  sumGross-discount+(shipping??0)+(other??0)+(tax??0):null;
 const totalDifference=printedPayable!==null&&calculatedPayable!==null?
  calculatedPayable-printedPayable:null;
 if(totalDifference!==null&&Math.abs(totalDifference)>1)
  warning(warnings,"Tiền phải trả tính ra không khớp số in trên phiếu");
 if(printedPayable===null&&printedLegacy!==null)
  warning(warnings,"Số tổng in trên ảnh chưa xác định là trước hay sau chiết khấu");
 // Do not mark a document as verified if its source amounts are incomplete,
 // if any line contradicts its printed arithmetic, or when fees may be hidden.
 let status="insufficient";
 if(calculatedPayable!==null&&printedPayable!==null)
  status=warnings.length===0&&Math.abs(totalDifference)<=1?"verified":
   Math.abs(totalDifference)>1?"mismatch":"review";
 else if(calculatedPayable!==null)status="calculated_not_verified";
 if(!allGrossKnown)status="insufficient";
 return {
  lines,
  summary:{
   status,gross_lines_vnd:sumGross,subtotal_printed_vnd:printedSubtotal,
   discount_total_vnd:discount,discount_printed_vnd:printedDiscount,
   discount_percent:percent,discount_source:discountSource,
   discount_allocated_vnd:allocatedTotal,
   shipping_fee_vnd:shipping,other_fee_vnd:other,tax_vnd:tax,
   payable_calculated_vnd:calculatedPayable,payable_printed_vnd:printedPayable,
   legacy_printed_total_vnd:printedLegacy,
   difference_vnd:totalDifference,all_line_amounts_known:allGrossKnown,
   warnings,discount_method:"proportional_gross_largest_remainder_vnd",
   unit_price_precision:"2_decimals_display_only"
  }
 };
}
