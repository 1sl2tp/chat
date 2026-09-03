import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('directory keeps local mock mutations but delegates account mutations when a live manager is present', () => {
  const source = read('src/directory/directory-screen.ts');
  assert.match(source, /management\?:\s*DirectoryManagement/);
  assert.match(source, /management\.createCustomer/);
  assert.match(source, /management\.promoteGuest/);
  assert.match(source, /management\.updateCustomer/);
  assert.match(source, /management\.deleteContact/);
  assert.match(source, /onManagedChange/);
  assert.match(source, /addCustomer\(this\.store\.state/);
  assert.match(source, /promoteGuest\(this\.store\.state/);
});

test('main injects the same live directory manager into mobile admin, desktop workspace and chat subject actions', () => {
  const main = read('src/main.ts');
  const workspace = read('src/admin/admin-workspace.ts');
  assert.match(main, /liveAdminDirectory/);
  assert.match(main, /directoryManagementCallbacks/);
  assert.match(main, /new DirectoryScreen\(store, overlays, directoryManagementCallbacks/);
  assert.match(workspace, /directoryManagement\?:/);
  assert.match(workspace, /management:\s*this\.callbacks\.directoryManagement/);
});
