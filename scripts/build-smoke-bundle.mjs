import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '.smoke-build');
rmSync(out, { recursive: true, force: true });
execFileSync('tsc', ['-p', resolve(root, 'tsconfig.smoke.json')], { stdio: 'inherit' });
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js')) files.push(p);
  }
}
walk(out);
const entries = files.map((file) => {
  const id = relative(out, file).replaceAll('\\', '/');
  const code = readFileSync(file, 'utf8');
  return `${JSON.stringify(id)}: function(require,module,exports){\n${code}\n}`;
});
const bundle = `(function(){\nconst modules={${entries.join(',\n')}};\nconst cache={};\nfunction norm(path){const parts=[];for(const p of path.split('/')){if(!p||p==='.')continue;if(p==='..')parts.pop();else parts.push(p)}return parts.join('/')}\nfunction resolveId(parent,req){if(req.startsWith('.')){const base=parent.split('/').slice(0,-1).join('/');let id=norm(base+'/'+req);if(!id.endsWith('.js'))id+='.js';return id}return req}\nfunction load(id,parent='main.js'){id=resolveId(parent,id);if(cache[id])return cache[id].exports;const fn=modules[id];if(!fn)throw new Error('Missing module '+id+' from '+parent);const module={exports:{}};cache[id]=module;fn((req)=>load(req,id),module,module.exports);return module.exports}\nload('main.js','');\n})();`;
mkdirSync(dirname(resolve(root, 'tests/.smoke-bundle.js')), { recursive: true });
writeFileSync(resolve(root, 'tests/.smoke-bundle.js'), bundle);
console.log(`SMOKE_BUNDLE modules=${files.length}`);
