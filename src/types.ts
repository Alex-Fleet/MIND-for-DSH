import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Session event stream (DSH core). Payload shapes are narrowed at the call site. */
    'session/event': (session: unknown, event: unknown) => void
    /** Per-step waterfall: the last chance to enter or reject the step's user messages. */
    'agent/pre-step': (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>
  }
}

/** A system-prompt section/context contribution, mirroring DSH's PromptContext. */
export interface PromptContribution {
  name: string
  order: number
  text: string | ((context: unknown) => string)
  interpolate?: boolean
  required?: boolean
}

/** The DSH services MIND uses. Kept minimal to avoid coupling to every harness package. */
export type MindContext = Context & {
  systemPrompt: {
    section(options: PromptContribution): () => void
    context(options: PromptContribution): () => void
    getSectionOrder(name: string): number
  }
}
