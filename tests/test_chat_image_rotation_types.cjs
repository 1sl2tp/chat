'use strict';
// Migration guard: preserve TypeScript-compatible JSDoc at the JS runtime boundary.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','chat-image-orientation.js'),'utf8');
const contracts=[
  ['unknown','string','clean(value)'],
  ['unknown','number','normalizeRotation(value)'],
  ['string','string','rotationKey(assetId)'],
  ['string','number','readRotation(assetId)'],
];
for(const [input,output,name] of contracts){
  const declaration=new RegExp('/\\*\\* @param \\{'+input+'\\} \\w+ @returns \\{'+output+'\\}[^\\n]*\\*/\\nfunction '+name.replace(/[()]/g,'\\$&'));
  assert.match(source,declaration,'Missing typed contract for '+name);
}
assert.match(source,/\/\*\* @param \{string\} assetId @param \{number\} value @returns \{number\} \*\/\nfunction writeRotation\(assetId,value\)/);
assert.match(source,/\/\*\* @param \{string\} assetId @param \{number\} delta @returns \{boolean\} \*\/\nfunction rotateAsset\(assetId,delta\)/);
assert.match(source,/\/\*\* @param \{Element \| null \| undefined\} tile @returns \{string\} \*\/\nfunction tileAssetId\(tile\)/);
assert.match(source,/\/\*\* @param \{HTMLElement \| null \| undefined\} overlay @returns \{string\} \*\/\nfunction activeViewerAssetId\(overlay\)/);
console.log('Chat image rotation JSDoc migration contracts PASS');
