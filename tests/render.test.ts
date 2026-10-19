import { describe, expect, it } from 'vitest'
import { hardWrap, renderTurnMarkdown } from '../src/capture/render.js'
import type { CapturedTurn } from '../src/capture/types.js'

function turn(overrides: Partial<CapturedTurn> = {}): CapturedTurn {
  return {
    sessionId: 'session-1',
    turn: 1,
    startedAt: Date.parse('2026-10-19T01:00:00Z'),
    endedAt: Date.parse('2026-10-19T01:05:00Z'),
    endReason: 'completed',
    origin: 'main',
    workspacePath: '/tmp/workspace',
    events: [],
    ...overrides,
  }
}

describe('hardWrap', () => {
  it('splits a long physical line into chunks no wider than the limit', () => {
    const wrapped = hardWrap('a'.repeat(2500), 800)
    const lines = wrapped.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines.every(line => line.length <= 800)).toBe(true)
    expect(lines.join('')).toBe('a'.repeat(2500))
  })

  it('leaves short lines untouched', () => {
    expect(hardWrap('a\nb\nc', 800)).toBe('a\nb\nc')
  })
})

describe('renderTurnMarkdown', () => {
  it('renders user, assistant and tool content', () => {
    const rendered = renderTurnMarkdown(
      turn({
        events: [
          { type: 'user/message', seq: 1, occurredAt: 1, data: { role: 'user', source: { kind: 'user' }, content: 'hello' } },
          {
            type: 'assistant/message',
            seq: 2,
            occurredAt: 2,
            data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] } },
          },
          { type: 'tool/call', seq: 3, occurredAt: 3, data: { name: 'bash', arguments: '{"command":"echo TOOLPROBE"}' } },
          {
            type: 'tool/result',
            seq: 4,
            occurredAt: 4,
            data: { message: { role: 'tool', content: [{ type: 'text', text: 'TOOLPROBE\n' }] } },
          },
        ],
      }),
      800,
    )

    expect(rendered).toContain('# Turn session-1 / #1')
    expect(rendered).toContain('## 用户')
    expect(rendered).toContain('hello')
    expect(rendered).toContain('## 助手 · step 1')
    expect(rendered).toContain('hi there')
    expect(rendered).toContain('### 工具调用 · bash')
    expect(rendered).toContain('### 工具结果')
    expect(rendered).toContain('TOOLPROBE')
  })

  it('skips runtime-context user messages', () => {
    const rendered = renderTurnMarkdown(
      turn({
        events: [
          {
            type: 'user/message',
            seq: 1,
            occurredAt: 1,
            data: { role: 'user', source: { kind: 'system-prompt', form: 'snapshot' }, content: '[MIND] context body' },
          },
        ],
      }),
      800,
    )
    expect(rendered).not.toContain('[MIND] context body')
  })

  it('hard-wraps a large tool result', () => {
    const rendered = renderTurnMarkdown(
      turn({
        events: [
          {
            type: 'tool/result',
            seq: 1,
            occurredAt: 1,
            data: { message: { role: 'tool', content: [{ type: 'text', text: 'x'.repeat(5000) }] } },
          },
        ],
      }),
      800,
    )
    const longLines = rendered.split('\n').filter(line => line.length > 800)
    expect(longLines).toHaveLength(0)
  })
})
