import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

const productOnlyCatalog=[
  {id:'tl30',name:'555 dẹt'},
  {id:'khac202',name:'Mi tom hao hao'},
  {id:'tau53',name:'Chan don cuu ca'},
  {id:'tau54',name:'Chan ga doi ana'},
];

const levelCatalog=[
  {id:'vnm6',name:'Sua bo bich co',source:'Sữa',level1:'bo',level2:'bich',level3:'có, có đường'},
  {id:'vnm7',name:'Sua bo bich it',source:'Sữa',level1:'bo',level2:'bich',level3:'ít, ít đường'},
  {id:'vnm8',name:'Sua bo bich khong',source:'Sữa',level1:'bo',level2:'bich',level3:'không, không đường'},
  {id:'vnm11',name:'Sua bo lit co',source:'Sữa',level1:'bo',level2:'lit',level3:'có, có đường'},
  {id:'vnm13',name:'Sua bo lit khong',source:'Sữa',level1:'bo',level2:'lit',level3:'không, không đường'},
  {id:'vnm17',name:'Sua chua co',source:'Sữa',level1:'chua',level2:'có, có đường'},
  {id:'vnm20',name:'Sua chua it',source:'Sữa',level1:'chua',level2:'ít, ít đường'},
  {id:'vnm21',name:'Sua chua khong',source:'Sữa',level1:'chua',level2:'không, không đường'},
  {id:'vnm23',name:'Sua chua nha dam co',source:'Sữa',level1:'chua',level2:'nha dam, nha, dam',level3:'có, có đường'},
  {id:'vnm24',name:'Sua chua nha dam it',source:'Sữa',level1:'chua',level2:'nha dam, nha, dam',level3:'ít, ít đường'},
  {id:'vnm38',name:'Sua probi be mau - dứa',source:'Sữa',level1:'probi, bi, proby',level2:'bé, be',level3:'mau',level4:'dứa'},
  {id:'vnm39',name:'Sua probi be mau - dưa gang',source:'Sữa',level1:'probi, bi, proby',level2:'bé, be',level3:'mau',level4:'dưa gang, dưa'},
  {id:'vnm41',name:'Sua probi be mau - viet quat',source:'Sữa',level1:'probi, bi, proby',level2:'bé, be',level3:'mau',level4:'viet quat, vq'},
  {id:'vnm46',name:'Sua probi to mau - viet quat',source:'Sữa',level1:'probi, bi, proby',level2:'to, 180',level3:'mau',level4:'viet quat, vq'},
  {id:'vnm50',name:'Sua tho do giay 1284g',source:'Sữa',level1:'tho',level2:'do',level3:'giay',level4:'1284g, 1,2kg'},
  {id:'vnm51',name:'Sua tho do giay 1kg',source:'Sữa',level1:'tho',level2:'do',level3:'giay',level4:'1kg'},
  {id:'vnm53',name:'Sua tho do sat',source:'Sữa',level1:'tho',level2:'do',level3:'sat'},
  {id:'tau67',name:'Huong duong mv',source:'Hàng thường',level1:'hương dương mỹ vị, huong duong mv'},
];

function line(productName,quantity=1){
  return {quantity,productName,line:`${quantity} ${productName}`};
}

// Products without configured 1..9 keys are never renamed from partial name tokens.
assert.equal(findCatalogProduct('cửu ca',productOnlyCatalog),null);
assert.equal(findCatalogProduct('chân đôi ana',productOnlyCatalog),null);
assert.equal(findCatalogProduct('hao hao',productOnlyCatalog),null);
assert.equal(findCatalogProduct('555 det',productOnlyCatalog),null);
assert.deepEqual(
  resolveParsedLinesWithCatalog([line('cửu ca',1),line('chân đôi ana',2)],productOnlyCatalog).map(row=>row.line),
  ['1 cửu ca','2 chân đôi ana'],
);

// A full canonical name is deterministic and may match itself exactly.
assert.equal(findCatalogProduct('Chan don cuu ca',productOnlyCatalog)?.productId,'tau53');

// Source is only the already-selected search domain; it is not level 1.
assert.equal(
  findCatalogProduct('Sữa',[{id:'x',name:'Only milk row',source:'Sữa',level1:'adm',level2:'bé'}]),
  null,
  'source must never be consumed as a 1..9 product key',
);

// A fully supplied compact path wins before any path that would need inferred nodes.
assert.equal(
  findCatalogProduct('chua có đường',levelCatalog)?.productName,
  'Sua chua co',
  '1-2 exact path beats 1-[missing]-3',
);

// Missing nodes are allowed only after the whole configured path set is checked.
assert.equal(
  findCatalogProduct('nha dam có',levelCatalog)?.productName,
  'Sua chua nha dam co',
  'visible 2-3 keys may fill the missing root only when one whole path remains',
);
assert.equal(
  findCatalogProduct('bich khong',levelCatalog)?.productName,
  'Sua bo bich khong',
  'visible 2-3 keys may identify one unique full path',
);
assert.equal(
  findCatalogProduct('tho do',levelCatalog),
  null,
  'a visible 1-2 subset shared by several whole paths stays unresolved',
);
assert.equal(
  findCatalogProduct('tho do giay 1,2kg',levelCatalog)?.productName,
  'Sua tho do giay 1284g',
);

// User example: probi > bé > màu > dưa gang. Input has 1,2,4.
assert.equal(
  findCatalogProduct('probi bé dưa',levelCatalog)?.productName,
  'Sua probi be mau - dưa gang',
  '1,2,4 may fill level 3=mau only after exactly one complete 1-4 path remains',
);
assert.equal(
  findCatalogProduct('probi bé dứa',levelCatalog)?.productName,
  'Sua probi be mau - dứa',
  'dứa is a different explicit key from dưa',
);
assert.equal(
  findCatalogProduct('probi bé vq',levelCatalog)?.productName,
  'Sua probi be mau - viet quat',
  'explicit aliases participate in the same path formula',
);

const ambiguous124=[
  {id:'a',name:'A',source:'Sữa',level1:'probi',level2:'bé, be',level3:'mau',level4:'dưa gang, dưa'},
  {id:'b',name:'B',source:'Sữa',level1:'probi',level2:'bé, be',level3:'khac',level4:'dưa gang, dưa'},
];
assert.equal(
  findCatalogProduct('probi bé dưa',ambiguous124),
  null,
  '1,2,4 cannot invent level 3 when two complete 1-4 paths remain',
);

// Accent fallback is deterministic: unaccented `dua` is ambiguous between dưa/dứa.
assert.equal(findCatalogProduct('probi be dua',levelCatalog),null);

// A real one-node root product may resolve; a partial phrase cannot jump to another branch.
assert.equal(
  findCatalogProduct('hương dương mỹ vị',levelCatalog)?.productName,
  'Huong duong mv',
);
assert.equal(findCatalogProduct('my vi',levelCatalog),null);

// Unknown words are not silently ignored.
assert.equal(findCatalogProduct('probi bé xyz dưa',levelCatalog),null);

console.log('chat deterministic compact 1..9 product path formula PASS');
