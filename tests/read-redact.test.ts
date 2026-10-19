import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { readTurnChunk } from '../src/turns/read.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const secret = 'SUPERSECRETVALUE123456'

function setup(content = `0123456789password=${secret} tail\n`, withRawChars = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-read-redact-'))
  dirs.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  const rawRelPath = 'projects/ws1/turns/2026-10-19/s1--turn-1.md'
  const target = path.join(dir, rawRelPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  store.insertTurnAndJob(
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
      rawRelPath,
      rawChars: withRawChars ? content.length : null,
      provider: null,
      model: null,
    },
    [],
  )
  return { dir, store }
}

describe('redacted turn chunks', () => {
  it('keeps a credential that crosses a chunk boundary out of both chunks', () => {
    const { dir, store } = setup()
    const first = readTurnChunk(store, dir, 's1:1', 0, 15, { redact: true })
    const second = readTurnChunk(store, dir, 's1:1', 15, 15, { redact: true })

    expect(first.chunk).not.toContain(secret)
    expect(second.chunk).not.toContain(secret)
    expect(first.chunk + second.chunk).not.toContain(secret)
    expect(first.chunk + second.chunk).toContain('[REDACTED:SECRET_ASSIGNMENT]')
    store.close()
  })

  it('leaves the UI read path unredacted', () => {
    const { dir, store } = setup()
    const first = readTurnChunk(store, dir, 's1:1', 0, 15)
    expect(first.chunk).toBe('0123456789passw')
    store.close()
  })

  it('never slices a marker even when it has the same length as the secret', () => {
    // `[REDACTED:SECRET_ASSIGNMENT]` is 28 chars; `password=` is 9, so a
    // 19-char value makes the marker and the original match equal in length.
    const { dir, store } = setup(`password=${'x'.repeat(18)}1\n`)
    const first = readTurnChunk(store, dir, 's1:1', 0, 5, { redact: true })
    expect(first.chunk).toBe('[REDACTED:SECRET_ASSIGNMENT]')
    store.close()
  })

  it('keeps character offsets correct for a multibyte file beyond 8 MB', () => {
    const content = `${'中'.repeat(2_800_000)}END`
    const { dir, store } = setup(content, false)
    const read = readTurnChunk(store, dir, 's1:1', 2_500_000, 10)
    expect(read.chunk).toBe('中'.repeat(10))
    expect(read.total).toBe(content.length)
    store.close()
  })

  it('reads a large turn whose raw_chars is NULL and redacts past 8 MB', () => {
    const prefix = 'a'.repeat(8 * 1024 * 1024 + 100)
    const content = `${prefix} password=${secret} tail\n`
    const { dir, store } = setup(content, false)
    const offset = prefix.length + 1

    const read = readTurnChunk(store, dir, 's1:1', offset, 100, { redact: true })
    expect(read.chunk.length).toBeGreaterThan(0)
    expect(read.chunk).not.toContain(secret)
    expect(read.chunk).toContain('[REDACTED:SECRET_ASSIGNMENT]')
    expect(Number(store.getTurn('s1:1')?.raw_chars)).toBe(content.length)

    const tail = readTurnChunk(store, dir, 's1:1', content.length - 10, 100)
    expect(tail.chunk.length).toBeGreaterThan(0)
    expect(tail.next).toBeNull()
    store.close()
  })
})
