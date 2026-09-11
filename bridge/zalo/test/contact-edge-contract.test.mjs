import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath=path.resolve(process.cwd(),'../../supabase/functions/v21-zalo-contacts/index.ts');

test('contacts edge authenticates bridge token and upserts only contact fields',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/x-bridge-token/i);
  assert.match(source,/v21_zalo_bridge_auth/);
  assert.match(source,/zalo_contacts/);
  assert.match(source,/zalo_id/);
  assert.match(source,/display_name/);
  assert.match(source,/avatar_url/);
  assert.match(source,/service_role/i);
});
