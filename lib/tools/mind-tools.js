import crypto from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { redactSecrets } from '../security/redact.js';
import { readTurnChunk } from '../turns/read.js';
/**
 * Create a pending proposal through the same path the UI already reviews.
 * Never writes an active rule; the user must approve it.
 */
export function createRememberProposal(store, workspaceId, input) {
    if (workspaceId === '')
        return { error: 'no workspace' };
    const title = redactSecrets(input.title.trim()).slice(0, 120);
    const rule = redactSecrets(input.content.trim()).slice(0, 4000);
    if (title === '' || rule === '')
        return { error: 'title and content are required' };
    const origin = input.origin === 'user' ? '用户要求' : '主 agent 判断';
    const evidence = typeof input.evidence === 'string' ? input.evidence.trim() : '';
    const content = evidence === ''
        ? `${rule}\n\n来源：${origin}`
        : `${rule}\n\n依据：${redactSecrets(evidence).slice(0, 2000)}\n来源：${origin}`;
    const id = `prop-${crypto.randomUUID()}`;
    store.insertProposal({
        id,
        workspaceId,
        layer: 'rule',
        title,
        content,
        sourceTurn: null,
    });
    return { id, title };
}
const TEXT_OUTPUT = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
};
/**
 * Register the two model-facing retrieval tools.
 *
 * `mind_read_turn` pages through a captured turn by character offset, which
 * keeps working past DSH's 50KB/2000-char read limits. `mind_search` queries
 * the FTS5 turn index and returns raw paths.
 */
export function registerMindTools(tools, store, mindRoot, resolveWorkspaceId) {
    tools.register(defineTool({
        name: 'mind_read_turn',
        description: 'Read a captured MIND turn by id. Returns a character chunk of the readable raw file plus offset, total and next offset.',
        parameters: {
            turn_id: { type: 'string', required: true, description: 'MIND turn id, e.g. session-...:1.' },
            offset_chars: { type: 'integer', description: 'Start character offset (default 0).' },
            max_chars: {
                type: 'integer',
                description: 'Maximum characters to return (default 20000, max 100000). A redaction marker may make one page slightly longer.',
            },
        },
        output: TEXT_OUTPUT,
        timeoutMs: 15_000,
        execute: async (args) => {
            const input = args;
            // Redact while reading with an overlap window, so a credential that
            // crosses a chunk boundary cannot be reassembled from two calls.
            const read = readTurnChunk(store, mindRoot, input.turn_id, input.offset_chars, input.max_chars, {
                redact: true,
            });
            const nextLabel = read.next === null ? 'end' : String(read.next);
            return `[turn ${read.turnId}] offset=${read.offset} total=${read.total} next=${nextLabel}\n\n${read.chunk}`;
        },
    }));
    tools.register(defineTool({
        name: 'mind_search',
        description: 'Search the MIND turn index by keyword and return matching turns with their raw file paths.',
        parameters: {
            query: { type: 'string', required: true, description: 'Keyword or phrase to search.' },
            limit: { type: 'integer', description: 'Maximum results (default 10, max 50).' },
        },
        output: TEXT_OUTPUT,
        timeoutMs: 15_000,
        execute: async (args) => {
            const input = args;
            const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 10)));
            const rows = store.searchTurnIndex(input.query, limit);
            if (rows.length === 0)
                return `[mind_search] no results for ${JSON.stringify(input.query)}`;
            const lines = [`[mind_search] ${rows.length} result(s) for ${JSON.stringify(input.query)}`];
            for (const row of rows) {
                lines.push(`- ${String(row.turn_id)} · ${String(row.title ?? '')} · ${String(row.conclusion ?? '')} · ${String(row.source_rel_path ?? '')}`);
            }
            return redactSecrets(lines.join('\n'));
        },
    }));
    tools.register(defineTool({
        name: 'mind_remember',
        description: 'Record a durable project rule as a PENDING proposal for the user to review. Call only when (a) the user explicitly asks to remember something, or (b) you judge a rule is long-term important: it must apply to many future turns, be a macro project constraint/decision, and not be a one-off fact or task detail. At most one per turn. This tool never activates a rule; the user must approve it in the Proposals tab.',
        parameters: {
            title: { type: 'string', required: true, description: 'Short rule title (<=120 chars).' },
            content: {
                type: 'string',
                required: true,
                description: 'The rule and its applicable boundary (<=4000 chars).',
            },
            evidence: {
                type: 'string',
                description: 'Why this rule is durable: user correction, repeated failure, or a concrete decision.',
            },
            origin: {
                type: 'string',
                description: '"user" if the user explicitly asked to remember; "agent" if self-initiated.',
            },
        },
        output: TEXT_OUTPUT,
        timeoutMs: 15_000,
        execute: async (args, exec) => {
            const input = args;
            const workspaceId = resolveWorkspaceId(exec.agent);
            if (workspaceId === null) {
                return '[mind_remember] rejected: no workspace could be resolved for this session; nothing was written.';
            }
            const result = createRememberProposal(store, workspaceId, {
                title: input.title,
                content: input.content,
                ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
                ...(input.origin === 'user' || input.origin === 'agent' ? { origin: input.origin } : {}),
            });
            if ('error' in result)
                return `[mind_remember] rejected: ${result.error}`;
            return `[mind_remember] pending proposal recorded: ${result.id}\nTitle: ${result.title}\nWorkspace: ${workspaceId}\nThe user must approve it in the Proposals tab; it is not active yet.`;
        },
    }));
}
