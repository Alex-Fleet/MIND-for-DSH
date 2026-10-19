import { describe, expect, it } from 'vitest'
import { TurnBuffer } from '../src/capture/buffer.js'

const session = { id: 'session-1', header: { cwd: '/tmp/workspace' } }

describe('TurnBuffer', () => {
  it('collects events until turn/end and finalizes with the reason', () => {
    const buffer = new TurnBuffer()

    expect(buffer.push(session, { type: 'turn/start', time: 1000, data: { turn: 1 } })).toBeNull()
    buffer.push(session, { type: 'user/message', time: 1001, data: { role: 'user', content: 'hello' } })
    buffer.push(session, { type: 'assistant/message', time: 1002, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } } })
    buffer.push(session, { type: 'tool/call', time: 1003, data: { turn: 1, step: 1, name: 'bash', arguments: '{"command":"echo hi"}' } })

    const done = buffer.push(session, { type: 'turn/end', time: 1004, data: { turn: 1, reason: { kind: 'completed' } } })

    expect(done).not.toBeNull()
    expect(done?.sessionId).toBe('session-1')
    expect(done?.turn).toBe(1)
    expect(done?.endReason).toBe('completed')
    expect(done?.origin).toBe('main')
    expect(done?.workspacePath).toBe('/tmp/workspace')
    expect(done?.events.map(event => event.type)).toEqual(['user/message', 'assistant/message', 'tool/call'])
    expect(buffer.size()).toBe(0)
  })

  it('closes an unfinished turn as aborted_unknown when a new turn starts', () => {
    const buffer = new TurnBuffer()
    buffer.push(session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
    buffer.push(session, { type: 'user/message', time: 1001, data: { role: 'user', content: 'first' } })

    const closed = buffer.push(session, { type: 'turn/start', time: 2000, data: { turn: 2 } })

    expect(closed?.endReason).toBe('aborted_unknown')
    expect(closed?.turn).toBe(1)
    expect(buffer.size()).toBe(1)
  })

  it('marks subagent sessions', () => {
    const buffer = new TurnBuffer()
    const subagent = { id: 'session-2', header: { cwd: '/tmp/ws', origin: 'subagent' as const, delegationDepth: 1 } }
    buffer.push(subagent, { type: 'turn/start', time: 1000, data: { turn: 1 } })
    const done = buffer.push(subagent, { type: 'turn/end', time: 1001, data: { turn: 1, reason: { kind: 'completed' } } })
    expect(done?.origin).toBe('subagent')
  })

  it('ignores events without an open turn', () => {
    const buffer = new TurnBuffer()
    expect(buffer.push(session, { type: 'user/message', data: { content: 'orphan' } })).toBeNull()
    expect(buffer.size()).toBe(0)
  })
})
