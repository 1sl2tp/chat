import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'assets/js'), { recursive: true });
mkdirSync(resolve(dist, 'styles'), { recursive: true });
execFileSync('tsc', ['-p', resolve(root, 'tsconfig.local.json'), '--outDir', resolve(dist, 'assets/js')], { stdio: 'inherit' });
for (const name of ['tokens.css', 'layout.css', 'ui.css']) {
  cpSync(resolve(root, 'src/styles', name), resolve(dist, 'styles', name));
}
if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), dist, { recursive: true });
let html = readFileSync(resolve(root, 'index.html'), 'utf8');
html = html
  .replaceAll('/src/styles/tokens.css', './styles/tokens.css')
  .replaceAll('/src/styles/layout.css', './styles/layout.css')
  .replaceAll('/src/styles/ui.css', './styles/ui.css')
  .replaceAll('/src/main.ts', './assets/js/main.js')
  .replaceAll('href="/manifest.webmanifest"', 'href="./manifest.webmanifest"')
  .replaceAll('href="/icons/', 'href="./icons/');
writeFileSync(resolve(dist, 'index.html'), html);
console.log(`Built static dist at ${dist}`);
