export interface SessionWorkspace {
    cwd: string;
    id: string | null;
    path: string | null;
}
/**
 * Resolve a workspace once per (session, cwd).
 *
 * A session without a cwd may reuse its own cached identity, but must never
 * borrow the "last workspace" of another session: that would leak rules and
 * snapshots across conversations.
 */
export declare class SessionWorkspaceCache {
    private readonly resolve;
    private readonly limit;
    private readonly bySession;
    constructor(resolve: (cwd: string) => Omit<SessionWorkspace, 'cwd'>, limit?: number);
    get(sessionId: string, cwd: string | null): string | null;
}
