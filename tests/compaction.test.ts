import { describe, expect, it } from 'vitest'
import { isCompactionSuccess } from '../src/index.js'

describe('isCompactionSuccess', () => {
  it('accepts a compaction/end without an error (automatic or manual)', () => {
    expect(isCompactionSuccess({ type: 'compaction/end', data: { compactionId: 'c1', turn: 3 } })).toBe(true)
    expect(
      isCompactionSuccess({ type: 'compaction/end', data: { compactionId: 'c1', turn: 3, sourceCommandId: 'cmd' } }),
    ).toBe(true)
  })

  it('rejects a failed compaction', () => {
    expect(
      isCompactionSuccess({ type: 'compaction/end', data: { compactionId: 'c1', turn: 3, error: 'llm timeout' } }),
    ).toBe(false)
  })

  it('accepts a pure prune', () => {
    expect(
      isCompactionSuccess({
        type: 'compaction/prune',
        data: { shadowedRange: { start: 1, end: 9 }, shadowedSeqs: [1, 2], shadowedTokenCount: 42 },
      }),
    ).toBe(true)
  })

  it('ignores start/summary and unrelated events', () => {
    expect(isCompactionSuccess({ type: 'compaction/start', data: { compactionId: 'c1', turn: 3 } })).toBe(false)
    expect(isCompactionSuccess({ type: 'compaction/summary', data: { compactionId: 'c1' } })).toBe(false)
    expect(isCompactionSuccess({ type: 'turn/end', data: { turn: 1 } })).toBe(false)
    expect(isCompactionSuccess({ type: 'user/message', data: {} })).toBe(false)
  })
})
