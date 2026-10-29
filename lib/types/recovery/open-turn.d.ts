export interface RecoverableEvent {
    type: string;
    seq: number;
    data?: unknown;
}
/** The last turn/start that has no matching turn/end, if any. */
export declare function findOpenTurn(events: readonly RecoverableEvent[]): {
    turn: number;
    startSeq: number;
} | null;
