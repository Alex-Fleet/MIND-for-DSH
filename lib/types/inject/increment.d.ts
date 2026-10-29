import type { Store } from '../db/store.js';
/**
 * One-line "what just happened" increment for the current turn.
 *
 * This is intentionally tiny (<200 chars): it is appended to the accepted
 * user batch once per turn instead of forcing the whole snapshot to change.
 */
export declare function buildIncrement(store: Store, workspaceId: string, localDate: string): string | null;
