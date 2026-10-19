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

  it('uses the configured day boundary when choosing local_date', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-boundary-'))
    cleanup.push(dir)
    const config = resolveConfig({ mindRoot: dir, dayBoundaryMinutes: 0 })
    const store = new Store(path.join(dir, 'mind.db'))
    const worker = new CaptureWorker(store, config)
    const buffer = new TurnBuffer()

    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T16:30:00Z'), data: { turn: 1 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T16:30:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'after midnight' },
    })
    const finished = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T16:30:02Z'),
      data: { turn: 1, reason: { kind: 'completed' } },
    })!

    worker.enqueue(finished, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    expect(store.getTurn('session-1:1')?.local_date).toBe('2026-10-20')
    worker.dispose()
    store.close()
  })

  it('reuses the last request model for later turns without a header', async () => {
    const { store, worker } = setup()
    const buffer = new TurnBuffer()

    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T01:00:00Z'), data: { turn: 1 } })
    buffer.push(session, {
      type: 'request/header',
      time: Date.parse('2026-10-19T01:00:01Z'),
      data: { header: { config: { provider: 'provider-x', model: 'model-y' } } },
    })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T01:00:02Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'first' },
    })
    const first = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T01:00:03Z'),
      data: { turn: 1, reason: { kind: 'completed' } },
    })!

    buffer.push(session, { type: 'turn/start', time: Date.parse('2026-10-19T01:01:00Z'), data: { turn: 2 } })
    buffer.push(session, {
      type: 'user/message',
      time: Date.parse('2026-10-19T01:01:01Z'),
      data: { role: 'user', source: { kind: 'user' }, content: 'second' },
    })
    const second = buffer.push(session, {
      type: 'turn/end',
      time: Date.parse('2026-10-19T01:01:02Z'),
      data: { turn: 2, reason: { kind: 'completed' } },
    })!

    worker.enqueue(first, { workspaceId: 'ws1', rootId: 'default' })
    worker.enqueue(second, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()

    expect(store.getTurn('session-1:1')?.provider).toBe('provider-x')
    expect(store.getTurn('session-1:2')?.provider).toBe('provider-x')
    expect(store.getTurn('session-1:2')?.model).toBe('model-y')
    worker.dispose()
    store.close()
  })

  it('finds an orphan raw turn after more than the limit of existing files', () => {
    const { dir, store, worker } = setup()
    const localDate = '2026-10-19'
    const dateDir = path.join(dir, 'projects', 'ws1', 'turns', localDate)
    fs.mkdirSync(dateDir, { recursive: true })

    const writeRaw = (name: string, sessionId: string, turn: number): string => {
      const full = path.join(dateDir, name)
      fs.writeFileSync(
        full,
        [
          `# Turn ${sessionId} / #${turn}`,
          '',
          '- 开始: 2026-10-19T01:00:00.000Z',
          '- 结束: 2026-10-19T01:00:01.000Z',
          '- 结束原因: completed',
          '- 来源: main',
          '- 工作区: /tmp/ws',
          '',
          '## 用户',
          '',
          `hello ${turn}`,
          '',
        ].join('\n'),
      )
      return full
    }

    for (let index = 0; index < 200; index++) {
      const name = `a${String(index).padStart(3, '0')}--turn-${index}.md`
      const full = writeRaw(name, `existing-${index}`, index)
      const relative = path.relative(dir, full).split(path.sep).join('/')
      store.ingestTurn(
        {
          turnId: `existing-${index}:${index}`,
          workspaceId: 'ws1',
          sessionId: `existing-${index}`,
          turnSeq: index,
          origin: 'main',
          endReason: 'completed',
          occurredAt: '2026-10-19T01:00:00.000Z',
          localDate,
          rootId: 'default',
          rawRelPath: relative,
          provider: null,
          model: null,
        },
        [],
        {
          title: 'existing',
          conclusion: '',
          topics: [],
          status: 'unsummarized',
          sourceRelPath: relative,
          rootId: 'default',
          occurredAt: '2026-10-19T01:00:00.000Z',
        },
      )
    }

    const orphan = writeRaw('zz-orphan--turn-999.md', 's-orphan', 999)
    fs.writeFileSync(
      orphan.replace(/\.md$/, '.events.jsonl'),
      [
        JSON.stringify({ type: 'request/header', seq: 2, occurredAt: 1, data: { header: { config: { provider: 'p-orphan', model: 'm-orphan' } } } }),
        // No occurredAt: the header start time must be used, not 1970.
        JSON.stringify({ type: 'user/message', seq: 3, data: { role: 'user', content: 'orphan' } }),
        '',
      ].join('\n'),
    )

    expect(worker.reconcileRawTurns(200)).toBe(1)
    const recovered = store.getTurn('s-orphan:999')
    expect(recovered?.provider).toBe('p-orphan')
    expect(recovered?.model).toBe('m-orphan')
    expect(recovered?.raw_events_rel_path).toBe(
      'projects/ws1/turns/2026-10-19/zz-orphan--turn-999.events.jsonl',
    )
    expect(store.countTurnEvents('s-orphan:999')).toBe(2)

    const machine = path.join(dir, 'projects', 'ws1', 'index', `${localDate}.jsonl`)
    const machineText = fs.readFileSync(machine, 'utf8')
    expect(machineText).toContain('"sessionId":"s-orphan"')
    expect(machineText).toContain('"workspacePath":"/tmp/ws"')
    expect(machineText).not.toContain('1970-01-01')

    worker.dispose()
    store.close()
  })

  it('inherits the last persisted model after a worker restart', async () => {
    const { config, store, worker } = setup()
    const first = {
      sessionId: 'session-restart',
      turn: 1,
      startedAt: Date.parse('2026-10-19T01:00:00Z'),
      endedAt: Date.parse('2026-10-19T01:00:01Z'),
      endReason: 'completed',
      origin: 'main' as const,
      workspacePath: null,
      events: [
        {
          type: 'request/header',
          seq: 1,
          occurredAt: Date.parse('2026-10-19T01:00:00Z'),
          data: { header: { config: { provider: 'persisted-p', model: 'persisted-m' } } },
        },
      ],
    }
    worker.enqueue(first, { workspaceId: 'ws1', rootId: 'default' })
    await worker.flush()
    worker.dispose()

    const restarted = new CaptureWorker(store, config)
    const second = {
      sessionId: 'session-restart',
      turn: 2,
      startedAt: Date.parse('2026-10-19T02:00:00Z'),
      endedAt: Date.parse('2026-10-19T02:00:01Z'),
      endReason: 'completed',
      origin: 'main' as const,
      workspacePath: null,
      events: [],
    }
    restarted.enqueue(second, { workspaceId: 'ws1', rootId: 'default' })
    await restarted.flush()

    expect(store.getTurn('session-restart:2')?.provider).toBe('persisted-p')
    expect(store.getTurn('session-restart:2')?.model).toBe('persisted-m')
    restarted.dispose()
    store.close()
  })
})
