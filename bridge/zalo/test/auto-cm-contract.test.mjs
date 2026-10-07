import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('contact sync edge auto-creates and links CM aliases without credentials delivery',()=>{
  const source=fs.readFileSync(path.resolve(process.cwd(),'../../supabase/functions/v21-zalo-contacts/index.ts'),'utf8');
  assert.match(source,/autoProvisionCmContacts/);
  assert.match(source,/const CM_ALIAS_PREFIX\s*=\s*\/\^cm/);
  assert.match(source,/contact_group:\s*"cm"/);
  assert.match(source,/auth\.admin\.createUser/);
  assert.match(source,/zalo_user_links/);
  assert.doesNotMatch(source,/sendAccountCredentials/);
});

test('contact directory exposes CM as a first-class group',()=>{
  const source=fs.readFileSync(path.resolve(process.cwd(),'../../contact-directory-admin.js'),'utf8');
  assert.match(source,/\['cm','CM'\]/);
  assert.match(source,/data-contact-directory-filter="cm">CM</);
});

test('admin edge accepts CM when an admin manually changes a contact group',()=>{
  const source=fs.readFileSync(path.resolve(process.cwd(),'../../supabase/functions/v21-zalo-admin/index.ts'),'utf8');
  assert.match(source,/CONTACT_GROUPS[^\n]*"cm"/);
});
