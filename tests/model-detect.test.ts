import { describe, expect, it } from 'vitest'
import type { CapturedTurn } from '../src/capture/types.js'
import { detectModel } from '../src/summarize/llm.js'

const base: CapturedTurn = {
  sessionId: 's1',
  turn: 1,
  startedAt: 0,
  endedAt: 0,
  endReason: null,
  origin: 'main',
  workspacePath: null,
  events: [],
}

describe('detectModel', () => {
  it('reads the DSH 0.2 request/header config', () => {
    const turn: CapturedTurn = {
      ...base,
      events: [
        {
          type: 'request/header',
          seq: 1,
          occurredAt: 0,
          data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } },
        },
      ],
    }
    expect(detectModel(turn)).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
  })

  it('prefers provider/model persisted on the turn', () => {
    const turn: CapturedTurn = { ...base, provider: 'deepseek-account', model: 'deepseek-flash' }
    expect(detectModel(turn)).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
  })

  it('keeps the legacy top-level shape working', () => {
    const turn: CapturedTurn = {
      ...base,
      events: [
        {
          type: 'request/context',
          seq: 1,
          occurredAt: 0,
          data: { provider: 'legacy-provider', model: 'legacy-model' },
        },
      ],
    }
    expect(detectModel(turn)).toEqual({ provider: 'legacy-provider', model: 'legacy-model' })
  })

  it('returns null when no model is recorded', () => {
    expect(detectModel(base)).toBeNull()
  })
})
