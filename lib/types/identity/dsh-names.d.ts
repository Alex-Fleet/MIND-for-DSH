import type { Store } from '../db/store.js';
export interface DshWorkspaceRecord {
    path?: unknown;
    title?: unknown;
}
/**
 * Project DSH's user-visible workspace titles onto MIND's identity rows.
 * The automatic `default-workspace` title is stored verbatim; the client
 * localizes it with {@link displayWorkspaceName} in the reader's language.
 */
export declare function syncDshWorkspaceNames(store: Store, records: readonly DshWorkspaceRecord[]): number;
/** The label the DSH UI shows for a stored workspace title. */
export declare function displayWorkspaceName(name: string, language: string): string;
