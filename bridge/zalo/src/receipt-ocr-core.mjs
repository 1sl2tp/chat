export const EXPECTED_RECIPIENT_NAME="BUI XUAN TUNG";
export const EXPECTED_RECIPIENT_ACCOUNT="2901181999999";

function fold(value){
  return String(value??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toUpperCase()
    .replace(/\r/g,"");
}

function lines(value){
  return fold(value)
    .split(/\n+/)
    .map(line=>line.replace(/[ \t]+/g," ").trim())
    .filter(Boolean);
}

function digitsOnly(value){
  return String(value??"").replace(/[^0-9]/g,"");
}

function exactAccountEvidence(fullText,digitText){
  for(const line of [...lines(fullText),...lines(digitText)]){
    const digits=digitsOnly(line);
    if(digits===EXPECTED_RECIPIENT_ACCOUNT)return true;
    if(digits.length>=EXPECTED_RECIPIENT_ACCOUNT.length&&digits.includes(EXPECTED_RECIPIENT_ACCOUNT))return true;
  }
  return false;
}

function amountCandidates(text){
  const out=[];
  const normalized=fold(text);
  const re=/([0-9][0-9., \t]{2,}[0-9])\s*VND\b/g;
  let match;
  while((match=re.exec(normalized))){
    const digits=digitsOnly(match[1]);
    if(digits.length<4||digits.length>12)continue;
    const amount=Number(digits);
    if(Number.isSafeInteger(amount)&&amount>0)out.push(amount);
  }
  return out;
}

function validDateParts(day,month,year){
  const d=Number(day),m=Number(month),y=Number(year);
  if(!Number.isInteger(d)||!Number.isInteger(m)||!Number.isInteger(y))return null;
  if(y<2020||y>2100||m<1||m>12||d<1||d>31)return null;
  const check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return null;
  return {d,m,y};
}

function extractTransferAt(text){
  const normalized=fold(text);
  const dates=[];
  const dateRe=/\b([0-3]?\d)[\/.\-]([01]?\d)[\/.\-](20\d{2})\b/g;
  let match;
  while((match=dateRe.exec(normalized))){
    const parts=validDateParts(match[1],match[2],match[3]);
    if(parts)dates.push({index:match.index,...parts});
  }
  const times=[];
  const timeRe=/\b([0-2]?\d)[:H.]([0-5]\d)(?::([0-5]\d))?\b/g;
  while((match=timeRe.exec(normalized))){
    const h=Number(match[1]),min=Number(match[2]),sec=Number(match[3]||0);
    if(h>=0&&h<=23)times.push({index:match.index,h,min,sec});
  }
  if(!dates.length||!times.length)return null;

  let best=null;
  for(const date of dates){
    for(const time of times){
      const distance=Math.abs(date.index-time.index);
      if(!best||distance<best.distance)best={date,time,distance};
    }
  }
  if(!best)return null;
  const pad=n=>String(n).padStart(2,"0");
  return `${best.date.y}-${pad(best.date.m)}-${pad(best.date.d)}T${pad(best.time.h)}:${pad(best.time.min)}:${pad(best.time.sec)}+07:00`;
}

export function parseReceiptOcr(fullText,digitText=""){
  const normalized=fold(fullText);
  const compactLetters=normalized.replace(/[^A-Z0-9]/g,"");
  const bankExact=compactLetters.includes("AGRIBANK");
  const normalizedWords=normalized.replace(/[^A-Z0-9]+/g," ").trim();
  const nameExact=normalizedWords.includes(EXPECTED_RECIPIENT_NAME);
  const accountExact=exactAccountEvidence(fullText,digitText);
  const amounts=amountCandidates(fullText);
  const amountVnd=amounts.length?Math.max(...amounts):null;
  const transferAt=extractTransferAt(fullText);
  const looksReceipt=Boolean(
    amountVnd&&transferAt&&/\bVND\b/.test(normalized)&&(bankExact||nameExact||accountExact)
  );
  return {
    is_bank_receipt:looksReceipt,
    bank_name:bankExact?"Agribank":null,
    recipient_name:nameExact?EXPECTED_RECIPIENT_NAME:null,
    recipient_account:accountExact?EXPECTED_RECIPIENT_ACCOUNT:null,
    amount_vnd:amountVnd,
    transfer_at:transferAt,
    transaction_ref:null,
    extraction_engine:"tesseract-ocr",
  };
}
