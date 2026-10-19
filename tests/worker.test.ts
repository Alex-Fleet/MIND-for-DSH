import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TurnBuffer } from '../src/capture/buffer.js'
import { safeTurnFileName, localDateOf } from '../src/capture/worker.js'
import { CaptureWorker } from '../src/capture/worker.js'
import { resolveConfig } from '../src/config.js'
import { Store } from '../src/db/store.js'

const cleanup: string[] = []

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-worker-'))
  cleanup.push(dir)
  const config = resolveConfig({ mindRoot: dir })
  const store = new Store(path.join(dir, 'mind.db'))
  const worker = new CaptureWorker(store, config)
  return { dir, config, store, worker }
}

const session = { id: 'session-1', header: { cwd: '/tmp/workspace' } }

describe('CaptureWorker', () => {
  it('writes a readable raw turn and completes its job', async () => {
    const { dir, store, worker } = setup()
    const buffer = new TurnBuffer()

    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T01:00:00Z'), data: { turn: 1 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T01:00:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'hello' },
    })
    buffer.push(session, {
      type: 'tool/result',
      time: Date.parse('2026-10-19T01:00:02Z'),
      data: { message: { role: 'tool', content: [{ type: 'text', text: 'y'.repeat(3000) }] } },
    })
    const finished = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T01:00:03Z'),
      data: { turn: 1, reason: { kind: 'completed' } },
    })!

    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    expect(store.countTurns()).toBe(1)
    expect(store.listJobs('done')).toHaveLength(1)

    const rawPath = path.join(
      dir,
      'projects',
      'ws1',
      'turns',
      localDateOf(finished.startedAt),
      `${safeTurnFileName(finished)}.md`,
    )
    expect(fs.existsSync(rawPath)).toBe(true)
    const content = fs.readFileSync(rawPath, 'utf8')
    expect(content).toContain('hello')
    expect(content).toContain('## 用户')

    const tooLong = content.split('\n').filter(line => line.length > 800)
    expect(tooLong).toHaveLength(0)

    const eventsPath = rawPath.replace(/\.md$/, '.events.jsonl')
    expect(fs.existsSync(eventsPath)).toBe(true)
    expect(fs.readFileSync(eventsPath, 'utf8')).toContain('"type":"user/message"')
    const row = store.getTurn('session-1:1')
    expect(row?.raw_chars).toBe(content.length)
    expect(row?.raw_events_rel_path).toBe(
      path.relative(dir, eventsPath).split(path.sep).join('/'),
    )

    // The fallback index and day view exist before any LLM summary runs.
    expect(store.getTurnIndex('session-1:1')?.status).toBe('unsummarized')
    expect(store.getTurnIndex('session-1:1')?.title).toBe('hello')
    expect(store.listDaysInMonth('ws1', localDateOf(finished.startedAt).slice(0, 7))).toHaveLength(1)

    worker.dispose()
    store.close()
  })

  it('ingests the same turn idempotently without duplicating events or JSONL', async () => {
    const { dir, store, worker } = setup()
    const buffer = new TurnBuffer()
    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T03:00:00Z'), data: { turn: 7 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T03:00:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'idempotent' },
    })
    const finished = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T03:00:02Z'),
      data: { turn: 7, reason: { kind: 'completed' } },
    })!

    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    expect(store.countTurns()).toBe(1)
    expect(store.countTurnEvents('session-1:7')).toBe(finished.events.length)
    const machine = path.join(dir, 'projects', 'ws1', 'index', `${localDateOf(finished.startedAt)}.jsonl`)
    expect(fs.readFileSync(machine, 'utf8').trim().split('\n')).toHaveLength(1)
    worker.dispose()
    store.close()
  })

  it('does not write durable memory when the summary marks the turn as not worth remembering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-worth-'))
    cleanup.push(dir)
    const config = resolveConfig({ mindRoot: dir })
    const store = new Store(path.join(dir, 'mind.db'))
    const worker = new CaptureWorker(store, config, async () => ({
      title: 'greeting',
      conclusion: 'hello',
      topics: [],
      durable: [{ layer: 'project', title: 'should not persist', conclusion: 'x' }],
      worthRemembering: false,
    }))
    const buffer = new TurnBuffer()
    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T04:00:00Z'), data: { turn: 1 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T04:00:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'hi' },
    })
    const finished = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T04:00:02Z'),
      data: { turn: 1, reason: { kind: 'completed' } },
    })!

    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    expect(store.listCognitionEntries('ws1', 'project')).toHaveLength(0)
    expect(store.listProposalsPage('pending', 10)).toHaveLength(0)
    expect(store.getTurnIndex('session-1:1')?.status).toBe('current')
    worker.dispose()
    store.close()
  })

  it('keeps retrying a failed summary and keeps the turn visible', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-retry-'))
    cleanup.push(dir)
    const config = resolveConfig({ mindRoot: dir })
    const store = new Store(path.join(dir, 'mind.db'))
    const worker = new CaptureWorker(store, config, async () => null)
    const buffer = new TurnBuffer()

    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T02:00:00Z'), data: { turn: 1 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T02:00:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'retry me' },
    })
    const finished = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T02:00:02Z'),
      data: { turn: 1, reason: { kind: 'completed' } },
    })!

    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    const jobs = store.listJobs('pending')
    expect(jobs).toHaveLength(1)
    expect(Number(jobs[0]?.attempts)).toBe(1)
    expect(store.listJobs('dead')).toHaveLength(0)
    expect(store.getTurnIndex('session-1:1')?.status).toBe('unsummarized')
    expect(store.listDaysInMonth('ws1', localDateOf(finished.startedAt).slice(0, 7))).toHaveLength(1)

    worker.dispose()
    store.close()
  })

  it('handles two sessions concurrently without mixing turns', async () => {
    const { store, worker } = setup()
    const buffer = new TurnBuffer()
    const a = { id: 'session-a', header: { cwd: '/tmp/a' } }
    const b = { id: 'session-b', header: { cwd: '/tmp/b' } }

    for (const [sessionLike, word] of [[a, 'alpha'], [b, 'beta']] as const) {
      buffer.push(sessionLike, { type: 'turn/start', time: 1000, data: { turn: 1 } })
      buffer.push(sessionLike, { type: 'user/message', time: 1001, data: { role: 'user', content: word } })
    }
    const doneA = buffer.push(a, { type: 'turn/end', time: 1002, data: { turn: 1, reason: { kind: 'completed' } } })!
    const doneB = buffer.push(b, { type: 'turn/end', time: 1003, data: { turn: 1, reason: { kind: 'completed' } } })!

    worker.enqueue(doneA, { workspaceId: 'ws-a', rootId: 'default' })
    worker.enqueue(doneB, { workspaceId: 'ws-b', rootId: 'default' })
    await worker.flush()

    expect(store.countTurns()).toBe(2)
    expect(store.getTurn('session-a:1')?.workspace_id).toBe('ws-a')
    expect(store.getTurn('session-b:1')?.workspace_id).toBe('ws-b')
    worker.dispose()
    store.close()
  })
})
