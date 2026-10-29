import type { Store } from '../db/store.js';
export interface SnapshotOptions {
    store: Store;
    workspaceId: string;
    rootPath: string;
    localDate: string;
    dayBoundaryMinutes: number;
    maxDays?: number;
    /** Character budget for full turn summaries; overflow is grouped by day. */
    turnBudgetChars?: number;
}
/**
 * Build the low-frequency memory snapshot.
 *
 * No character budget: the harness has no hook-output cap, so every layer is
 * injected in full. The caller decides how much context it can afford.
 *
 * Section order is cache-maximizing: slowest-changing material first, the
 * daily-changing tail last. Inside each section entries run oldest → newest,
 * so new material is appended at the end and the longest stable prefix stays
 * byte-identical across sessions.
 */
export declare function buildSnapshot(options: SnapshotOptions): string;
