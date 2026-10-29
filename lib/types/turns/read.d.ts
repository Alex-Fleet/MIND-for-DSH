import type { Store } from '../db/store.js';
export interface TurnChunk {
    turnId: string;
    chunk: string;
    offset: number;
    total: number;
    next: number | null;
    rawPath: string;
}
/**
 * Read one character chunk of a captured turn.
 *
 * The path is resolved against the turn's recorded root and is rejected when
 * it escapes that root. Small files take one read; larger files are decoded
 * in bounded chunks so a chunk request never holds the whole file in memory.
 */
export declare function readTurnChunk(store: Store, mindRoot: string, turnId: string, offsetChars?: number, maxChars?: number, options?: {
    redact?: boolean;
}): TurnChunk;
/** Count decoded characters without holding the whole file in memory. */
export declare function countChars(target: string): number;
