import { extractText } from '../capture/render.js';
import { parseSummary } from './parse.js';
import { buildSummaryPrompt } from './prompt.js';
/**
 * Summarize one turn with a fresh-context child agent.
 *
 * The child is caller-delivered (no parent notice), depth-limited, and gets
 * only the readable turn file. It returns JSON; anything malformed makes the
 * capture job retry.
 */
export function createSubagentSummarizer(options) {
    const provider = options.provider ?? 'spawn';
    const maxDepth = options.maxDepth ?? 1;
    const timeoutMs = options.timeoutMs ?? 120_000;
    return async (turn, markdown) => {
        const ctx = options.ctx;
        if (ctx === null || ctx === undefined)
            return null;
        // Look services up with ctx.get(): direct property access requires an
        // `inject` declaration, and summarization is optional in minimal profiles.
        const subagents = typeof ctx.get === 'function' ? ctx.get('subagents') : undefined;
        const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
        if (subagents === undefined || agents === undefined) {
            console.warn('[mind-dsh] summarizer unavailable: subagents/agents service missing');
            return null;
        }
        const liveId = options.getLiveSessionId?.() ?? null;
        const parent = agents.get(turn.sessionId) ?? (liveId === null ? undefined : agents.get(liveId));
        if (parent === undefined || parent === null) {
            console.warn('[mind-dsh] summarizer skipped: no live parent agent');
            return null;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('mind summary timeout')), timeoutMs);
        try {
            const activation = await subagents.startActivation({
                provider,
                label: 'mind-capture',
                request: {
                    prompt: [{ type: 'text', text: buildSummaryPrompt(turn, markdown) }],
                    parent,
                    signal: controller.signal,
                    maxDepth,
                },
                signal: controller.signal,
                delivery: 'caller',
            });
            try {
                const result = await activation.result;
                if (result.stopReason !== 'completed')
                    return null;
                return parseSummary(extractText(result.output));
            }
            finally {
                await activation.dispose().catch(() => { });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[mind-dsh] summarizer failed: ${message}`);
            return null;
        }
        finally {
            clearTimeout(timer);
        }
    };
}
