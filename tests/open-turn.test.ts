import { describe, expect, it } from 'vitest'
import { findOpenTurn } from '../src/recovery/open-turn.js'

describe('findOpenTurn', () => {
  it('returns null for a balanced session', () => {
    expect(
      findOpenTurn([
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        { type: 'assistant/message', seq: 2 },
        { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'completed' } } },
      ]),
    ).toBeNull()
  })

  it('returns the unmatched start', () => {
    expect(
      findOpenTurn([
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        { type: 'turn/end', seq: 2, data: { turn: 1 } },
        { type: 'turn/start', seq: 3, data: { turn: 2 } },
        { type: 'assistant/message', seq: 4 },
      ]),
    ).toEqual({ turn: 2, startSeq: 3 })
  })

  it('ignores events without a turn number', () => {
    expect(findOpenTurn([{ type: 'turn/start', seq: 1, data: {} }])).toBeNull()
  })
})
