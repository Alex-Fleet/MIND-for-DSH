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
