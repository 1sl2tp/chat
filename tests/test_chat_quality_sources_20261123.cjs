'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const qa=JSON.parse(read('qa/package.json'));
assert.equal(qa.private,true);
assert.equal(qa.devDependencies['modern-web-guidance'],'1.0.1');
assert.equal(qa.devDependencies['@playwright/test'],'1.65.1');
assert.equal(qa.devDependencies['@axe-core/playwright'],'4.14.0');

const skill=read('.agents/skills/modern-web-guidance/SKILL.md');
assert.match(skill,/name: modern-web-guidance/);
assert.match(skill,/Search and retrieve/);

const workflow=read('.github/workflows/chat-quality-watch.yml');
assert.match(workflow,/cron: '17 \* \* \* \*'/);
assert.match(workflow,/cron: '43 2 \* \* \*'/);
assert.match(workflow,/permissions:\s*\n\s*contents: read/);
assert.doesNotMatch(workflow,/permissions:\s*\n\s*contents: write/);
assert.doesNotMatch(workflow,/workflow_run:/);
assert.doesNotMatch(workflow,/\bgh pr merge\b|\bgit push\b|\bdeploy-pages\b|\bworkflow_dispatch\s+--ref\b/);
assert.match(workflow,/needs: quick/);
assert.match(workflow,/node tests\/test_chat438_keyboard_content_priority_20261123.cjs/);

const smoke=read('qa/tests/public-shell.spec.mjs');
assert.match(smoke,/route\.abort\('blockedbyclient'\)/);
assert.match(smoke,/url\.hostname==='127\.0\.0\.1'&&url\.port==='8765'/);

assert.match(smoke,/AxeBuilder/);
assert.doesNotMatch(smoke,/page\.goto\(['"]https?:\/\//);
assert.doesNotMatch(smoke,/fill\(|type\(|click\(['"]send/i);

const config=read('qa/playwright.config.mjs');
assert.match(config,/baseURL:'http:\/\/127\.0\.0\.1:8765'/);
assert.match(config,/serviceWorkers:'block'/);
assert.match(config,/chromium-mobile/);
assert.match(config,/chromium-desktop/);
console.log('CHAT-QUALITY: pinned upstream, read-only CI and localhost-only browser guards OK');
