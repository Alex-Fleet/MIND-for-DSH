import type { ResolvedConfig } from '../config.js';
import type { Store } from '../db/store.js';
import type { CapturedTurn } from './types.js';
import type { SummarizeFn } from '../summarize/llm.js';
export interface IngestContext {
    workspaceId: string | null;
    rootId: string;
}
export declare class CaptureWorker {
    private readonly store;
    private readonly config;
    private readonly summarize?;
    private readonly recent;
    private readonly pending;
    /**
     * The last request model seen per session. DSH only records
     * `request/header` on initial/resume/route changes, so later turns in the
     * same loop carry no model event of their own.
     */
    private readonly sessionModels;
    private activeDrain;
    private disposed;
    private readonly owner;
    constructor(store: Store, config: ResolvedConfig, summarize?: SummarizeFn | undefined);
    /**
     * Persist a completed turn.
     *
     * The raw file and index row are written synchronously (milliseconds) so a
     * one-shot headless process cannot exit before the original is durable.
     * Summarization stays asynchronous.
     */
    enqueue(turn: CapturedTurn, context: IngestContext): void;
    /** Process everything queued right now (tests and shutdown). */
    flush(): Promise<void>;
    /** Stop accepting work; safe to call before closing the store. */
    dispose(): void;
    /** Recover jobs left running by a crashed process. */
    reconcile(): number;
    private drain;
    private ingest;
    /**
     * Give legacy turns without any index a preview-based fallback, so an old
     * summary failure cannot leave them invisible in the timeline or FTS.
     */
    backfillIndexes(limit?: number): number;
    /** Rebuild day/week/month views whose row counts drifted or are absent. */
    rebuildMissingViews(limit?: number): number;
    /**
     * Reconcile raw Markdown files that never reached the database (a crash or
     * a failed insert between the raw write and the transaction). Only the
     * readable raw is required; event metadata can be absent.
     */
    reconcileRawTurns(limit?: number): number;
    private retryPending;
    private consumeJobs;
    private processJob;
    private recordSummary;
    private rebuildViews;
    private retryDelay;
    private turnForJob;
}
export { localDateOf } from '../time.js';
export declare function safeTurnFileName(turn: CapturedTurn): string;
