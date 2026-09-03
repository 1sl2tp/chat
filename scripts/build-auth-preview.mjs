import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
execFileSync('tsc', ['-p', resolve(root, 'tsconfig.local.json'), '--outDir', resolve(root, '.local-build')], { stdio: 'inherit' });
const css = ['tokens.css', 'layout.css', 'ui.css'].map((name) => readFileSync(resolve(root, 'src/styles', name), 'utf8')).join('\n');
const gate = readFileSync(resolve(root, '.local-build/auth/auth-gate.js'), 'utf8').replace('export class AuthGate', 'class AuthGate');
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"><meta name="theme-color" content="#020617"><title>TAPHOA AUTH GATE V3.2 PREVIEW</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>${css}</style></head><body><div id="preview-root"></div><script>${gate}\nconst root=document.getElementById('preview-root');root.style.width='100%';root.style.height='100%';const gateView=new AuthGate({onGuest:async()=>{},onLogin:async()=>{}});root.append(gateView.root);document.documentElement.dataset.appReady='true';<\/script></body></html>`;
writeFileSync(resolve(root, 'dist/TAPHOA_AUTH_GATE_V3_2_PREVIEW.html'), html);
console.log('AUTH_PREVIEW=PASS');
