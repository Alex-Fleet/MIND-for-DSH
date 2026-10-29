/** Beijing time has no DST; a fixed +08:00 offset is exact. */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
/**
 * Local calendar date in Beijing time with a configurable day boundary.
 * A boundary of 240 means 00:00–03:59 belongs to the previous day.
 */
export function localDateOf(timestamp, dayBoundaryMinutes = 240) {
    const shifted = new Date(timestamp + BEIJING_OFFSET_MS - dayBoundaryMinutes * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
}
/** HH:MM in Beijing time for a stored UTC ISO timestamp. */
export function beijingTimeOf(iso) {
    const parsed = Date.parse(iso);
    if (!Number.isFinite(parsed))
        return '';
    return new Date(parsed + BEIJING_OFFSET_MS).toISOString().slice(11, 16);
}
/** YYYY-MM-DD in Beijing time for a stored UTC ISO timestamp. */
export function beijingDateOf(iso) {
    const parsed = Date.parse(iso);
    if (!Number.isFinite(parsed))
        return '';
    return new Date(parsed + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
