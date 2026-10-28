import { describe, expect, it } from 'vitest'
import type { CapturedTurn } from '../src/capture/types.js'
import { createLlmSummarizer, detectModel } from '../src/summarize/llm.js'

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

  it('lets an explicit summary configuration override the turn model', async () => {
    const calls: Array<{ provider: string; model: string }> = []
    const llm = {
      stream(options: { provider: string; model: string }) {
        calls.push({ provider: options.provider, model: options.model })
        return (async function* () {
          yield {
            type: 'text-delta',
            text: '{"title":"t","conclusion":"c","topics":[],"durable":[],"worthRemembering":false}',
          }
        })()
      },
    }
    const summarize = createLlmSummarizer({
      ctx: { get: (name: string) => (name === 'llm' ? llm : undefined) },
      provider: 'cfg-provider',
      model: 'cfg-model',
    })
    const turn: CapturedTurn = {
      ...base,
      events: [
        {
          type: 'request/header',
          seq: 1,
          occurredAt: 0,
          data: { header: { config: { provider: 'turn-provider', model: 'turn-model' } } },
        },
      ],
    }

    expect(await summarize(turn, 'markdown')).not.toBeNull()
    expect(calls).toEqual([{ provider: 'cfg-provider', model: 'cfg-model' }])
  })

  it('does not mix a partial summary configuration with the turn model', async () => {
    const calls: Array<{ provider: string; model: string }> = []
    const llm = {
      stream(options: { provider: string; model: string }) {
        calls.push({ provider: options.provider, model: options.model })
        return (async function* () {
          yield {
            type: 'text-delta',
            text: '{"title":"t","conclusion":"c","topics":[],"durable":[],"worthRemembering":false}',
          }
        })()
      },
    }
    const turn: CapturedTurn = {
      ...base,
      events: [
        {
          type: 'request/header',
          seq: 1,
          occurredAt: 0,
          data: { header: { config: { provider: 'turn-provider', model: 'turn-model' } } },
        },
      ],
    }

    const providerOnly = createLlmSummarizer({
      ctx: { get: (name: string) => (name === 'llm' ? llm : undefined) },
      provider: 'cfg-provider',
    })
    expect(await providerOnly(turn, 'markdown')).not.toBeNull()

    const modelOnly = createLlmSummarizer({
      ctx: { get: (name: string) => (name === 'llm' ? llm : undefined) },
      model: 'cfg-model',
    })
    expect(await modelOnly(turn, 'markdown')).not.toBeNull()

    expect(calls).toEqual([
      { provider: 'cfg-provider', model: 'deepseek-flash' },
      { provider: 'deepseek-account', model: 'cfg-model' },
    ])
  })

  it('uses the turn model when no summary configuration is set', async () => {
    const calls: Array<{ provider: string; model: string }> = []
    const llm = {
      stream(options: { provider: string; model: string }) {
        calls.push({ provider: options.provider, model: options.model })
        return (async function* () {
          yield {
            type: 'text-delta',
            text: '{"title":"t","conclusion":"c","topics":[],"durable":[],"worthRemembering":false}',
          }
        })()
      },
    }
    const summarize = createLlmSummarizer({
      ctx: { get: (name: string) => (name === 'llm' ? llm : undefined) },
    })
    const turn: CapturedTurn = {
      ...base,
      events: [
        {
          type: 'request/header',
          seq: 1,
          occurredAt: 0,
          data: { header: { config: { provider: 'turn-provider', model: 'turn-model' } } },
        },
      ],
    }

    expect(await summarize(turn, 'markdown')).not.toBeNull()
    expect(calls).toEqual([{ provider: 'turn-provider', model: 'turn-model' }])
  })
})
