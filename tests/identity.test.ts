import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { resolveWorkspace } from '../src/identity/workspace.js'

const cleanup: string[] = []

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-id-'))
  cleanup.push(root)
  const store = new Store(path.join(root, 'mind.db'))
  const ws = path.join(root, 'ws')
  fs.mkdirSync(ws)
  fs.writeFileSync(path.join(ws, 'a.txt'), 'a')
  return { root, store, ws }
}

describe('workspace identity', () => {
  it('keeps identity across rename and same-volume move', () => {
    const { root, store, ws } = setup()
    const first = resolveWorkspace(store, ws)
    expect(first.created).toBe(true)

    const renamed = path.join(root, 'ws-renamed')
    fs.renameSync(ws, renamed)
    const second = resolveWorkspace(store, renamed)
    expect(second.workspaceId).toBe(first.workspaceId)
    expect(second.created).toBe(false)

    const category = path.join(root, 'category')
    fs.mkdirSync(category)
    const moved = path.join(category, 'ws-renamed')
    fs.renameSync(renamed, moved)
    const third = resolveWorkspace(store, moved)
    expect(third.workspaceId).toBe(first.workspaceId)
    store.close()
  })

  it('forks when the original path still exists (copy)', () => {
    const { root, store, ws } = setup()
    const first = resolveWorkspace(store, ws)

    const copy = path.join(root, 'ws-copy')
    fs.cpSync(ws, copy, { recursive: true })
    const copied = resolveWorkspace(store, copy)

    expect(copied.workspaceId).not.toBe(first.workspaceId)
    expect(copied.created).toBe(true)

    const original = resolveWorkspace(store, ws)
    expect(original.workspaceId).toBe(first.workspaceId)
    store.close()
  })

  it('uses a marker after the original path disappears', () => {
    const { root, store, ws } = setup()
    const first = resolveWorkspace(store, ws, { writeMarker: true })
    expect(fs.existsSync(path.join(ws, '.mind', 'workspace-id'))).toBe(true)

    const copy = path.join(root, 'ws-copy')
    fs.cpSync(ws, copy, { recursive: true })
    fs.rmSync(ws, { recursive: true, force: true })

    const moved = resolveWorkspace(store, copy)
    expect(moved.workspaceId).toBe(first.workspaceId)
    expect(moved.confidence).toBe('marker')
    store.close()
  })

  it('does not silently rebind an unrelated inode', () => {
    const { root, store, ws } = setup()
    const first = resolveWorkspace(store, ws)

    const other = path.join(root, 'other')
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, 'b.txt'), 'b')
    const second = resolveWorkspace(store, other)

    expect(second.workspaceId).not.toBe(first.workspaceId)
    store.close()
  })
})
