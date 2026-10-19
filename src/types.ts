import type { Context } from '@deepseek-ai/cordis'

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
