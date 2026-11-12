// BANK-298: Scan quotas use the SAME Vietnam calendar day as collections.
// Produce a UTC instant, suitable for PostgREST timestamptz created_at filters.
// Pure function: never changes financial records or receipt classifications.
export function vietnamBusinessDayStartUtc(now=new Date()){
 const instant=now instanceof Date?now.getTime():Number(now);
 if(!Number.isFinite(instant))throw new Error("scan_budget_clock_invalid");
 const dayMs=86400000,offsetMs=7*3600000;
 const start=Math.floor((instant+offsetMs)/dayMs)*dayMs-offsetMs;
 return new Date(start).toISOString();
}
