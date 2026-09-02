import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const TARGET = join(ROOT, 'vendor/chatwoot-mobile-ui')
const manifestPath = join(TARGET, 'UPSTREAM.json')

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function walk(dir) {
  const output = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) output.push(...walk(full))
    else output.push(full)
  }
  return output
}

if (!existsSync(manifestPath)) {
  fail('Missing vendor/chatwoot-mobile-ui/UPSTREAM.json')
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.repository !== 'chatwoot/chatwoot-mobile-app') fail('Unexpected upstream repository')
  if (!/^[0-9a-f]{40}$/.test(manifest.commit || '')) fail('Invalid upstream commit SHA')
  if (manifest.license !== 'MIT') fail('Expected MIT license')

  const listed = new Set()
  for (const entry of manifest.files || []) {
    listed.add(entry.path)
    const file = join(TARGET, entry.path)
    if (!existsSync(file)) {
      fail(`Missing mirrored file: ${entry.path}`)
      continue
    }
    const actual = sha256(file)
    if (actual !== entry.sha256) fail(`SHA-256 mismatch: ${entry.path}`)
  }

  if (existsSync(TARGET)) {
    for (const file of walk(TARGET)) {
      const rel = relative(TARGET, file).replaceAll('\\', '/')
      if (rel === 'UPSTREAM.json') continue
      if (!listed.has(rel)) fail(`Untracked mirrored file: ${rel}`)
    }
  }
}

const srcRoot = join(ROOT, 'src')
if (existsSync(srcRoot)) {
  const productionFiles = walk(srcRoot).filter(
    file => /\.(ts|css)$/.test(file) && !/\.(test|spec)\.ts$/.test(file),
  )
  for (const file of productionFiles) {
    const text = readFileSync(file, 'utf8')
    if (text.includes('vendor/chatwoot-mobile-ui')) {
      fail(`Production source references vendor mirror: ${relative(ROOT, file)}`)
    }
  }
}

if (!process.exitCode) console.log('Chatwoot mirror verification PASS')
