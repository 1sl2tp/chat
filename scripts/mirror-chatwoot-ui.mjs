import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd())

const sources = [
  {
    repository: 'chatwoot/chatwoot-mobile-app',
    branch: 'develop',
    commit:
      process.env.CHATWOOT_MOBILE_COMMIT ||
      process.env.CHATWOOT_COMMIT ||
      '228a069c28f7ab8fdf0a59e22f7fa02e71d4ca10',
    license: 'MIT',
    target: 'vendor/chatwoot-mobile-ui',
    roots: [
      'src/screens/auth',
      'src/screens/chat-screen',
      'src/screens/conversations',
      'src/components-next',
      'src/theme',
      'src/svg-icons',
      'src/constants',
    ],
  },
  {
    repository: 'chatwoot/chatwoot',
    branch: 'develop',
    commit:
      process.env.CHATWOOT_WEB_COMMIT ||
      '9c7177005b3e2466f1de731da75192f8c9592e4b',
    license: 'MIT Expat',
    target: 'vendor/chatwoot-web-ui',
    roots: [
      'app/javascript/dashboard/components-next/call',
      'app/javascript/dashboard/components-next/Calls',
      'app/javascript/dashboard/components-next/button',
      'app/javascript/dashboard/components/widgets/conversation/ConversationCallButton.vue',
      'app/javascript/dashboard/components/widgets/conversation/VoiceCallStatus.vue',
      'app/javascript/dashboard/components/widgets/VideoCallButton.vue',
    ],
  },
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

function mirrorSource(config) {
  const temp = mkdtempSync(join(tmpdir(), 'chatwoot-ui-'))
  const source = join(temp, 'source')
  const target = join(ROOT, config.target)

  try {
    mkdirSync(source, { recursive: true })
    run('git', ['init', '--quiet'], source)
    run('git', ['remote', 'add', 'origin', `https://github.com/${config.repository}.git`], source)
    run('git', ['fetch', '--quiet', '--depth', '1', 'origin', config.commit], source)
    run('git', ['checkout', '--quiet', 'FETCH_HEAD'], source)

    const resolved = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: source,
      encoding: 'utf8',
    }).trim()
    if (resolved !== config.commit) {
      throw new Error(`Resolved ${resolved}, expected ${config.commit} for ${config.repository}`)
    }

    const sourceCommitDate = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: source,
      encoding: 'utf8',
    }).trim()

    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    cpSync(join(source, 'LICENSE'), join(target, 'LICENSE'))

    for (const root of config.roots) {
      const from = join(source, root)
      if (!existsSync(from)) throw new Error(`Missing upstream root: ${config.repository}:${root}`)
      const to = join(target, root)
      mkdirSync(dirname(to), { recursive: true })
      cpSync(from, to, { recursive: true })
    }

    const files = walk(target)
      .filter(file => !file.endsWith('UPSTREAM.json'))
      .map(file => ({
        path: relative(target, file).replaceAll('\\', '/'),
        sha256: sha256(file),
      }))
      .sort((a, b) => a.path.localeCompare(b.path))

    const manifest = {
      repository: config.repository,
      branch: config.branch,
      commit: config.commit,
      sourceCommitDate,
      license: config.license,
      mirroredRoots: config.roots,
      files,
    }

    writeFileSync(join(target, 'UPSTREAM.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Mirrored ${files.length} UI files from ${config.repository} at ${config.commit}`)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

for (const source of sources) mirrorSource(source)
