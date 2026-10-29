import type { CapturedTurn } from '../capture/types.js';
import { type TurnSummary } from './parse.js';
export type SummarizeFn = (turn: CapturedTurn, markdown: string) => Promise<TurnSummary | null>;
export interface LlmSummarizerOptions {
    ctx: unknown;
    provider?: string;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
}
/**
 * Summarize one turn with a single auxiliary model call.
 *
 * This is a hand-built one-shot request: no tools, no conversation history,
 * no dependency on a live Agent loop. It is therefore safe to run immediately
 * after `turn/end`, including in a one-shot headless process.
 */
export declare function createLlmSummarizer(options: LlmSummarizerOptions): SummarizeFn;
/** Read the provider/model recorded on the turn's request header/context. */
export declare function detectModel(turn: CapturedTurn): {
    provider: string;
    model: string;
} | null;
