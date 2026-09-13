import assert from 'node:assert/strict';
import { normalizeDraftLines, normalizePrice, productId } from '../supabase/functions/v21-order-draft/draft-core.mjs';

assert.deepEqual(normalizeDraftLines([
  {quantity:15,name:'thùng bò'},
  {quantity:1,name:'thùng sim 5 lít'},
]), [
  {quantity:15,name:'thùng bò'},
  {quantity:1,name:'thùng sim 5 lít'},
]);

assert.deepEqual(normalizeDraftLines([
  {quantity:'2',name:'  thùng mì lô tô  '},
]), [
  {quantity:2,name:'thùng mì lô tô'},
]);

assert.throws(()=>normalizeDraftLines([{quantity:0,name:'x'}]), /invalid_draft_line/);
assert.throws(()=>normalizeDraftLines([{quantity:1,name:'   '}]), /invalid_draft_line/);
assert.equal(normalizePrice('245000'), 245000);
assert.equal(normalizePrice('245.000'), 245000);
assert.throws(()=>normalizePrice('-1'), /invalid_price/);
assert.match(productId('123e4567-e89b-12d3-a456-426614174000'), /^CHAT-[A-F0-9]{12}$/);

console.log('chat order draft core PASS');
