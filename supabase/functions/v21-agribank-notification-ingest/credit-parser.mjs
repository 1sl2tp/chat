export function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toUpperCase();}
export const forbidden=["OTP","ONE TIME PASSWORD","MA XAC THUC","MA BAO MAT","MA DANG NHAP","MAT KHAU","PASSWORD","PIN CODE","MA PIN","SOFTOTP","SOFT OTP"];
export function parseCredit(title,body){
 const t=norm(title+" "+body);
 if(forbidden.some(x=>t.includes(x)))return null;
 if(/\b(TRU TIEN|GHI NO|CHUYEN DI|RUT TIEN|THANH TOAN|CHI TIEN|PHI DICH VU|TIEN LAI|TRA LAI)\b/.test(t))return null;
 const plus=t.match(/(?:^|[^\d])\+\s*([\d.,]{1,20})\s*(?:VND|DONG|D)\b/);
 const incoming=t.match(/(?:GHI CO|NHAN TIEN|TIEN VAO|DUOC CONG|SO TIEN NHAN|BIEN DONG TANG)\s*(?::|LA|SO TIEN)?\s*\+?\s*([\d.,]{1,20})\s*(?:VND|DONG|D)\b/);
 const amount=(incoming||plus)?.[1];
 if(!amount||!/^(?:\d{1,12}|\d{1,3}(?:[.,]\d{3})+)$/.test(amount))return null;
 const number=Number(amount.replace(/[.,]/g,""));
 return Number.isSafeInteger(number)&&number>0&&number<1e12?number:null;
}