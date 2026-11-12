// BANK-291: exact Agribank transaction clock for one bounded, event-driven
// bill recheck. Never substitute device push time, Chat upload time, or balance.
export function officialCreditWindow(body){
 const text=String(body||"");
 const match=/Agribank:\s*([01]\d|2[0-3]):([0-5]\d)\s+([0-3]\d)\/([01]\d)\/(20\d{2})\s+Tài khoản\s+2901181999999\s*:\s*\+/i.exec(text);
 if(!match)return null;
 const [,hour,minute,day,month,year]=match;
 const literal=`${year}-${month}-${day}T${hour}:${minute}`;
 const ms=Date.parse(literal+":00+07:00");
 if(!Number.isFinite(ms)||new Date(ms+7*3600000).toISOString().slice(0,16)!==literal)return null;
 return {from:new Date(ms-5*60000).toISOString(),
   to:new Date(ms+30*60000).toISOString(),
   businessDate:literal.slice(0,10)};
}
