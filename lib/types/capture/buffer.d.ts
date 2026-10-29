import type { CapturedTurn } from './types.js';
export interface SessionLike {
    id: string;
    header?: {
        cwd?: string;
        origin?: 'subagent';
        delegationDepth?: number;
    };
}
export interface EventLike {
    type: string;
    seq?: number;
    time?: number;
    data?: unknown;
}
/**
 * Per-session turn accumulator.
 *
 * `turn/end` carries only `{ turn, reason }`; the messages and tool events
 * arrive before it. Buffering them per session lets the capture layer persist
 * a complete turn when the end marker arrives.
 */
export declare class TurnBuffer {
    private readonly open;
    push(session: SessionLike, event: EventLike): CapturedTurn | null;
    /** Close every open turn (shutdown / hot reload) without losing it. */
    flushAll(): CapturedTurn[];
    size(): number;
}
