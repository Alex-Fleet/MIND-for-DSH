import type { Context } from '@deepseek-ai/cordis';
import { type EventLike } from './capture/buffer.js';
import { type MindConfig } from './config.js';
export declare const name = "mind-dsh";
/** Services required before apply() runs. */
export declare const inject: readonly ["systemPrompt", "tools"];
/**
 * MIND for DSH entry point.
 *
 * Steps 1-4: capture, durable storage, indexing, and injection.
 */
export declare function apply(ctx: Context, rawConfig?: MindConfig): void;
/**
 * True when a session event means context was successfully compacted or
 * pruned: `compaction/end` without an error, or `compaction/prune`.
 *
 * DSH emits `compaction/start` → `compaction/summary` → `compaction/end` for a
 * summarising compaction, and a standalone `compaction/prune` for a pure
 * trim. Manual `/compact` commands carry `sourceCommandId`; automatic ones do
 * not. Both success paths invalidate the snapshot; a failed `compaction/end`
 * carries `error` and must not.
 */
export declare function isCompactionSuccess(event: EventLike): boolean;
/** Stable path-derived workspace id until Step 5 adds inode identity. */
export declare function workspaceIdFor(workspacePath: string | null): string | null;
