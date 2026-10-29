import type { Store } from '../db/store.js';
export interface ResolvedWorkspace {
    workspaceId: string;
    workspacePath: string;
    volumeUuid: string;
    inode: number;
    confidence: 'primary' | 'marker' | 'git' | 'low';
    created: boolean;
}
/**
 * Resolve a workspace path to a stable logical identity.
 *
 * Primary identity is (volume UUID, inode): rename and same-volume moves keep
 * it. Copy detection compares the old location's inode with the one currently
 * at the old path: if the old path still holds a different directory, this is
 * a copy and forks a new identity. Marker and git identity are fallbacks for
 * copies / cross-volume moves.
 */
export declare function resolveWorkspace(store: Store, inputPath: string, options?: {
    writeMarker?: boolean;
}): ResolvedWorkspace;
