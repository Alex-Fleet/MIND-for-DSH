#!/usr/bin/env node
/**
 * Deployment health check for the MIND profile entry.
 *
 * A `link:` install is resolved through the profile's pnpm lockfile. If the
 * repository moves and the lockfile is not updated, the next plugin install
 * (`pnpm add`) re-materialises the old path, the bundle stops resolving, and
 * the DSH plugin manager silently drops it from `dsh.profile.bundles` on the
 * next reconcile. This script makes that state visible and, with `--fix`,
 * repairs the three places involved.
 *
 * Read-only by default. `--fix` writes only inside the DSH profile directory
 * (package.json, pnpm-lock.yaml, node_modules/mind-dsh) and keeps a timestamped
 * backup of the two JSON/YAML files it edits.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const fix = argv.includes('--fix')
const profileArg = argv.find(arg => arg.startsWith('--profile='))
const profileName = profileArg === undefined ? 'desktop' : profileArg.slice('--profile='.length)
const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
  ? path.join(os.homedir(), '.dsh')
  : path.resolve(process.env.DSH_HOME)
const profileDir = path.resolve(dshHome, 'profiles', profileName)
const manifestPath = path.join(profileDir, 'package.json')
const lockfilePath = path.join(profileDir, 'pnpm-lock.yaml')
const linkPath = path.join(profileDir, 'node_modules', 'mind-dsh')

const failures = []
const warnings = []
const notes = []
let repaired = false

function pass(message) {
  console.log(`  ok    ${message}`)
}
function warn(message) {
  warnings.push(message)
  console.log(`  warn  ${message}`)
}
function fail(message) {
  failures.push(message)
  console.log(`  FAIL  ${message}`)
}
function note(message) {
  notes.push(message)
  console.log(`  note  ${message}`)
}

function realpathOrNull(target) {
  try {
    return fs.realpathSync(target)
  } catch {
    return null
  }
}

function atomicWrite(target, content) {
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temp, target)
}

function backup(target) {
  if (!fs.existsSync(target)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const copy = `${target}.bak-${stamp}`
  fs.copyFileSync(target, copy)
  return copy
}

function parseLocalSpec(spec, baseDir) {
  const match = /^(?:link|file):(.*)$/s.exec(spec)
  if (match === null) return null
  const raw = match[1].replace(/^~(?=$|[\\/])/, os.homedir())
  return path.resolve(baseDir, raw)
}

console.log(`MIND deployment doctor`)
console.log(`  repo      ${repoRoot}`)
console.log(`  profile   ${profileDir}`)
console.log(`  mode      ${fix ? 'fix' : 'read-only'}`)
console.log('')

if (!fs.existsSync(profileDir)) {
  fail(`profile directory not found: ${profileDir}`)
  finish()
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  pass(`profile manifest is valid JSON: ${manifestPath}`)
} catch (error) {
  fail(`cannot read profile manifest: ${error instanceof Error ? error.message : String(error)}`)
  finish()
  process.exit(1)
}

const bundles = manifest?.dsh?.profile?.bundles
if (!Array.isArray(bundles)) {
  fail('dsh.profile.bundles is missing or not an array')
} else if (bundles.includes('mind-dsh')) {
  pass('dsh.profile.bundles includes mind-dsh')
} else {
  fail('dsh.profile.bundles does NOT include mind-dsh (plugin will not load on restart)')
}

const dependency = manifest?.dependencies?.['mind-dsh']
const localSpec = typeof dependency === 'string' ? parseLocalSpec(dependency, profileDir) : null
if (typeof dependency !== 'string') {
  fail('dependencies["mind-dsh"] is missing')
} else if (localSpec === null) {
  pass(`dependencies["mind-dsh"] uses a package spec: ${dependency}`)
} else if (realpathOrNull(localSpec) === repoRoot) {
  pass('dependencies["mind-dsh"] points at this checkout')
} else {
  fail(`dependencies["mind-dsh"] points elsewhere: ${dependency} -> ${localSpec ?? '(unresolvable)'}`)
}

const linkReal = realpathOrNull(linkPath)
if (linkReal === null) {
  fail(`node_modules/mind-dsh is missing or a dangling link: ${linkPath}`)
} else if (localSpec !== null && linkReal !== repoRoot) {
  fail(`node_modules/mind-dsh resolves to ${linkReal}, expected ${repoRoot}`)
} else {
  pass(`node_modules/mind-dsh resolves to ${localSpec === null ? 'the installed package copy' : 'this checkout'}`)
}

if (linkReal !== null) {
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(linkReal, 'package.json'), 'utf8'))
    if (installed.name !== 'mind-dsh') {
      fail(`installed package name is ${String(installed.name)}, expected mind-dsh`)
    } else {
      pass(`installed package is ${installed.name}@${String(installed.version)}`)
    }
    const patch = installed?.dsh?.bundle?.patch
    if (typeof patch !== 'string') {
      fail('installed package declares no dsh.bundle.patch')
    } else if (!fs.existsSync(path.resolve(linkReal, patch))) {
      fail(`dsh.bundle.patch points at a missing file: ${patch}`)
    } else {
      pass(`dsh.bundle.patch is present: ${patch}`)
    }
    const nestedHost = path.join(linkReal, 'node_modules', '@deepseek-ai')
    if (fs.existsSync(nestedHost)) {
      fail('installed copy carries its own @deepseek-ai packages under node_modules; they shadow the host versions (install a build that ships lib instead of running prepare)')
    } else {
      pass('installed copy carries no nested @deepseek-ai packages')
    }
  } catch (error) {
    fail(`cannot read installed package manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (fs.existsSync(lockfilePath)) {
  const lock = fs.readFileSync(lockfilePath, 'utf8')
  const block = /^\s{2,}mind-dsh:\n((?:\s{4,}.*\n?)*)/m.exec(lock)
  if (block === null) {
    warn('pnpm-lock.yaml has no mind-dsh entry; the next pnpm install will re-resolve it')
  } else {
    const body = block[1]
    const spec = /specifier:\s*(.+)$/m.exec(body)?.[1]?.trim()
    const version = /version:\s*(.+)$/m.exec(body)?.[1]?.trim()
    if (spec === undefined || version === undefined) {
      warn('pnpm-lock.yaml mind-dsh entry is incomplete')
    } else if (dependency !== undefined && spec !== dependency) {
      fail(`pnpm-lock.yaml specifier is stale: ${spec}`)
    } else {
      pass('pnpm-lock.yaml specifier matches package.json')
    }
    if (version !== undefined) {
      const versionTarget = parseLocalSpec(version, profileDir)
      if (versionTarget !== null && realpathOrNull(versionTarget) !== repoRoot) {
        fail(`pnpm-lock.yaml version resolves elsewhere: ${version} -> ${versionTarget ?? '(unresolvable)'}`)
      }
    }
  }
} else {
  warn(`pnpm-lock.yaml not found: ${lockfilePath}`)
}

const libIndex = path.join(repoRoot, 'lib', 'index.js')
if (!fs.existsSync(libIndex)) {
  fail('lib/index.js is missing; run `npm run build`')
} else {
  let newestSource = 0
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        newestSource = Math.max(newestSource, fs.statSync(full).mtimeMs)
      }
    }
  }
  walk(path.join(repoRoot, 'src'))
  if (newestSource > fs.statSync(libIndex).mtimeMs) {
    warn('src/ is newer than lib/index.js; run `npm run build` before restarting')
  } else {
    pass('lib/index.js is up to date with src/')
  }
}

if (fix) {
  console.log('')
  console.log('repairing…')
  let changed = false

  if (localSpec !== null && realpathOrNull(linkPath) !== repoRoot) {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    fs.rmSync(linkPath, { force: true })
    fs.symlinkSync(repoRoot, linkPath)
    console.log(`  fixed  relinked node_modules/mind-dsh -> ${repoRoot}`)
    changed = true
  } else if (localSpec === null && realpathOrNull(linkPath) === null) {
    console.log('  skip   node_modules/mind-dsh is missing; reinstall it from its package source')
  }

  if (localSpec === null && realpathOrNull(linkPath) !== null) {
    // A package copy can inherit a nested node_modules from an older build
    // (`prepare` installs devDependencies inside the package). Those copies
    // shadow the host's @deepseek-ai packages, so drop them.
    const nestedDir = path.join(linkPath, 'node_modules')
    if (fs.existsSync(path.join(nestedDir, '@deepseek-ai'))) {
      fs.rmSync(nestedDir, { recursive: true, force: true })
      console.log('  fixed  removed nested node_modules from the installed copy')
      changed = true
    }
  }

  if (Array.isArray(bundles) && !bundles.includes('mind-dsh')) {
    const copy = backup(manifestPath)
    const index = bundles.findIndex(name => name === '@deepseek-ai/dsh-experimental-voice-input-bundle')
    const next = [...bundles]
    next.splice(index < 0 ? next.length : index, 0, 'mind-dsh')
    manifest.dsh.profile.bundles = next
    atomicWrite(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    console.log(`  fixed  added mind-dsh to dsh.profile.bundles${copy === null ? '' : ` (backup ${copy})`}`)
    changed = true
  }

  if (fs.existsSync(lockfilePath) && typeof dependency === 'string' && dependency.startsWith('link:')) {
    const before = fs.readFileSync(lockfilePath, 'utf8')
    const blockPattern = /(^\s{2,}mind-dsh:\n\s{4,}specifier:\s*).*?(\n\s{4,}version:\s*).*?$/m
    const relative = `link:${path.relative(profileDir, repoRoot)}`
    if (blockPattern.test(before)) {
      const after = before.replace(blockPattern, `$1${dependency}$2${relative}`)
      if (after !== before) {
        const copy = backup(lockfilePath)
        atomicWrite(lockfilePath, after)
        console.log(`  fixed  updated pnpm-lock.yaml mind-dsh entry${copy === null ? '' : ` (backup ${copy})`}`)
        changed = true
      }
    }
  }

  if (!changed) console.log('  (nothing to repair)')
  repaired = changed
  console.log('')
  console.log('restart DSH, then run this script again.')
}

finish()

function finish() {
  console.log('')
  if (fix && repaired && failures.length > 0) {
    console.log(`RESULT: repairs applied (${failures.length} pre-fix failure(s)); restart DSH and rerun to verify`)
    process.exitCode = 0
  } else if (failures.length > 0) {
    console.log(`RESULT: ${failures.length} failure(s), ${warnings.length} warning(s)`)
    if (!fix) console.log('Run with --fix to repair the profile state.')
    process.exitCode = 1
  } else if (warnings.length > 0) {
    console.log(`RESULT: healthy with ${warnings.length} warning(s)`)
  } else {
    console.log('RESULT: healthy')
  }
  if (notes.length > 0) {
    for (const note of notes) console.log(`note: ${note}`)
  }
}
