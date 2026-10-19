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

  it('fails a job back to pending and then to dead', () => {
    const store = tempStore()
    store.insertTurnAndJob(turn, [])
    const job = store.claimJob('owner', 60_000)!
    store.failJob(job.id, 'boom', '2000-01-01T00:00:00.000Z', false)
    expect(store.listJobs('pending')).toHaveLength(1)
    const retry = store.claimJob('owner', 60_000)!
    store.failJob(retry.id, 'boom', '2000-01-01T00:00:00.000Z', true)
    expect(store.listJobs('dead')).toHaveLength(1)
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

  it('tracks per-session watermarks without moving backwards', () => {
    const store = tempStore()
    store.setWatermark('s1', 10)
    store.setWatermark('s1', 5)
    expect(store.getWatermark('s1')).toBe(10)
    expect(store.getWatermark('missing')).toBeNull()
    store.close()
  })
})
