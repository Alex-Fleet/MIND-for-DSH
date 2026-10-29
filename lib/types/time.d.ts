/** Beijing time has no DST; a fixed +08:00 offset is exact. */
export declare const BEIJING_OFFSET_MS: number;
/**
 * Local calendar date in Beijing time with a configurable day boundary.
 * A boundary of 240 means 00:00–03:59 belongs to the previous day.
 */
export declare function localDateOf(timestamp: number, dayBoundaryMinutes?: number): string;
/** HH:MM in Beijing time for a stored UTC ISO timestamp. */
export declare function beijingTimeOf(iso: string): string;
/** YYYY-MM-DD in Beijing time for a stored UTC ISO timestamp. */
export declare function beijingDateOf(iso: string): string;
