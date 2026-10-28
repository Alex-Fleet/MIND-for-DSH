import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'

const cleanup: string[] = []

function tempStore(): Store {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-store-'))
  cleanup.push(dir)
  return new Store(path.join(dir, 'mind.db'))
}

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const turn = {
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
  provider: null,
  model: null,
}

describe('Store', () => {
  it('inserts a turn and its pending job idempotently', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [{ kind: 'user/message', seq: 1, toolName: null, bytes: 10 }])
    store.insertTurnAndJob(turn, [{ kind: 'user/message', seq: 1, toolName: null, bytes: 10 }])

    expect(store.countTurns()).toBe(1)
    expect(store.listJobs('pending')).toHaveLength(1)
    expect(store.getTurn('s1:1')?.raw_rel_path).toBe(turn.rawRelPath)
    store.close()
  })

  it('claims, completes and records the outcome', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    const job = store.claimJob('owner', 60_000)
    expect(job?.turnId).toBe('s1:1')
    expect(job?.attempts).toBe(1)
    store.completeJob(job!.id)
    expect(store.listJobs('done')).toHaveLength(1)
    store.close()
  })

  it('recovers jobs whose lease has expired', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    store.claimJob('owner', 60_000)
    expect(store.listJobs('running')).toHaveLength(1)

    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    expect(store.recoverStaleJobs(future)).toBe(1)
    expect(store.listJobs('pending')).toHaveLength(1)
    store.close()
  })

  it('reschedules a failed job forever instead of marking it dead', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    const job = store.claimJob('owner', 60_000)!
    store.failJob(job.id, 'boom', '2000-01-01T00:00:00.000Z')
    expect(store.listJobs('pending')).toHaveLength(1)
    expect(store.listJobs('dead')).toHaveLength(0)
    const retry = store.claimJob('owner', 60_000)!
    store.failJob(retry.id, 'boom', '2000-01-01T00:00:00.000Z')
    expect(store.listJobs('pending')).toHaveLength(1)
    expect(store.listJobs('dead')).toHaveLength(0)
    store.close()
  })

  it('lists turns without an index and records the fallback status', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    expect(store.listMissingTurnIndexes(10)).toHaveLength(1)
    store.upsertTurnIndex({
      turnId: 's1:1',
      title: 'hello',
      conclusion: '',
      topics: [],
      status: 'unsummarized',
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    })
    expect(store.listMissingTurnIndexes(10)).toHaveLength(0)
    expect(store.getTurnIndex('s1:1')?.status).toBe('unsummarized')
    store.close()
  })

  it('searches the turn index and falls back to substring matching', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    store.upsertTurnIndex({
      turnId: 's1:1',
      title: '修复注入超时',
      conclusion: '根因是竞态',
      topics: ['注入'],
      sourceRelPath: 'projects/ws1/turns/2026-10-19/x.md',
      rootId: 'default',
      occurredAt: '2026-10-19T01:00:00.000Z',
    })

    const rows = store.searchTurnIndex('注入', 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('修复注入超时')
    expect(store.searchTurnIndex('不存在的词', 10)).toHaveLength(0)
    store.close()
  })

  it('commits turn, events, job and fallback index atomically and idempotently', () => {
    const store = tempStore()
    const events = [
      { kind: 'user/message', seq: 1, toolName: null, bytes: 10 },
      { kind: 'assistant/message', seq: 2, toolName: null, bytes: 20 },
    ]
    const index = {
      title: 'hello',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    }
    store.ingestTurn(turn, events, index)
    store.ingestTurn(turn, events, index)

    expect(store.countTurns()).toBe(1)
    expect(store.countTurnEvents('s1:1')).toBe(2)
    expect(store.listJobs('pending')).toHaveLength(1)
    expect(store.getTurnIndex('s1:1')?.title).toBe('hello')
    store.close()
  })

  it('rolls back the whole ingest when an event insert fails', () => {
    const store = tempStore()
    const bad = [{ kind: null as unknown as string, seq: null, toolName: null, bytes: 0 }]
    const index = {
      title: 'hello',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    }
    expect(() => store.ingestTurn(turn, bad, index)).toThrow()
    expect(store.getTurn('s1:1')).toBeUndefined()
    expect(store.countTurnEvents('s1:1')).toBe(0)
    expect(store.listJobs('pending')).toHaveLength(0)
    expect(store.getTurnIndex('s1:1')).toBeUndefined()
    store.close()
  })

  it('does not bump a cognition version when the content is unchanged', () => {
    const store = tempStore()
    const base = {
      id: 'rule-1',
      workspaceId: 'ws1',
      layer: 'rule' as const,
      title: 'rule',
      conclusion: 'content',
      sourceRelPath: null,
      rootId: 'default',
    }
    store.upsertCognitionEntry(base)
    const first = store.getCognitionEntry('rule-1')?.version
    store.upsertCognitionEntry(base)
    expect(store.getCognitionEntry('rule-1')?.version).toBe(first)
    store.upsertCognitionEntry({ ...base, conclusion: 'changed' })
    expect(store.getCognitionEntry('rule-1')?.version).toBe(Number(first) + 1)
    store.close()
  })

  it('tracks per-session watermarks without moving backwards', () => {
    const store = tempStore()
    store.setWatermark('s1', 10)
    store.setWatermark('s1', 5)
    expect(store.getWatermark('s1')).toBe(10)
    expect(store.getWatermark('missing')).toBeNull()
    store.close()
  })

  it('does not downgrade a completed summary on a duplicate ingest', () => {
    const store = tempStore()
    const fallback = {
      title: 'first line',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    }
    store.ingestTurn(turn, [], fallback)
    store.upsertTurnIndex({
      turnId: 's1:1',
      title: 'LLM TITLE',
      conclusion: 'LLM CONCLUSION',
      topics: ['topic'],
      status: 'current',
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    })

    store.ingestTurn(turn, [], fallback)

    const index = store.getTurnIndex('s1:1')
    expect(index?.status).toBe('current')
    expect(index?.title).toBe('LLM TITLE')
    expect(index?.conclusion).toBe('LLM CONCLUSION')
    store.close()
  })

  it('requeues dead jobs for turns still waiting for a summary', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    store.upsertTurnIndex({
      turnId: 's1:1',
      title: 'preview',
      conclusion: '',
      topics: [],
      status: 'unsummarized',
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    })
    const sqlite = (process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') })
      .getBuiltinModule('node:sqlite')
    const db = new sqlite.DatabaseSync(store.dbPath)
    db.exec("UPDATE capture_job SET state = 'dead'")
    db.close()

    expect(store.requeueSummaryFailures()).toBe(1)
    expect(store.listJobs('dead')).toHaveLength(0)
    expect(store.listJobs('pending')).toHaveLength(1)
    store.close()
  })

  it('never requeues a migrated turn whose legacy summary was invalid', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    store.upsertTurnIndex({
      turnId: 's1:1',
      title: 'preview',
      conclusion: '',
      topics: [],
      status: 'unsummarized',
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    })
    const sqlite = (process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') })
      .getBuiltinModule('node:sqlite')
    const db = new sqlite.DatabaseSync(store.dbPath)
    db.exec("UPDATE capture_job SET state = 'dead'")
    db.exec("UPDATE turn_index SET status = 'invalid'")
    db.close()

    expect(store.requeueSummaryFailures()).toBe(0)
    expect(store.listJobs('dead')).toHaveLength(1)
    store.close()
  })

  it('finds a workspace by its recorded historical path', () => {
    const store = tempStore()
    store.upsertWorkspaceIdentity({ workspaceId: 'ws-old', displayName: 'Old' })
    store.recordPath('ws-old', '/moved/away')
    expect(store.findWorkspaceByPath('/moved/away')?.workspace_id).toBe('ws-old')
    expect(store.findWorkspaceByPath('/unknown')).toBeUndefined()
    store.close()
  })

  it('keeps one path-history row per workspace and path', () => {
    const store = tempStore()
    store.upsertWorkspaceIdentity({ workspaceId: 'ws-old', displayName: 'Old' })
    store.recordPath('ws-old', '/same/path')
    store.recordPath('ws-old', '/same/path')
    const sqlite = (process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') })
      .getBuiltinModule('node:sqlite')
    const db = new sqlite.DatabaseSync(store.dbPath)
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM workspace_path_history WHERE workspace_id = ? AND path = ?')
      .get('ws-old', '/same/path') as { c: number }
    db.close()
    expect(row.c).toBe(1)
    store.close()
  })

  it('returns the most recent known model for a session', () => {
    const store = tempStore()
    store.insertTurnAndJob(
      { ...turn, turnId: 's1:1', turnSeq: 1, occurredAt: '2026-10-19T01:00:00.000Z', provider: 'p1', model: 'm1' },
      [],
    )
    store.insertTurnAndJob(
      { ...turn, turnId: 's1:2', turnSeq: 2, occurredAt: '2026-10-19T02:00:00.000Z', provider: 'p2', model: 'm2' },
      [],
    )
    expect(store.findLastTurnModel('s1')).toEqual({ provider: 'p2', model: 'm2' })
    expect(store.findLastTurnModel('missing')).toBeNull()
    store.close()
  })

  it('keeps the original model on a duplicate ingest', () => {
    const store = tempStore()
    const index = {
      title: 'hello',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    }
    store.ingestTurn({ ...turn, provider: 'p1', model: 'm1' }, [], index)
    store.ingestTurn({ ...turn, provider: 'p2', model: 'm2' }, [], index)
    expect(store.getTurn('s1:1')?.provider).toBe('p1')
    expect(store.getTurn('s1:1')?.model).toBe('m1')
    store.close()
  })

  it('corrects an orphan workspace on a later ingest', () => {
    const store = tempStore()
    const index = {
      title: 'hello',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: turn.rawRelPath,
      rootId: 'default',
      occurredAt: turn.occurredAt,
    }
    store.ingestTurn({ ...turn, workspaceId: 'orphan' }, [], index)
    store.ingestTurn({ ...turn, workspaceId: 'ws-real' }, [], index)
    expect(store.getTurn('s1:1')?.workspace_id).toBe('ws-real')
    store.close()
  })

  it('keeps pending job attempts and backoff across a requeue', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    const job = store.claimJob('owner', 60_000)!
    store.failJob(job.id, 'boom', '2030-01-01T00:00:00.000Z')
    const before = store.listJobs('pending')[0]
    expect(store.requeueSummaryFailures()).toBe(0)
    const after = store.listJobs('pending')[0]
    expect(after?.attempts).toBe(before?.attempts)
    expect(after?.next_at).toBe(before?.next_at)
    store.close()
  })
})
