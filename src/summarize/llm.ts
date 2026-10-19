import type { CapturedTurn } from '../capture/types.js'
import { parseSummary, type TurnSummary } from './parse.js'
import { buildSummaryPrompt } from './prompt.js'

export type SummarizeFn = (turn: CapturedTurn, markdown: string) => Promise<TurnSummary | null>

export interface LlmSummarizerOptions {
  ctx: unknown
  provider?: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

interface LlmLike {
  stream(options: {
    provider: string
    model: string
    messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>
    maxTokens?: number
    signal?: AbortSignal
  }): AsyncIterable<{ type: string; text?: string }>
}

/**
 * Summarize one turn with a single auxiliary model call.
 *
 * This is a hand-built one-shot request: no tools, no conversation history,
 * no dependency on a live Agent loop. It is therefore safe to run immediately
 * after `turn/end`, including in a one-shot headless process.
 */
export function createLlmSummarizer(options: LlmSummarizerOptions): SummarizeFn {
  const timeoutMs = options.timeoutMs ?? 120_000
  const maxTokens = options.maxTokens ?? 1024

  return async (turn, markdown) => {
    const ctx = options.ctx as { get?: (name: string) => unknown } | null
    if (ctx === null || ctx === undefined || typeof ctx.get !== 'function') return null
    const llm = ctx.get('llm') as LlmLike | undefined
    if (llm === undefined) {
      console.warn('[mind-dsh] summarizer unavailable: llm service missing')
      return null
    }

    const selected = detectModel(turn) ?? {
      provider: options.provider ?? 'deepseek-official',
      model: options.model ?? 'deepseek-flash',
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    // Hard deadline: abort alone is cooperative, and a provider that ignores
    // the signal must not block the single drain loop forever.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(new Error('mind summary timeout'))
        reject(new Error('mind summary timeout'))
      }, timeoutMs)
    })
    let text = ''
    try {
      const stream = llm.stream({
        provider: selected.provider,
        model: selected.model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: buildSummaryPrompt(turn, markdown) }],
          },
        ],
        maxTokens,
        signal: controller.signal,
      })
      const consumed = (async (): Promise<string> => {
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        }
        return text
      })()
      // Mark the losing side handled if the deadline wins the race.
      void consumed.catch(() => {})
      text = await Promise.race([consumed, deadline])
      return parseSummary(text)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] summarizer failed: ${message}`)
      return null
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}

/** Read the provider/model recorded on the turn's request header/context. */
export function detectModel(turn: CapturedTurn): { provider: string; model: string } | null {
  if (typeof turn.provider === 'string' && typeof turn.model === 'string') {
    return { provider: turn.provider, model: turn.model }
  }
  for (const event of turn.events) {
    if (event.type !== 'request/header' && event.type !== 'request/context') continue
    const data = event.data
    if (data === null || typeof data !== 'object') continue
    const record = data as Record<string, unknown>

    // DSH 0.2.1: { header: { config: { provider, model, ... } } }
    const header = record.header
    if (header !== null && typeof header === 'object') {
      const config = (header as Record<string, unknown>).config
      if (config !== null && typeof config === 'object') {
        const call = config as Record<string, unknown>
        if (typeof call.provider === 'string' && typeof call.model === 'string') {
          return { provider: call.provider, model: call.model }
        }
      }
    }

    // Older shape: provider/model directly on the event data.
    if (typeof record.provider === 'string' && typeof record.model === 'string') {
      return { provider: record.provider, model: record.model }
    }
  }
  return null
}
