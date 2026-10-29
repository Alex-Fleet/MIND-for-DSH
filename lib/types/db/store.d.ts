export interface TurnRow {
    turnId: string;
    workspaceId: string | null;
    sessionId: string;
    turnSeq: number;
    origin: string;
    endReason: string | null;
    occurredAt: string;
    localDate: string;
    rootId: string;
    rawRelPath: string;
    rawEventsRelPath?: string | null;
    rawChars?: number | null;
    provider: string | null;
    model: string | null;
}
export interface TurnEventRow {
    kind: string;
    seq: number | null;
    toolName: string | null;
    bytes: number;
}
export interface ClaimedJob {
    id: number;
    turnId: string;
    sessionId: string;
    turnSeq: number;
    workspaceId: string | null;
    attempts: number;
}
export declare function nowIso(): string;
export declare class Store {
    readonly dbPath: string;
    private readonly db;
    constructor(dbPath: string);
    /**
     * The root directory is 0700, but keep the database and its WAL/SHM
     * companions 0600 as well. This is defense in depth for custom mind roots
     * whose parent may be more permissive.
     */
    hardenFiles(): void;
    private migrate;
    private hasColumn;
    close(): void;
    private tx;
    ensureRoot(rootId: string, absoluteRoot: string): void;
    upsertWorkspaceIdentity(input: {
        workspaceId: string;
        displayName: string;
        projectId?: string | null;
        markerId?: string | null;
        gitRemote?: string | null;
        gitRootCommit?: string | null;
    }): void;
    upsertLocation(input: {
        locationId: string;
        workspaceId: string;
        volumeUuid: string | null;
        inode: number | null;
        currentPath: string;
        confidence: string;
    }): void;
    recordPath(workspaceId: string, workspacePath: string): void;
    insertTurnAndJob(turn: TurnRow, events: TurnEventRow[]): void;
    /**
     * One atomic capture commit: turn, events, job, and the fallback index.
     * The index is inside the same transaction so a crash cannot leave a turn
     * invisible to the timeline/FTS.
     */
    ingestTurn(turn: TurnRow, events: TurnEventRow[], index: {
        title: string;
        conclusion: string;
        topics: string[];
        status: 'current' | 'unsummarized';
        sourceRelPath: string | null;
        rootId: string;
        occurredAt: string;
    }): boolean;
    private insertTurnSql;
    claimJob(owner: string, leaseMs: number): ClaimedJob | null;
    completeJob(id: number): void;
    failJob(id: number, error: string, nextAt: string): void;
    /**
     * Re-arm legacy dead/failed summary jobs at startup. Pending jobs keep
     * their attempts and backoff: resetting them on every boot would turn a
     * permanent failure into an immediate retry burst. Legacy turns may predate
     * the provider/model columns, so they are included; the summarizer falls
     * back to its configured/default model.
     */
    /**
     * Re-arm failed summary jobs, but only for turns genuinely waiting for a
     * summary (`unsummarized`). Migrated turns whose legacy summary was
     * `invalid`/`merged` stay untouched: they were never meant to be
     * re-summarized (user decision, 2026-10-24), and re-arming them would burn a
     * model call per noise turn on every restart.
     */
    requeueSummaryFailures(now?: string): number;
    recoverStaleJobs(now?: string): number;
    getWatermark(sessionId: string): number | null;
    setWatermark(sessionId: string, lastSeq: number): void;
    updateCaptureStatus(sessionId: string, input: {
        lastSeq?: number;
        pending?: number;
        failed?: number;
        lastError?: string | null;
    }): void;
    upsertTurnIndex(input: {
        turnId: string;
        title: string;
        conclusion: string;
        topics: string[];
        sourceRelPath: string | null;
        rootId: string;
        occurredAt: string;
        status?: 'current' | 'unsummarized';
    }): void;
    private upsertTurnIndexSql;
    /**
     * Cheap day-index refresh for the capture hot path: count and first title
     * only, no full turn scan for the Markdown view. The full view is rebuilt
     * when the summary lands or during startup compensation.
     */
    refreshDayIndex(workspaceId: string, localDate: string, rootId: string): void;
    /** The last main-origin turn of a local day, for the per-turn increment. */
    getLastMainTurn(workspaceId: string, localDate: string): Record<string, unknown> | undefined;
    /** Days whose day_index is missing or has a stale turn count. */
    listMissingDayViews(limit: number): Array<Record<string, unknown>>;
    /** Turns captured before an index existed (legacy or crash recovery). */
    listMissingTurnIndexes(limit: number): Array<Record<string, unknown>>;
    /**
     * Every raw path already represented in the database.
     *
     * The startup orphan scan must treat a raw file as recovered when *any* turn
     * row points at it. Migrated legacy turns use a `legacy-<session>-<seq>` id,
     * so looking only at `<session>:<seq>` would re-ingest the same file as a
     * second turn, duplicate the day counts, and re-summarize it.
     */
    listRawPaths(): Set<string>;
    getTurnIndex(turnId: string): Record<string, unknown> | undefined;
    /**
     * Mark a fallback index as "not summarized yet". Used by the explicit
     * `summarizeEnabled=false` degradation path: the turn keeps its preview so
     * the timeline and FTS still show it, and re-enabling summarization picks it
     * up again. Never demotes `current`.
     *
     * Migrated turns whose legacy summary was `invalid`/`merged` keep the
     * distinct `invalid` status written by the migration, which is never
     * re-queued.
     */
    markTurnIndexUnsummarized(turnId: string): void;
    listTurnsForDay(workspaceId: string, localDate: string, limit?: number): Array<Record<string, unknown>>;
    upsertDayIndex(input: {
        workspaceId: string;
        localDate: string;
        title: string;
        turnCount: number;
        reportRelPath: string;
        rootId: string;
        sourceTurnIds: string[];
    }): void;
    listDaysInMonth(workspaceId: string, month: string): Array<Record<string, unknown>>;
    listRecentDays(workspaceId: string, beforeDate: string, limit: number): Array<Record<string, unknown>>;
    getDayIndex(workspaceId: string, localDate: string): Record<string, unknown> | undefined;
    /** Every turn index belonging to one workspace in [sinceIso, beforeIso). */
    listRecentTurnIndexes(workspaceId: string, sinceIso: string, beforeIso?: string): Array<Record<string, unknown>>;
    listDaysInRange(workspaceId: string, startDate: string, endDate: string): Array<Record<string, unknown>>;
    /** Day rows in [startDate, endDateExclusive), newest first. */
    listDaysBetween(workspaceId: string, startDate: string, endDateExclusive: string): Array<Record<string, unknown>>;
    /** Newest-first period reports (week/month) for one workspace. */
    listPeriods(workspaceId: string, kind: 'week' | 'month', limit?: number): Array<Record<string, unknown>>;
    /** Every period report of one kind, newest first. */
    listAllPeriods(workspaceId: string, kind: 'week' | 'month'): Array<Record<string, unknown>>;
    getPeriodIndex(workspaceId: string, kind: 'week' | 'month', period: string): Record<string, unknown> | undefined;
    upsertPeriodIndex(input: {
        workspaceId: string;
        kind: 'week' | 'month';
        period: string;
        title: string;
        reportRelPath: string;
        rootId: string;
        sourceDayPaths: string[];
        sourceTurnIds: string[];
    }): void;
    insertProposal(input: {
        id: string;
        workspaceId: string | null;
        layer: 'rule';
        title: string;
        content: string;
        sourceTurn: string | null;
    }): void;
    private hasPendingProposal;
    findRuleByContent(workspaceId: string | null, title: string, content: string): Record<string, unknown> | undefined;
    upsertCognitionEntry(input: {
        id: string;
        workspaceId: string | null;
        layer: 'rule';
        title: string;
        conclusion: string;
        sourceRelPath: string | null;
        rootId: string;
    }): void;
    listCognitionEntries(workspaceId: string, layer?: string): Array<Record<string, unknown>>;
    listProposals(status?: string): Array<Record<string, unknown>>;
    /**
     * Cheap stamp that changes whenever the workspace's injected rule set changes
     * (a rule approved, edited, version-bumped, or toggled). The snapshot cache
     * keys on it, so an approval is visible in the very next turn of the same
     * session without the UI having to know which session is open.
     */
    ruleStamp(workspaceId: string): string;
    findActiveLocation(volumeUuid: string | null, inode: number | null): Record<string, unknown> | undefined;
    getLocation(locationId: string): Record<string, unknown> | undefined;
    listLocations(workspaceId: string): Array<Record<string, unknown>>;
    updateLocationPath(locationId: string, currentPath: string): void;
    retireLocation(locationId: string): void;
    findWorkspaceByMarker(markerId: string): Record<string, unknown> | undefined;
    findWorkspaceByGit(gitRemote: string | null, gitRootCommit: string | null): Record<string, unknown> | undefined;
    /**
     * Last-resort identity lookup for a path that no longer exists on disk.
     * Recovery must reuse the historical workspace instead of minting a
     * path-hash "shadow" workspace.
     */
    findWorkspaceByPath(workspacePath: string): Record<string, unknown> | undefined;
    /** Active-location lookup by canonical path (the DSH registry path). */
    findWorkspaceByActivePath(workspacePath: string): Record<string, unknown> | undefined;
    updateWorkspaceDisplayName(workspaceId: string, displayName: string): void;
    getWorkspaceIdentity(workspaceId: string): Record<string, unknown> | undefined;
    searchTurnIndex(query: string, limit: number): Array<Record<string, unknown>>;
    countTurns(): number;
    getTurn(turnId: string): Record<string, unknown> | undefined;
    /**
     * Most recent known model for a session. Used when a later turn has no
     * `request/header` (DSH only records one on initial/resume/route changes).
     */
    findLastTurnModel(sessionId: string): {
        provider: string;
        model: string;
    } | null;
    countTurnEvents(turnId: string): number;
    /** Cache a legacy file's character length after the first full decode. */
    setRawChars(turnId: string, chars: number): void;
    listJobs(state?: string): Array<Record<string, unknown>>;
    /** One keyset page of day rows, newest first, joined to the workspace name. */
    listDayPage(beforeDate: string | null, beforeWorkspaceId: string | null, limit: number, workspaceId?: string | null): Array<Record<string, unknown>>;
    getRootAbsolute(rootId: string): string | undefined;
    getCognitionEntry(id: string): Record<string, unknown> | undefined;
    /**
     * Bounded projection of the current cognition, newest first per layer.
     * `workspaceId`: undefined means every workspace, null means global only.
     */
    listAllCognitionEntries(limit: number, workspaceId?: string | null): Array<Record<string, unknown>>;
    createCognitionEntry(input: {
        id: string;
        workspaceId: string | null;
        layer: 'rule';
        title: string;
        conclusion: string;
        enabled: boolean;
        rootId: string;
    }): void;
    /** Replace one entry's editable fields and advance its version. */
    updateCognitionEntry(input: {
        id: string;
        workspaceId: string | null;
        layer: 'rule';
        title: string;
        conclusion: string;
        enabled: boolean;
    }): boolean;
    getProposal(id: string): Record<string, unknown> | undefined;
    /** Bounded proposal list; `status === null` means every status. */
    listProposalsPage(status: string | null, limit: number): Array<Record<string, unknown>>;
    countProposals(status: string): number;
    /**
     * Approve or reject one pending proposal. Approval inserts the entry and
     * review in one transaction; a second review throws instead of rewriting.
     */
    resolveProposal(input: {
        id: string;
        action: 'approve' | 'reject';
        reviewer: string;
        reason: string | null;
        workspaceId?: string | null;
    }): {
        entryId: string | null;
    };
    listWorkspaces(limit?: number): Array<Record<string, unknown>>;
    listAllLocations(limit?: number): Array<Record<string, unknown>>;
    getSetting(key: string): string | null;
    setSetting(key: string, value: string): void;
}
