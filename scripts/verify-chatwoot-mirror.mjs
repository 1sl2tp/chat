import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd())

const mirrors = [
  {
    target: 'vendor/chatwoot-mobile-ui',
    repository: 'chatwoot/chatwoot-mobile-app',
    license: 'MIT',
  },
  {
    target: 'vendor/chatwoot-web-ui',
    repository: 'chatwoot/chatwoot',
    license: 'MIT Expat',
  },
]

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

for (const mirror of mirrors) {
  const target = join(ROOT, mirror.target)
  const manifestPath = join(target, 'UPSTREAM.json')

  if (!existsSync(manifestPath)) {
    fail(`Missing ${mirror.target}/UPSTREAM.json`)
    continue
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.repository !== mirror.repository) {
    fail(`Unexpected upstream repository for ${mirror.target}`)
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.commit || '')) {
    fail(`Invalid upstream commit SHA for ${mirror.target}`)
  }
  if (manifest.license !== mirror.license) {
    fail(`Unexpected license for ${mirror.target}: ${manifest.license}`)
  }

  const listed = new Set()
  for (const entry of manifest.files || []) {
    listed.add(entry.path)
    const file = join(target, entry.path)
    if (!existsSync(file)) {
      fail(`Missing mirrored file: ${mirror.target}/${entry.path}`)
      continue
    }
    const actual = sha256(file)
    if (actual !== entry.sha256) fail(`SHA-256 mismatch: ${mirror.target}/${entry.path}`)
  }

  if (existsSync(target)) {
    for (const file of walk(target)) {
      const rel = relative(target, file).replaceAll('\\', '/')
      if (rel === 'UPSTREAM.json') continue
      if (!listed.has(rel)) fail(`Untracked mirrored file: ${mirror.target}/${rel}`)
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
    if (text.includes('vendor/chatwoot-mobile-ui') || text.includes('vendor/chatwoot-web-ui')) {
      fail(`Production source references vendor mirror: ${relative(ROOT, file)}`)
    }
  }
}

if (!process.exitCode) console.log('Chatwoot mirror verification PASS')
