import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Store } from '../db/store.js'
import { redactSecrets } from '../security/redact.js'
import { readTurnChunk } from '../turns/read.js'

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
        max_chars: {
          type: 'integer',
          description:
            'Maximum characters to return (default 20000, max 100000). A redaction marker may make one page slightly longer.',
        },
      },
      output: TEXT_OUTPUT,
      timeoutMs: 15_000,
      execute: async args => {
        const input = args as { turn_id: string; offset_chars?: number; max_chars?: number }
        // Redact while reading with an overlap window, so a credential that
        // crosses a chunk boundary cannot be reassembled from two calls.
        const read = readTurnChunk(store, mindRoot, input.turn_id, input.offset_chars, input.max_chars, {
          redact: true,
        })
        const nextLabel = read.next === null ? 'end' : String(read.next)
        return `[turn ${read.turnId}] offset=${read.offset} total=${read.total} next=${nextLabel}\n\n${read.chunk}`
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
        return redactSecrets(lines.join('\n'))
      },
    }),
  )
}
