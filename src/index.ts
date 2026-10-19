import type { Context } from '@deepseek-ai/cordis'
import type { MindContext } from './types.js'

export const name = 'mind-dsh'

/** Services required before apply() runs. */
export const inject = ['systemPrompt'] as const

/**
 * MIND for DSH entry point.
 *
 * Step 1 skeleton: register a static marker so the plugin can be loaded and
 * verified in an isolated DSH profile. Capture/storage/injection land in
 * later steps (see docs/DESIGN.md).
 */
export function apply(ctx: Context): void {
  const c = ctx as MindContext

  c.systemPrompt.section({
    name: 'mind-dsh:static',
    order: c.systemPrompt.getSectionOrder('TOOL_SESSION_QUERY'),
    text: '[MIND] initializing',
  })

  console.log('[mind-dsh] loaded')
}
