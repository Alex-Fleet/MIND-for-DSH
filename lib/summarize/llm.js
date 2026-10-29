import { parseSummary } from './parse.js';
import { buildSummaryPrompt } from './prompt.js';
/**
 * Summarize one turn with a single auxiliary model call.
 *
 * This is a hand-built one-shot request: no tools, no conversation history,
 * no dependency on a live Agent loop. It is therefore safe to run immediately
 * after `turn/end`, including in a one-shot headless process.
 */
export function createLlmSummarizer(options) {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const maxTokens = options.maxTokens ?? 2048;
    return async (turn, markdown) => {
        const ctx = options.ctx;
        if (ctx === null || ctx === undefined || typeof ctx.get !== 'function')
            return null;
        const llm = ctx.get('llm');
        if (llm === undefined) {
            console.warn('[mind-dsh] summarizer unavailable: llm service missing');
            return null;
        }
        // An explicit profile setting wins; the turn's request model is the
        // default when no provider/model was configured. Provider and model are a
        // pair: configuring only one must not mix it with the other from the
        // turn, which may belong to a different provider.
        const detected = detectModel(turn);
        const configuredProvider = options.provider !== undefined && options.provider !== '';
        const configuredModel = options.model !== undefined && options.model !== '';
        const selected = configuredProvider || configuredModel
            ? {
                provider: configuredProvider ? String(options.provider) : 'deepseek-account',
                model: configuredModel ? String(options.model) : 'deepseek-flash',
            }
            : {
                provider: detected?.provider ?? 'deepseek-account',
                model: detected?.model ?? 'deepseek-flash',
            };
        const controller = new AbortController();
        let timer;
        // Hard deadline: abort alone is cooperative, and a provider that ignores
        // the signal must not block the single drain loop forever.
        const deadline = new Promise((_, reject) => {
            timer = setTimeout(() => {
                controller.abort(new Error('mind summary timeout'));
                reject(new Error('mind summary timeout'));
            }, timeoutMs);
        });
        let text = '';
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
            });
            const consumed = (async () => {
                for await (const chunk of stream) {
                    if (chunk.type === 'text-delta' && typeof chunk.text === 'string')
                        text += chunk.text;
                }
                return text;
            })();
            // Mark the losing side handled if the deadline wins the race.
            void consumed.catch(() => { });
            text = await Promise.race([consumed, deadline]);
            return parseSummary(text);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[mind-dsh] summarizer failed: ${message}`);
            return null;
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    };
}
/** Read the provider/model recorded on the turn's request header/context. */
export function detectModel(turn) {
    if (typeof turn.provider === 'string' && typeof turn.model === 'string') {
        return { provider: turn.provider, model: turn.model };
    }
    for (const event of turn.events) {
        if (event.type !== 'request/header' && event.type !== 'request/context')
            continue;
        const data = event.data;
        if (data === null || typeof data !== 'object')
            continue;
        const record = data;
        // DSH 0.2.1: { header: { config: { provider, model, ... } } }
        const header = record.header;
        if (header !== null && typeof header === 'object') {
            const config = header.config;
            if (config !== null && typeof config === 'object') {
                const call = config;
                if (typeof call.provider === 'string' && typeof call.model === 'string') {
                    return { provider: call.provider, model: call.model };
                }
            }
        }
        // Older shape: provider/model directly on the event data.
        if (typeof record.provider === 'string' && typeof record.model === 'string') {
            return { provider: record.provider, model: record.model };
        }
    }
    return null;
}
