import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Store } from '../db/store.js'

interface ToolRegistry {
  register(definition: unknown): void
}

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/**
 * Register the two model-facing retrieval tools.
 *
 * `mind_read_turn` pages through a captured turn by character offset, which
 * keeps working past DSH's 50KB/2000-char read limits. `mind_search` queries
 * the FTS5 turn index and returns raw paths.
 */
export function registerMindTools(tools: ToolRegistry, store: Store, mindRoot: string): void {
  tools.register(
    defineTool({
      name: 'mind_read_turn',
      description:
        'Read a captured MIND turn by id. Returns a character chunk of the readable raw file plus offset, total and next offset.',
      parameters: {
        turn_id: { type: 'string', required: true, description: 'MIND turn id, e.g. session-...:1.' },
        offset_chars: { type: 'integer', description: 'Start character offset (default 0).' },
        max_chars: { type: 'integer', description: 'Maximum characters to return (default 20000, max 100000).' },
      },
      output: TEXT_OUTPUT,
      timeoutMs: 15_000,
      execute: async args => {
        const input = args as { turn_id: string; offset_chars?: number; max_chars?: number }
        const row = store.getTurn(input.turn_id)
        if (row === undefined) throw new Error(`turn not found: ${input.turn_id}`)
        const relative = String(row.raw_rel_path ?? '')
        if (relative === '') throw new Error(`turn has no readable raw file: ${input.turn_id}`)

        const full = fs.readFileSync(path.join(mindRoot, relative), 'utf8')
        const offset = Math.max(0, Math.floor(input.offset_chars ?? 0))
        const maxChars = Math.min(100_000, Math.max(1, Math.floor(input.max_chars ?? 20_000)))
        const chunk = full.slice(offset, offset + maxChars)
        const next = offset + chunk.length
        const nextLabel = next < full.length ? String(next) : 'end'
        return `[turn ${input.turn_id}] offset=${offset} total=${full.length} next=${nextLabel}\n\n${chunk}`
      },
    }),
  )

  tools.register(
    defineTool({
      name: 'mind_search',
      description: 'Search the MIND turn index by keyword and return matching turns with their raw file paths.',
      parameters: {
        query: { type: 'string', required: true, description: 'Keyword or phrase to search.' },
        limit: { type: 'integer', description: 'Maximum results (default 10, max 50).' },
      },
      output: TEXT_OUTPUT,
      timeoutMs: 15_000,
      execute: async args => {
        const input = args as { query: string; limit?: number }
        const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 10)))
        const rows = store.searchTurnIndex(input.query, limit)
        if (rows.length === 0) return `[mind_search] no results for ${JSON.stringify(input.query)}`

        const lines = [`[mind_search] ${rows.length} result(s) for ${JSON.stringify(input.query)}`]
        for (const row of rows) {
          lines.push(
            `- ${String(row.turn_id)} · ${String(row.title ?? '')} · ${String(row.conclusion ?? '')} · ${String(row.source_rel_path ?? '')}`,
          )
        }
        return lines.join('\n')
      },
    }),
  )
}
