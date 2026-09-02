import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const REPOSITORY = 'chatwoot/chatwoot-mobile-app'
const BRANCH = 'develop'
const COMMIT = process.env.CHATWOOT_COMMIT || '228a069c28f7ab8fdf0a59e22f7fa02e71d4ca10'
const ROOT = resolve(process.cwd())
const TARGET = join(ROOT, 'vendor/chatwoot-mobile-ui')
const temp = mkdtempSync(join(tmpdir(), 'chatwoot-ui-'))
const source = join(temp, 'source')

const roots = [
  'src/screens/chat-screen',
  'src/screens/conversations',
  'src/components-next',
  'src/theme',
  'src/svg-icons',
  'src/constants',
]

function run(command, args, cwd = ROOT) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
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

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

try {
  mkdirSync(source, { recursive: true })
  run('git', ['init', '--quiet'], source)
  run('git', ['remote', 'add', 'origin', `https://github.com/${REPOSITORY}.git`], source)
  run('git', ['fetch', '--quiet', '--depth', '1', 'origin', COMMIT], source)
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], source)

  const resolved = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()
  if (resolved !== COMMIT) throw new Error(`Resolved ${resolved}, expected ${COMMIT}`)
  const sourceCommitDate = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim()

  rmSync(TARGET, { recursive: true, force: true })
  mkdirSync(TARGET, { recursive: true })
  cpSync(join(source, 'LICENSE'), join(TARGET, 'LICENSE'))

  for (const root of roots) {
    const from = join(source, root)
    if (!existsSync(from)) throw new Error(`Missing upstream root: ${root}`)
    const to = join(TARGET, root)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true })
  }

  const files = walk(TARGET)
    .filter(file => !file.endsWith('UPSTREAM.json'))
    .map(file => ({
      path: relative(TARGET, file).replaceAll('\\', '/'),
      sha256: sha256(file),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const manifest = {
    repository: REPOSITORY,
    branch: BRANCH,
    commit: COMMIT,
    sourceCommitDate,
    license: 'MIT',
    mirroredRoots: roots,
    files,
  }

  writeFileSync(join(TARGET, 'UPSTREAM.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Mirrored ${files.length} Chatwoot UI files at ${COMMIT}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
