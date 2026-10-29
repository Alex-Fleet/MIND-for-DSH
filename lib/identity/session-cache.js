/**
 * Resolve a workspace once per (session, cwd).
 *
 * A session without a cwd may reuse its own cached identity, but must never
 * borrow the "last workspace" of another session: that would leak rules and
 * snapshots across conversations.
 */
export class SessionWorkspaceCache {
    resolve;
    limit;
    bySession = new Map();
    constructor(resolve, limit = 500) {
        this.resolve = resolve;
        this.limit = limit;
    }
    get(sessionId, cwd) {
        // Diagnostic contexts without an agent id must not share a cache slot.
        const cacheable = sessionId !== '' && sessionId !== 'unknown';
        const cached = cacheable ? this.bySession.get(sessionId) : undefined;
        if (cwd === null || cwd === '')
            return cached?.id ?? null;
        if (cached !== undefined && cached.cwd === cwd)
            return cached.id;
        const resolved = this.resolve(cwd);
        if (!cacheable)
            return resolved.id;
        this.bySession.set(sessionId, { cwd, ...resolved });
        while (this.bySession.size > this.limit) {
            const oldest = this.bySession.keys().next().value;
            if (oldest === undefined)
                break;
            this.bySession.delete(oldest);
        }
        return resolved.id;
    }
}
