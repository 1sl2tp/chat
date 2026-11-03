'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','chat-image-orientation.js'),'utf8');
const match=source.match(/function normalizeRotation\(value\)\s*\{[\s\S]*?\n\}/);
assert.ok(match,'normalizeRotation implementation must exist');
const normalize=vm.runInNewContext(`(${match[0]})`);
for(const [input,expected] of [[0,0],[90,90],[180,180],[270,270],[360,0],[-90,270],[450,90],[45,90],[44,0],[null,0],['90',90],['bad',0]]){
  assert.equal(normalize(input),expected,`rotation for ${String(input)}`);
}
const assetMatch=source.match(/function tileAssetId\(tile\)\{[^\n]*\}/);
assert.ok(assetMatch,'tileAssetId implementation must exist');
const assetId=vm.runInNewContext(`(function(){function clean(value){return String(value??'').trim();} return (${assetMatch[0]});})()`);
assert.equal(assetId(null),'');
assert.equal(assetId(undefined),'');
assert.equal(assetId({getAttribute(name){assert.equal(name,'data-media-asset-id');return '  image-42  ';}}),'image-42');
assert.equal(assetId({getAttribute(){return null;}}),'');
console.log('Image rotation runtime fixtures PASS');
