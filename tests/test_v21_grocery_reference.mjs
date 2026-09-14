// Recognition library is evidence only; clear source phrases must survive unchanged.
import assert from 'node:assert/strict';
import {
  normalizeRecognitionCore,
  rankGroceryCandidates,
  recognitionDecision,
} from '../supabase/functions/v21-order-scribe/grocery-reference.mjs';

const refs=[
  {name:'Banh gao man',category:'Banh',source:'own',priority:100},
  {name:'Banh gao phomai',category:'Banh',source:'own',priority:100},
  {name:'Banh dns 681',category:'Banh',source:'own',priority:100,levels:['banh','dns','681']},
  {name:'Sua chua nep cam',category:'Sua',source:'ai_key',priority:115,aliases:['sc','sua chua'],levels:['sua','chua','nep','cam']},
  {name:'Sua th be co',category:'Sua',source:'own',priority:100,aliases:['th','co duong'],levels:['sua','th','be','co']},
  {name:'Sua th be it',category:'Sua',source:'own',priority:100,aliases:['th','it duong'],levels:['sua','th','be','it']},
  {name:'Sua milo to',category:'Sua',source:'ai_key',priority:115,aliases:['milo','co duong','dg'],specs:['to','180','180ml'],levels:['sua','milo','to']},
  {name:'Xx poni be',category:'Xuc xich',source:'own',priority:100,aliases:['xx','xuc xich','poni']},
  {name:'Xx poni to',category:'Xuc xich',source:'own',priority:100,aliases:['xx','xuc xich','poni']},
  {name:'Keo gum Xylitol huong bac ha',category:'Keo',source:'market',priority:40},
  {name:'555 det',category:'Thuoc la',source:'own',priority:100},
  {name:'Kent den',category:'Thuoc la',source:'own',priority:100},
];

assert.equal(normalizeRecognitionCore('2 thung Banh dns 681'),'banh dns 681');
assert.equal(normalizeRecognitionCore('3 hop 555 det'),'555 det');
assert.equal(normalizeRecognitionCore('1 thung Sua TH it duong'),'sua th it duong');

let ranked=rankGroceryCandidates('dns 681',refs,5);
assert.equal(ranked[0].name,'Banh dns 681');
assert.ok(ranked[0].score>ranked[1]?.score||ranked.length===1);

ranked=rankGroceryCandidates('xx poni',refs,5);
assert.ok(ranked.slice(0,2).some(x=>x.name.startsWith('Xx poni')));
const poniIndex=ranked.findIndex(x=>x.name.startsWith('Xx poni'));
const xylitolIndex=ranked.findIndex(x=>x.name.includes('Xylitol'));
assert.ok(xylitolIndex===-1||poniIndex<xylitolIndex);

ranked=rankGroceryCandidates('sua th it duong',refs,5);
assert.equal(ranked[0].category,'Sua');
assert.ok(ranked.slice(0,3).some(x=>x.name==='Sua th be it'));

ranked=rankGroceryCandidates('555 det',refs,5);
assert.equal(ranked[0].name,'555 det');
assert.equal(ranked[0].category,'Thuoc la');

ranked=rankGroceryCandidates('sc nep cam',refs,5);
assert.equal(ranked[0].name,'Sua chua nep cam','short grocery aliases are matching evidence but must not rewrite the source phrase');

ranked=rankGroceryCandidates('milo to 180 co dg',refs,5);
assert.equal(ranked[0].name,'Sua milo to','spec tokens and shorthand evidence must strengthen the correct FMCG family');

let decision=recognitionDecision('banh gao',rankGroceryCandidates('banh gao',refs,5));
assert.equal(decision.mode,'preserve');
assert.equal(decision.value,'banh gao');

decision=recognitionDecision('dns 681',rankGroceryCandidates('dns 681',refs,5));
assert.equal(decision.mode,'preserve');
assert.equal(decision.value,'dns 681');

decision=recognitionDecision('xx poni',rankGroceryCandidates('xx poni',refs,5));
assert.equal(decision.mode,'preserve');
assert.equal(decision.value,'xx poni');

decision=recognitionDecision('sc nep cam',rankGroceryCandidates('sc nep cam',refs,5));
assert.equal(decision.mode,'preserve');
assert.equal(decision.value,'sc nep cam','a clear shorthand phrase confirmed by the library remains the user phrase');

console.log('grocery reference ranking contract PASS');
