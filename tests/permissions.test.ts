import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { savePersistedSettings } from '../src/config.js'
import { Store } from '../src/db/store.js'
import { hardenDirectoryTree } from '../src/security/permissions.js'
import { rebuildDayIndex } from '../src/views/navigation.js'

const cleanup: string[] = []

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function mode(target: string): number {
  return fs.statSync(target).mode & 0o777
}

describe('file permissions', () => {
  it('keeps the database and its WAL/SHM companions private', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-perms-'))
    cleanup.push(dir)
    const mindRoot = path.join(dir, 'mind')
    const store = new Store(path.join(mindRoot, 'mind.db'))
    store.ensureRoot('default', mindRoot)

    expect(mode(mindRoot)).toBe(0o700)
    expect(mode(path.join(mindRoot, 'mind.db'))).toBe(0o600)
    for (const suffix of ['-wal', '-shm']) {
      const file = path.join(mindRoot, `mind.db${suffix}`)
      if (fs.existsSync(file)) expect(mode(file)).toBe(0o600)
    }
    store.close()
  })

  it('writes settings and navigation views as 0600', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-perms-'))
    cleanup.push(dir)
    const store = new Store(path.join(dir, 'mind.db'))
    savePersistedSettings(dir, { captureEnabled: true })
    expect(mode(path.join(dir, 'settings.json'))).toBe(0o600)

    const view = rebuildDayIndex(store, dir, 'ws1', '2026-10-19', 'default')
    expect(mode(path.join(dir, view.reportRelPath))).toBe(0o600)
    store.close()
  })

  it('hardens MIND directories and old files without touching unrelated directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-perms-'))
    cleanup.push(dir)
    const nested = path.join(dir, 'projects', 'old', 'turns')
    fs.mkdirSync(nested, { recursive: true, mode: 0o755 })
    fs.chmodSync(nested, 0o755)
    fs.chmodSync(path.join(dir, 'projects'), 0o755)
    const oldFile = path.join(nested, 'old.md')
    fs.writeFileSync(oldFile, 'old', { mode: 0o644 })
    fs.chmodSync(oldFile, 0o644)

    const unrelated = path.join(dir, 'other')
    fs.mkdirSync(unrelated, { mode: 0o755 })
    fs.chmodSync(unrelated, 0o755)

    hardenDirectoryTree(dir)
    expect(mode(path.join(dir, 'projects'))).toBe(0o700)
    expect(mode(nested)).toBe(0o700)
    expect(mode(oldFile)).toBe(0o600)
    expect(mode(unrelated)).toBe(0o755)
  })

  it('does not follow an owned-directory symlink into an unrelated tree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-perms-'))
    cleanup.push(dir)
    const unrelated = path.join(dir, 'unrelated')
    fs.mkdirSync(path.join(unrelated, 'inner'), { recursive: true, mode: 0o755 })
    fs.chmodSync(unrelated, 0o755)
    fs.chmodSync(path.join(unrelated, 'inner'), 0o755)
    const file = path.join(unrelated, 'keep.txt')
    fs.writeFileSync(file, 'keep', { mode: 0o644 })
    fs.chmodSync(file, 0o644)
    fs.symlinkSync(unrelated, path.join(dir, 'projects'), 'dir')

    hardenDirectoryTree(dir)
    expect(mode(unrelated)).toBe(0o755)
    expect(mode(path.join(unrelated, 'inner'))).toBe(0o755)
    expect(mode(file)).toBe(0o644)
  })
})
