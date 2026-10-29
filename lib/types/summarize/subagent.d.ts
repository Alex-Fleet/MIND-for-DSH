import type { CapturedTurn } from '../capture/types.js';
import { type TurnSummary } from './parse.js';
export type SummarizeFn = (turn: CapturedTurn, markdown: string) => Promise<TurnSummary | null>;
export interface SubagentSummarizerOptions {
    ctx: unknown;
    provider?: string;
    maxDepth?: number;
    timeoutMs?: number;
    /** Current live session; used as the spawn parent for jobs left by a past process. */
    getLiveSessionId?: () => string | null;
}
/**
 * Summarize one turn with a fresh-context child agent.
 *
 * The child is caller-delivered (no parent notice), depth-limited, and gets
 * only the readable turn file. It returns JSON; anything malformed makes the
 * capture job retry.
 */
export declare function createSubagentSummarizer(options: SubagentSummarizerOptions): SummarizeFn;
