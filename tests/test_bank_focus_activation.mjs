import assert from "node:assert/strict";
import {runFocusedTick} from "../supabase/functions/v21-bank-bill-event/bill-focused-tick.mjs";
let calls=[];
const db=mode=>({rpc:async(name,args)=>{calls.push(name);return {data:name==="v0_bill_focus_mode"?mode:name==="v0_bill_focus_seed"?0:null,error:null};},storage:{from(){throw Error("unexpected storage")}}});
assert.deepEqual(await runFocusedTick({db:db("off"),key:""}),{state:"disabled",ledger_written:false});
assert.deepEqual(calls,["v0_bill_focus_mode"]);calls=[];
assert.equal((await runFocusedTick({db:db("pilot"),key:"fixture"})).state,"idle");
assert.deepEqual(calls,["v0_bill_focus_mode","v0_bill_focus_seed","v0_bill_focus_claim"]);
console.log("Focused worker gate fail-closed fixture passed");
