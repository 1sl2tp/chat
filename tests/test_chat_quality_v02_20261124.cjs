'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
const quality=read('.github/workflows/chat-quality-watch.yml');
const sec=read('.github/workflows/chat-security-audit.yml');
const codeql=read('.github/codeql/chat-security-config.yml');
const config=read('qa/playwright.config.mjs');
const visual=read('qa/tests/visual-geometry.spec.mjs');
const original=read('qa/tests/public-shell.spec.mjs');

for(const engine of ['chromium-desktop','chromium-mobile','firefox-desktop','webkit-desktop','webkit-mobile'])
 assert.ok(config.includes("name:'"+engine+"'"),'missing Playwright project '+engine);
assert.match(config,/serviceWorkers:'block'/);
assert.match(config,/baseURL:'http:\/\/127\.0\.0\.1:8765'/);
assert.match(quality,/playwright install --with-deps chromium firefox webkit/);
assert.match(visual,/route\.abort\('blockedbyclient'\)/);
assert.match(visual,/url\.hostname==='127\.0\.0\.1'&&url\.port==='8765'/);
assert.match(visual,/overflowPx/);
assert.match(visual,/public-shell-.*project\.name/);
assert.doesNotMatch(visual,/page\.goto\(['"]https?:\/\//);
assert.match(original,/new AxeBuilder/);

assert.match(sec,/github\/codeql-action\/init@v4/);
assert.match(sec,/github\/codeql-action\/analyze@v4/);
assert.match(sec,/languages: javascript-typescript/);
assert.match(sec,/security-events: write/);
assert.match(codeql,/index\.html/);
assert.match(sec,/551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/);
assert.match(sec,/gitleaks git \. /);
assert.match(sec,/--redact=100/);
assert.match(sec,/fetch-depth: 0/);
assert.doesNotMatch(sec,/\bdeploy-pages\b|\bgh pr merge\b|\bgit push\b|supabase\/cli|\bservice_role\b/);
assert.match(sec,/contents: read/);
assert.doesNotMatch(sec,/\bpush:\s*\n/,'security scan must not create additional push-triggered release jobs');

for(const path of ['app.js','shell.js','sw.js','index.source.html','index.html','version.json'])
 assert.ok(fs.existsSync(path),'existing runtime remains in place: '+path);
console.log('CHAT-QW-V02: cross-browser QA, safe CodeQL/Gitleaks scan and no deployment ownership PASS');
