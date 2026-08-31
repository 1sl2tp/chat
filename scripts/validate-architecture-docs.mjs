import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const operationalDocs = [
  'docs/PROJECT_STATE.md',
  'docs/REPAIR_MAP.md',
  'docs/REGION_REGISTRY.md',
  'docs/MOBILE_CONTRACT.md',
  'docs/CHANGE_TRACE.md',
]
const registryPath = 'docs/region-registry.json'
const failures = []

function read(relativePath) {
  const absolute = resolve(root, relativePath)
  if (!existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

for (const path of operationalDocs) read(path)
const registryRaw = read(registryPath)

for (const path of operationalDocs) {
  const content = read(path)
  if (/\b(?:TBD|TODO)\b|\?\?\?/i.test(content)) {
    failures.push(`Placeholder marker found in ${path}`)
  }
}

let registry = []
try {
  registry = JSON.parse(registryRaw)
  if (!Array.isArray(registry)) throw new Error('registry root must be an array')
} catch (error) {
  failures.push(`Invalid ${registryPath}: ${error instanceof Error ? error.message : String(error)}`)
}

const idPattern = /^[A-Z0-9_]+(?:\/[A-Z0-9_]+)*$/
const ids = new Set()

for (const entry of registry) {
  if (!entry || typeof entry !== 'object') {
    failures.push('Region registry contains a non-object entry')
    continue
  }
  const { id, parent, owner, geometryOwner, stateOwner } = entry
  if (typeof id !== 'string' || !idPattern.test(id)) {
    failures.push(`Invalid Region ID: ${String(id)}`)
    continue
  }
  if (ids.has(id)) failures.push(`Duplicate Region ID: ${id}`)
  ids.add(id)
  if (parent !== null && typeof parent !== 'string') {
    failures.push(`Invalid parent for ${id}`)
  }
  for (const [field, value] of [['owner', owner], ['geometryOwner', geometryOwner], ['stateOwner', stateOwner]]) {
    if (value === null) continue
    if (typeof value !== 'string' || !value) {
      failures.push(`Invalid ${field} for ${id}`)
      continue
    }
    if (!existsSync(resolve(root, value))) {
      failures.push(`Missing ${field} path for ${id}: ${value}`)
    }
  }
}

for (const entry of registry) {
  if (entry?.parent && !ids.has(entry.parent)) {
    failures.push(`Missing parent ${entry.parent} for ${entry.id}`)
  }
}

if (!ids.has('APP')) failures.push('Region registry must contain APP root')

const registryDoc = read('docs/REGION_REGISTRY.md')
for (const id of ids) {
  if (!registryDoc.includes(`\`${id}\``)) failures.push(`REGION_REGISTRY.md does not mention ${id}`)
}

const mobile = read('docs/MOBILE_CONTRACT.md')
for (const gate of ['iOS / browser', 'iOS / standalone', 'Android / browser', 'Android / standalone']) {
  if (!mobile.includes(gate)) failures.push(`Missing mobile runtime gate: ${gate}`)
}

const repairMap = read('docs/REPAIR_MAP.md')
for (const owner of ['src/identity/', 'src/viewport/', 'src/media/', 'src/pwa/']) {
  if (!repairMap.includes(owner)) failures.push(`Repair map missing canonical owner: ${owner}`)
}

if (failures.length > 0) {
  console.error('Architecture documentation validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Architecture docs OK: ${registry.length} regions, 4 mobile runtime gates.`)
}
