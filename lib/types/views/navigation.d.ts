import type { Store } from '../db/store.js';
export interface DayView {
    reportRelPath: string;
    title: string;
    turnCount: number;
    sourceTurnIds: string[];
}
export interface PeriodView {
    reportRelPath: string;
    title: string;
    sourceDayPaths: string[];
    sourceTurnIds: string[];
}
/**
 * Rebuild one day's navigation view.
 *
 * The view is deterministic: one row per turn with its index title and a
 * pointer to the readable raw file. An optional LLM summary may be supplied,
 * but the pointer list is always complete.
 */
export declare function rebuildDayIndex(store: Store, mindRoot: string, workspaceId: string, localDate: string, rootId: string, summary?: string): DayView;
export declare function rebuildMonthIndex(store: Store, mindRoot: string, workspaceId: string, month: string, rootId: string): PeriodView;
export declare function rebuildWeekIndex(store: Store, mindRoot: string, workspaceId: string, localDate: string, rootId: string): PeriodView;
/** ISO-8601 week key plus its Monday..Sunday range (UTC dates). */
export declare function isoWeek(localDate: string): {
    key: string;
    start: string;
    end: string;
};
