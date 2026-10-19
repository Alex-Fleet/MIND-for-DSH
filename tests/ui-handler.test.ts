import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig, type PersistedSettings } from '../src/config.js'
import { Store } from '../src/db/store.js'
import { handleUiRequest, type UiDeps } from '../src/ui/handler.js'

const dirs: string[] = []

function makeDeps(): UiDeps {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-ui-'))
  dirs.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  store.ensureRoot('default', dir)
  const config = resolveConfig({ mindRoot: dir })
  const saved: PersistedSettings[] = []
  return { store, config, saveSettings: settings => saved.push(settings) }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

async function value<T>(result: Awaited<ReturnType<typeof handleUiRequest>>): Promise<T> {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result.value as T
}

function seedDay(deps: UiDeps, date: string, title: string): void {
  deps.store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
  deps.store.upsertDayIndex({
    workspaceId: 'ws1',
    localDate: date,
    title,
    turnCount: 1,
    reportRelPath: `daily/${date}.md`,
    rootId: 'default',
    sourceTurnIds: [],
  })
}

describe('UI handler', () => {
  it('pages the timeline by (date, workspace) keyset', async () => {
    const deps = makeDeps()
    seedDay(deps, '2026-10-17', 'older')
    seedDay(deps, '2026-10-18', 'middle')
    seedDay(deps, '2026-10-19', 'newest')

    const first = await value<{ rows: Array<{ date: string }>; next: { date: string; workspaceId: string } | null }>(
      await handleUiRequest(deps, 'timeline', { limit: 2 }),
    )
    expect(first.rows.map(row => row.date)).toEqual(['2026-10-19', '2026-10-18'])
    expect(first.next).toEqual({ date: '2026-10-18', workspaceId: 'ws1' })

    const second = await value<{ rows: Array<{ date: string }>; next: unknown }>(
      await handleUiRequest(deps, 'timeline', { limit: 2, before: first.next }),
    )
    expect(second.rows.map(row => row.date)).toEqual(['2026-10-17'])
    expect(second.next).toBeNull()
    deps.store.close()
  })

  it('returns a day’s turns and pages raw text', async () => {
    const deps = makeDeps()
    seedDay(deps, '2026-10-19', 'today')
    deps.store.insertTurnAndJob(
      {
        turnId: 's1:1',
        workspaceId: 'ws1',
        sessionId: 's1',
        turnSeq: 1,
        origin: 'main',
        endReason: 'completed',
        occurredAt: '2026-10-19T01:00:00.000Z',
        localDate: '2026-10-19',
        rootId: 'default',
        rawRelPath: 'projects/ws1/turns/2026-10-19/s1--turn-1.md',
      },
      [],
    )
    deps.store.upsertTurnIndex({
      turnId: 's1:1',
      title: 'fix race',
      conclusion: 'introduced a queue',
      topics: ['race'],
      sourceRelPath: 'projects/ws1/turns/2026-10-19/s1--turn-1.md',
      rootId: 'default',
      occurredAt: '2026-10-19T01:00:00.000Z',
    })
    const target = path.join(deps.config.mindRoot, 'projects/ws1/turns/2026-10-19/s1--turn-1.md')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'abcdefghij', 'utf8')

    const day = await value<{ rows: Array<{ turnId: string; indexed: boolean }> }>(
      await handleUiRequest(deps, 'day', { workspaceId: 'ws1', date: '2026-10-19' }),
    )
    expect(day.rows).toHaveLength(1)
    expect(day.rows[0]?.turnId).toBe('s1:1')
    expect(day.rows[0]?.indexed).toBe(true)
    // A raw file without a user/assistant section has no preview; metadata
    // lines must never become a title.
    expect((day.rows[0] as { preview?: string | null }).preview).toBeNull()

    const chunk = await value<{ chunk: string; total: number; next: number | null }>(
      await handleUiRequest(deps, 'turn', { turnId: 's1:1', offset: 3, max: 4 }),
    )
    expect(chunk.chunk).toBe('defg')
    expect(chunk.total).toBe(10)
    expect(chunk.next).toBe(7)
    deps.store.close()
  })

  it('saves an entry as a new version and can disable it', async () => {
    const deps = makeDeps()
    deps.store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
    deps.store.upsertCognitionEntry({
      id: 'cog-1',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'old title',
      conclusion: 'old content',
      sourceRelPath: null,
      rootId: 'default',
    })

    const saved = await value<{ id: string; version: number }>(
      await handleUiRequest(deps, 'saveEntry', {
        id: 'cog-1',
        layer: 'rule',
        workspaceId: null,
        title: 'new title',
        content: '# heading\n\nbody',
        enabled: false,
      }),
    )
    expect(saved).toEqual({ id: 'cog-1', version: 2 })

    const current = await value<{ rows: Array<Record<string, unknown>> }>(
      await handleUiRequest(deps, 'current', { limit: 10 }),
    )
    expect(current.rows).toHaveLength(1)
    expect(current.rows[0]).toMatchObject({
      id: 'cog-1',
      title: 'new title',
      content: '# heading\n\nbody',
      enabled: false,
      workspaceId: null,
    })
    deps.store.close()
  })

  it('approves a proposal into an editable entry and rejects a second review', async () => {
    const deps = makeDeps()
    deps.store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
    deps.store.insertProposal({
      id: 'prop-1',
      workspaceId: 'ws1',
      layer: 'user',
      title: 'prefer terse replies',
      content: 'answer directly',
      sourceTurn: 's1:1',
    })

    const approved = await value<{ entryId: string | null }>(
      await handleUiRequest(deps, 'resolveProposal', { id: 'prop-1', action: 'approve' }),
    )
    expect(approved.entryId).toBe('cog-prop-1')
    expect(deps.store.listCognitionEntries('ws1', 'user')).toHaveLength(1)

    const twice = await handleUiRequest(deps, 'resolveProposal', { id: 'prop-1', action: 'approve' })
    expect(twice.ok).toBe(false)
    if (!twice.ok) expect(twice.error.code).toBe('conflict')
    deps.store.close()
  })

  it('persists settings and rejects malformed payloads', async () => {
    const deps = makeDeps()
    const saved: PersistedSettings[] = []
    deps.saveSettings = settings => saved.push(settings)

    const updated = await value<{ captureEnabled: boolean; injectEnabled: boolean }>(
      await handleUiRequest(deps, 'updateSettings', { captureEnabled: false }),
    )
    expect(updated.captureEnabled).toBe(false)
    expect(deps.config.captureEnabled).toBe(false)
    expect(saved.at(-1)).toEqual({ captureEnabled: false, injectEnabled: true })

    const bad = await handleUiRequest(deps, 'timeline', { limit: 99999 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('bad-request')

    const badDate = await handleUiRequest(deps, 'timeline', { before: { date: '2026-99-99', workspaceId: 'ws1' } })
    expect(badDate.ok).toBe(false)
    if (!badDate.ok) expect(badDate.error.code).toBe('bad-request')

    for (const endpoint of ['nope', 'constructor', 'toString']) {
      const unknown = await handleUiRequest(deps, endpoint, {})
      expect(unknown.ok).toBe(false)
      if (!unknown.ok) expect(unknown.error.code).toBe('not-found')
    }
    deps.store.close()
  })

  it('keeps omitted fields when editing an entry', async () => {
    const deps = makeDeps()
    deps.store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
    deps.store.createCognitionEntry({
      id: 'cog-keep',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'keep me',
      conclusion: 'body',
      enabled: false,
      rootId: 'default',
    })

    const saved = await value<{ id: string; version: number }>(
      await handleUiRequest(deps, 'saveEntry', { id: 'cog-keep', title: 'renamed' }),
    )
    expect(saved.version).toBe(2)
    expect(deps.store.getCognitionEntry('cog-keep')).toMatchObject({
      title: 'renamed',
      conclusion: 'body',
      enabled: 0,
      workspace_id: 'ws1',
      layer: 'rule',
    })
    deps.store.close()
  })
})
