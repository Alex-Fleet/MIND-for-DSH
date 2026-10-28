import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { displayWorkspaceName, syncDshWorkspaceNames } from '../src/identity/dsh-names.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('syncDshWorkspaceNames', () => {
  it('uses the DSH title and localizes the automatic default name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-names-'))
    dirs.push(dir)
    const store = new Store(path.join(dir, 'mind.db'))
    store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'default-workspace' })
    store.recordPath('ws1', '/project/one')

    syncDshWorkspaceNames(store, [{ path: '/project/one', title: 'default-workspace' }])
    expect(store.getWorkspaceIdentity('ws1')?.display_name).toBe('default-workspace')
    expect(displayWorkspaceName('default-workspace', 'zh-CN')).toBe('默认工作区')
    expect(displayWorkspaceName('default-workspace', 'en-US')).toBe('Default Workspace')

    syncDshWorkspaceNames(store, [{ path: '/project/one', title: '改名后的项目' }])
    expect(store.getWorkspaceIdentity('ws1')?.display_name).toBe('改名后的项目')
    store.close()
  })
})
