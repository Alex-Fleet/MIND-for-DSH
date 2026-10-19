import fs from 'node:fs'
import path from 'node:path'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js'

type SqliteModule = typeof import('node:sqlite')

// Resolve the builtin without a static `node:sqlite` import so bundlers and
// test runners do not try to resolve it as a package.
const sqlite = (process as unknown as { getBuiltinModule(id: string): SqliteModule })
  .getBuiltinModule('node:sqlite')
const DatabaseSync = sqlite.DatabaseSync
type Database = InstanceType<typeof sqlite.DatabaseSync>

export interface TurnRow {
  turnId: string
  workspaceId: string | null
  sessionId: string
  turnSeq: number
  origin: string
  endReason: string | null
  occurredAt: string
  localDate: string
  rootId: string
  rawRelPath: string
  rawEventsRelPath?: string | null
  rawChars?: number | null
  provider: string | null
  model: string | null
}

export interface TurnEventRow {
  kind: string
  seq: number | null
  toolName: string | null
  bytes: number
}

export interface ClaimedJob {
  id: number
  turnId: string
  sessionId: string
  turnSeq: number
  workspaceId: string | null
  attempts: number
}

export function nowIso(): string {
  return new Date().toISOString()
}

export class Store {
  readonly dbPath: string
  private readonly db: Database

  constructor(dbPath: string) {
    this.dbPath = dbPath
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    // FULL makes a committed turn survive a power loss, not just a process
    // crash; the capture rate is low enough that the fsync cost is irrelevant.
    this.db.exec('PRAGMA synchronous = FULL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
    const current = Number(row?.user_version ?? 0)
    if (current > SCHEMA_VERSION) {
      throw new Error(`MIND database schema v${current} is newer than code v${SCHEMA_VERSION}`)
    }
    // Always verify, not only when the version number is older: a prior buggy
    // build can stamp the current version while leaving a column missing.
    this.tx(() => {
      this.db.exec(SCHEMA_SQL)
      if (!this.hasColumn('cognition_entry', 'enabled')) {
        this.db.exec('ALTER TABLE cognition_entry ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
      }
      if (!this.hasColumn('turns', 'provider')) {
        this.db.exec('ALTER TABLE turns ADD COLUMN provider TEXT')
      }
      if (!this.hasColumn('turns', 'model')) {
        this.db.exec('ALTER TABLE turns ADD COLUMN model TEXT')
      }
      if (!this.hasColumn('turns', 'raw_events_rel_path')) {
        this.db.exec('ALTER TABLE turns ADD COLUMN raw_events_rel_path TEXT')
      }
      if (!this.hasColumn('turns', 'raw_chars')) {
        this.db.exec('ALTER TABLE turns ADD COLUMN raw_chars INTEGER')
      }
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    })
  }

  private hasColumn(table: 'cognition_entry' | 'turns', column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>
    return rows.some(row => row.name === column)
  }

  close(): void {
    this.db.close()
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // ignore rollback failure
      }
      throw error
    }
  }

  ensureRoot(rootId: string, absoluteRoot: string): void {
    this.db
      .prepare('INSERT INTO root(root_id, absolute_root) VALUES (?, ?) ON CONFLICT(root_id) DO UPDATE SET absolute_root = excluded.absolute_root')
      .run(rootId, absoluteRoot)
  }

  upsertWorkspaceIdentity(input: {
    workspaceId: string
    displayName: string
    projectId?: string | null
    markerId?: string | null
    gitRemote?: string | null
    gitRootCommit?: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO workspace_identity(workspace_id, display_name, project_id, marker_id, git_remote, git_root_commit, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           display_name = excluded.display_name,
           project_id = COALESCE(excluded.project_id, workspace_identity.project_id),
           marker_id = COALESCE(excluded.marker_id, workspace_identity.marker_id),
           git_remote = COALESCE(excluded.git_remote, workspace_identity.git_remote),
           git_root_commit = COALESCE(excluded.git_root_commit, workspace_identity.git_root_commit)`,
      )
      .run(
        input.workspaceId,
        input.displayName,
        input.projectId ?? null,
        input.markerId ?? null,
        input.gitRemote ?? null,
        input.gitRootCommit ?? null,
        nowIso(),
      )
  }

  upsertLocation(input: {
    locationId: string
    workspaceId: string
    volumeUuid: string | null
    inode: number | null
    currentPath: string
    confidence: string
  }): void {
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO workspace_location(location_id, workspace_id, volume_uuid, inode, current_path, status, confidence, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
         ON CONFLICT(location_id) DO UPDATE SET
           current_path = excluded.current_path,
           last_seen = excluded.last_seen,
           status = 'active'`,
      )
      .run(
        input.locationId,
        input.workspaceId,
        input.volumeUuid,
        input.inode,
        input.currentPath,
        input.confidence,
        now,
        now,
      )
  }

  recordPath(workspaceId: string, workspacePath: string): void {
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO workspace_path_history(workspace_id, path, first_seen, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id, path, first_seen) DO UPDATE SET last_seen = excluded.last_seen`,
      )
      .run(workspaceId, workspacePath, now, now)
  }

  insertTurnAndJob(turn: TurnRow, events: TurnEventRow[]): void {
    this.tx(() => this.insertTurnSql(turn, events, nowIso()))
  }

  /**
   * One atomic capture commit: turn, events, job, and the fallback index.
   * The index is inside the same transaction so a crash cannot leave a turn
   * invisible to the timeline/FTS.
   */
  ingestTurn(
    turn: TurnRow,
    events: TurnEventRow[],
    index: {
      title: string
      conclusion: string
      topics: string[]
      status: 'current' | 'unsummarized'
      sourceRelPath: string | null
      rootId: string
      occurredAt: string
    },
  ): boolean {
    return this.tx(() => {
      const existed = this.db.prepare('SELECT 1 FROM turns WHERE turn_id = ?').get(turn.turnId) !== undefined
      this.insertTurnSql(turn, events, nowIso())
      this.upsertTurnIndexSql({
        turnId: turn.turnId,
        title: index.title,
        conclusion: index.conclusion,
        topics: index.topics,
        status: index.status,
        sourceRelPath: index.sourceRelPath,
        rootId: index.rootId,
        occurredAt: index.occurredAt,
      })
      return !existed
    })
  }

  private insertTurnSql(turn: TurnRow, events: TurnEventRow[], now: string): void {
      this.db
        .prepare(
          `INSERT INTO turns(turn_id, workspace_id, session_id, turn_seq, origin, source_status, end_reason,
                             occurred_at, local_date, root_id, raw_rel_path, raw_events_rel_path, raw_chars,
                             provider, model, created_at)
           VALUES (?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(turn_id) DO UPDATE SET
             end_reason = COALESCE(excluded.end_reason, turns.end_reason),
             raw_rel_path = COALESCE(excluded.raw_rel_path, turns.raw_rel_path),
             raw_events_rel_path = COALESCE(excluded.raw_events_rel_path, turns.raw_events_rel_path),
             raw_chars = COALESCE(excluded.raw_chars, turns.raw_chars),
             provider = COALESCE(excluded.provider, turns.provider),
             model = COALESCE(excluded.model, turns.model)`,
        )
        .run(
          turn.turnId,
          turn.workspaceId,
          turn.sessionId,
          turn.turnSeq,
          turn.origin,
          turn.endReason,
          turn.occurredAt,
          turn.localDate,
          turn.rootId,
          turn.rawRelPath,
          turn.rawEventsRelPath ?? null,
          turn.rawChars ?? null,
          turn.provider ?? null,
          turn.model ?? null,
          now,
        )

      this.db.prepare('DELETE FROM turn_events WHERE turn_id = ?').run(turn.turnId)
      const insertEvent = this.db.prepare(
        'INSERT INTO turn_events(turn_id, kind, seq, tool_name, bytes, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const event of events) {
        insertEvent.run(turn.turnId, event.kind, event.seq, event.toolName, event.bytes, now)
      }

      this.db
        .prepare(
          `INSERT INTO capture_job(turn_id, session_id, turn_seq, workspace_id, state, attempts, next_at, created_at)
           VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
           ON CONFLICT(turn_id) DO NOTHING`,
        )
        .run(turn.turnId, turn.sessionId, turn.turnSeq, turn.workspaceId, now, now)
  }

  claimJob(owner: string, leaseMs: number): ClaimedJob | null {
    const now = nowIso()
    return this.tx(() => {
      const row = this.db
        .prepare(
          `SELECT id, turn_id, session_id, turn_seq, workspace_id, attempts
           FROM capture_job
           WHERE state = 'pending' AND next_at <= ?
           ORDER BY id LIMIT 1`,
        )
        .get(now) as
        | { id: number; turn_id: string; session_id: string; turn_seq: number; workspace_id: string | null; attempts: number }
        | undefined
      if (row === undefined) return null
      const leaseUntil = new Date(Date.now() + leaseMs).toISOString()
      this.db
        .prepare(
          `UPDATE capture_job
           SET state = 'running', owner = ?, lease_until = ?, attempts = attempts + 1
           WHERE id = ?`,
        )
        .run(owner, leaseUntil, row.id)
      return {
        id: row.id,
        turnId: row.turn_id,
        sessionId: row.session_id,
        turnSeq: row.turn_seq,
        workspaceId: row.workspace_id,
        attempts: row.attempts + 1,
      }
    })
  }

  completeJob(id: number): void {
    this.db.prepare("UPDATE capture_job SET state = 'done', last_error = NULL WHERE id = ?").run(id)
  }

  failJob(id: number, error: string, nextAt: string): void {
    // Summary failures are rescheduled forever with a capped backoff; there is
    // no terminal "dead" state for an enrichable raw turn.
    this.db
      .prepare("UPDATE capture_job SET state = 'pending', next_at = ?, last_error = ?, owner = NULL, lease_until = NULL WHERE id = ?")
      .run(nextAt, error.slice(0, 500), id)
  }

  /**
   * Re-arm every retryable summary job at startup: legacy dead/failed rows,
   * and healthy pending rows whose backoff would otherwise wait up to 30
   * minutes. Only turns with a persisted provider/model are eligible, so this
   * cannot loop on a turn whose model is genuinely unknown.
   */
  requeueSummaryFailures(now = nowIso()): number {
    const result = this.db
      .prepare(
        `UPDATE capture_job
         SET state = 'pending', attempts = 0, next_at = ?, owner = NULL, lease_until = NULL, last_error = NULL
         WHERE state IN ('dead', 'failed', 'pending')
           AND turn_id IN (SELECT turn_id FROM turns WHERE provider IS NOT NULL AND model IS NOT NULL)`,
      )
      .run(now)
    return Number(result.changes)
  }

  recoverStaleJobs(now = nowIso()): number {
    const result = this.db
      .prepare(
        `UPDATE capture_job
         SET state = 'pending', owner = NULL, lease_until = NULL, next_at = ?
         WHERE state = 'running' AND (lease_until IS NULL OR lease_until < ?)`,
      )
      .run(now, now)
    return Number(result.changes)
  }

  getWatermark(sessionId: string): number | null {
    const row = this.db
      .prepare('SELECT last_seq FROM session_watermark WHERE session_id = ?')
      .get(sessionId) as { last_seq: number } | undefined
    return row?.last_seq ?? null
  }

  setWatermark(sessionId: string, lastSeq: number): void {
    this.db
      .prepare(
        `INSERT INTO session_watermark(session_id, last_seq, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq), updated_at = excluded.updated_at`,
      )
      .run(sessionId, lastSeq, nowIso())
  }

  updateCaptureStatus(sessionId: string, input: { lastSeq?: number; pending?: number; failed?: number; lastError?: string | null }): void {
    const current = this.db
      .prepare('SELECT last_seq, pending, failed, last_error FROM capture_status WHERE session_id = ?')
      .get(sessionId) as { last_seq: number | null; pending: number; failed: number; last_error: string | null } | undefined
    this.db
      .prepare(
        `INSERT INTO capture_status(session_id, last_seq, pending, failed, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           last_seq = COALESCE(excluded.last_seq, capture_status.last_seq),
           pending = excluded.pending,
           failed = excluded.failed,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(
        sessionId,
        input.lastSeq ?? current?.last_seq ?? null,
        input.pending ?? current?.pending ?? 0,
        input.failed ?? current?.failed ?? 0,
        input.lastError === undefined ? current?.last_error ?? null : input.lastError,
        nowIso(),
      )
  }

  upsertTurnIndex(input: {
    turnId: string
    title: string
    conclusion: string
    topics: string[]
    sourceRelPath: string | null
    rootId: string
    occurredAt: string
    status?: 'current' | 'unsummarized'
  }): void {
    this.upsertTurnIndexSql(input)
  }

  private upsertTurnIndexSql(input: {
    turnId: string
    title: string
    conclusion: string
    topics: string[]
    sourceRelPath: string | null
    rootId: string
    occurredAt: string
    status?: 'current' | 'unsummarized'
  }): void {
    this.db
      .prepare(
        `INSERT INTO turn_index(turn_id, title, conclusion, topics_json, level, status, source_rel_path, root_id, occurred_at)
         VALUES (?, ?, ?, ?, 'turn', ?, ?, ?, ?)
         ON CONFLICT(turn_id) DO UPDATE SET
           title = excluded.title,
           conclusion = excluded.conclusion,
           topics_json = excluded.topics_json,
           status = excluded.status,
           source_rel_path = excluded.source_rel_path,
           root_id = excluded.root_id,
           occurred_at = excluded.occurred_at`,
      )
      .run(
        input.turnId,
        input.title,
        input.conclusion,
        JSON.stringify(input.topics),
        input.status ?? 'current',
        input.sourceRelPath,
        input.rootId,
        input.occurredAt,
      )
  }

  /**
   * Cheap day-index refresh for the capture hot path: count and first title
   * only, no full turn scan for the Markdown view. The full view is rebuilt
   * when the summary lands or during startup compensation.
   */
  refreshDayIndex(workspaceId: string, localDate: string, rootId: string): void {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c,
                (SELECT ti.title
                 FROM turns t2 LEFT JOIN turn_index ti ON ti.turn_id = t2.turn_id
                 WHERE t2.workspace_id = ? AND t2.local_date = ?
                 ORDER BY t2.occurred_at, t2.turn_seq LIMIT 1) AS title
         FROM turns
         WHERE workspace_id = ? AND local_date = ?`,
      )
      .get(workspaceId, localDate, workspaceId, localDate) as { c?: number; title?: string | null } | undefined
    this.db
      .prepare(
        `INSERT INTO day_index(workspace_id, local_date, title, turn_count, report_rel_path, root_id, source_turn_ids_json)
         VALUES (?, ?, ?, ?, '', ?, '[]')
         ON CONFLICT(workspace_id, local_date) DO UPDATE SET
           title = excluded.title,
           turn_count = excluded.turn_count,
           root_id = excluded.root_id`,
      )
      .run(workspaceId, localDate, String(row?.title ?? localDate), Number(row?.c ?? 0), rootId)
  }

  /** The last main-origin turn of a local day, for the per-turn increment. */
  getLastMainTurn(workspaceId: string, localDate: string): Record<string, unknown> | undefined {
    return this.db
      .prepare(
        `SELECT t.turn_id, t.occurred_at, t.raw_rel_path, ti.title
         FROM turns t LEFT JOIN turn_index ti ON ti.turn_id = t.turn_id
         WHERE t.workspace_id = ? AND t.local_date = ? AND t.origin = 'main'
         ORDER BY t.occurred_at DESC, t.turn_seq DESC
         LIMIT 1`,
      )
      .get(workspaceId, localDate) as Record<string, unknown> | undefined
  }

  /** Days whose day_index is missing or has a stale turn count. */
  listMissingDayViews(limit: number): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT t.workspace_id, t.local_date, MAX(t.root_id) AS root_id
         FROM turns t
         LEFT JOIN day_index d ON d.workspace_id = t.workspace_id AND d.local_date = t.local_date
         WHERE d.local_date IS NULL
            OR d.turn_count != (SELECT COUNT(*) FROM turns t2
                                WHERE t2.workspace_id = t.workspace_id AND t2.local_date = t.local_date)
         GROUP BY t.workspace_id, t.local_date
         LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>
  }

  /** Turns captured before an index existed (legacy or crash recovery). */
  listMissingTurnIndexes(limit: number): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT t.turn_id, t.workspace_id, t.local_date, t.raw_rel_path, t.root_id, t.occurred_at
         FROM turns t
         LEFT JOIN turn_index ti ON ti.turn_id = t.turn_id
         WHERE ti.turn_id IS NULL
         ORDER BY t.occurred_at
         LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>
  }

  getTurnIndex(turnId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM turn_index WHERE turn_id = ?').get(turnId) as Record<string, unknown> | undefined
  }

  listTurnsForDay(workspaceId: string, localDate: string, limit?: number): Array<Record<string, unknown>> {
    const sql = `SELECT t.turn_id, t.session_id, t.turn_seq, t.origin, t.occurred_at, t.raw_rel_path,
                        ti.title, ti.conclusion, ti.status AS index_status
                 FROM turns t
                 LEFT JOIN turn_index ti ON ti.turn_id = t.turn_id
                 WHERE t.workspace_id = ? AND t.local_date = ?
                 ORDER BY t.occurred_at, t.turn_seq${limit === undefined ? '' : ' LIMIT ?'}`
    const statement = this.db.prepare(sql)
    return (limit === undefined
      ? statement.all(workspaceId, localDate)
      : statement.all(workspaceId, localDate, limit)) as Array<Record<string, unknown>>
  }

  upsertDayIndex(input: {
    workspaceId: string
    localDate: string
    title: string
    turnCount: number
    reportRelPath: string
    rootId: string
    sourceTurnIds: string[]
  }): void {
    this.db
      .prepare(
        `INSERT INTO day_index(workspace_id, local_date, title, turn_count, report_rel_path, root_id, source_turn_ids_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, local_date) DO UPDATE SET
           title = excluded.title,
           turn_count = excluded.turn_count,
           report_rel_path = excluded.report_rel_path,
           root_id = excluded.root_id,
           source_turn_ids_json = excluded.source_turn_ids_json`,
      )
      .run(
        input.workspaceId,
        input.localDate,
        input.title,
        input.turnCount,
        input.reportRelPath,
        input.rootId,
        JSON.stringify(input.sourceTurnIds),
      )
  }

  listDaysInMonth(workspaceId: string, month: string): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT * FROM day_index
         WHERE workspace_id = ? AND local_date LIKE ?
         ORDER BY local_date`,
      )
      .all(workspaceId, `${month}%`) as Array<Record<string, unknown>>
  }

  listRecentDays(workspaceId: string, beforeDate: string, limit: number): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT * FROM day_index
         WHERE workspace_id = ? AND local_date < ?
         ORDER BY local_date DESC LIMIT ?`,
      )
      .all(workspaceId, beforeDate, limit) as Array<Record<string, unknown>>
  }

  listDaysInRange(workspaceId: string, startDate: string, endDate: string): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT * FROM day_index
         WHERE workspace_id = ? AND local_date >= ? AND local_date <= ?
         ORDER BY local_date`,
      )
      .all(workspaceId, startDate, endDate) as Array<Record<string, unknown>>
  }

  upsertPeriodIndex(input: {
    workspaceId: string
    kind: 'week' | 'month'
    period: string
    title: string
    reportRelPath: string
    rootId: string
    sourceDayPaths: string[]
    sourceTurnIds: string[]
  }): void {
    this.db
      .prepare(
        `INSERT INTO period_index(workspace_id, kind, period, title, report_rel_path, root_id,
                                  source_day_rel_paths_json, source_turn_ids_json, legacy_synthesized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(workspace_id, kind, period) DO UPDATE SET
           title = excluded.title,
           report_rel_path = excluded.report_rel_path,
           root_id = excluded.root_id,
           source_day_rel_paths_json = excluded.source_day_rel_paths_json,
           source_turn_ids_json = excluded.source_turn_ids_json`,
      )
      .run(
        input.workspaceId,
        input.kind,
        input.period,
        input.title,
        input.reportRelPath,
        input.rootId,
        JSON.stringify(input.sourceDayPaths),
        JSON.stringify(input.sourceTurnIds),
      )
  }

  insertProposal(input: {
    id: string
    workspaceId: string | null
    layer: 'user' | 'rule'
    title: string
    content: string
    sourceTurn: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO memory_proposal(id, workspace_id, layer, title, content, status, source_turn, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(input.id, input.workspaceId, input.layer, input.title, input.content, input.sourceTurn, nowIso())
  }

  upsertCognitionEntry(input: {
    id: string
    workspaceId: string | null
    layer: 'project' | 'whiteboard' | 'user' | 'rule'
    title: string
    conclusion: string
    sourceRelPath: string | null
    rootId: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO cognition_entry(id, workspace_id, layer, title, conclusion, status, version, source_rel_path, root_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 'current', 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           conclusion = excluded.conclusion,
           status = 'current',
           version = CASE
             WHEN cognition_entry.title IS excluded.title
              AND cognition_entry.conclusion IS excluded.conclusion
              AND cognition_entry.workspace_id IS excluded.workspace_id
              AND cognition_entry.layer IS excluded.layer
             THEN cognition_entry.version
             ELSE cognition_entry.version + 1
           END,
           source_rel_path = excluded.source_rel_path,
           updated_at = CASE
             WHEN cognition_entry.title IS excluded.title
              AND cognition_entry.conclusion IS excluded.conclusion
              AND cognition_entry.workspace_id IS excluded.workspace_id
              AND cognition_entry.layer IS excluded.layer
             THEN cognition_entry.updated_at
             ELSE excluded.updated_at
           END`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.layer,
        input.title,
        input.conclusion,
        input.sourceRelPath,
        input.rootId,
        nowIso(),
      )
  }

  listCognitionEntries(workspaceId: string, layer?: string): Array<Record<string, unknown>> {
    // Global entries (workspace_id IS NULL) apply to every workspace.
    if (layer === undefined) {
      return this.db
        .prepare(
          "SELECT * FROM cognition_entry WHERE (workspace_id = ? OR workspace_id IS NULL) AND status = 'current' AND enabled = 1 ORDER BY layer, updated_at DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    }
    return this.db
      .prepare(
        "SELECT * FROM cognition_entry WHERE (workspace_id = ? OR workspace_id IS NULL) AND layer = ? AND status = 'current' AND enabled = 1 ORDER BY updated_at DESC",
      )
      .all(workspaceId, layer) as Array<Record<string, unknown>>
  }

  listProposals(status = 'pending'): Array<Record<string, unknown>> {
    return this.db
      .prepare('SELECT * FROM memory_proposal WHERE status = ? ORDER BY created_at')
      .all(status) as Array<Record<string, unknown>>
  }

  findActiveLocation(volumeUuid: string | null, inode: number | null): Record<string, unknown> | undefined {
    if (volumeUuid === null || inode === null) return undefined
    return this.db
      .prepare("SELECT * FROM workspace_location WHERE volume_uuid = ? AND inode = ? AND status = 'active'")
      .get(volumeUuid, inode) as Record<string, unknown> | undefined
  }

  getLocation(locationId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM workspace_location WHERE location_id = ?').get(locationId) as
      | Record<string, unknown>
      | undefined
  }

  listLocations(workspaceId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM workspace_location WHERE workspace_id = ? AND status = 'active'")
      .all(workspaceId) as Array<Record<string, unknown>>
  }

  updateLocationPath(locationId: string, currentPath: string): void {
    this.db
      .prepare('UPDATE workspace_location SET current_path = ?, last_seen = ? WHERE location_id = ?')
      .run(currentPath, nowIso(), locationId)
  }

  retireLocation(locationId: string): void {
    this.db
      .prepare("UPDATE workspace_location SET status = 'retired', retired_at = ? WHERE location_id = ?")
      .run(nowIso(), locationId)
  }

  findWorkspaceByMarker(markerId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM workspace_identity WHERE marker_id = ?').get(markerId) as
      | Record<string, unknown>
      | undefined
  }

  findWorkspaceByGit(gitRemote: string | null, gitRootCommit: string | null): Record<string, unknown> | undefined {
    if (gitRemote === null && gitRootCommit === null) return undefined
    return this.db
      .prepare(
        `SELECT * FROM workspace_identity
         WHERE (? IS NOT NULL AND git_remote = ?)
            OR (? IS NOT NULL AND git_root_commit = ?)
         LIMIT 1`,
      )
      .get(gitRemote, gitRemote, gitRootCommit, gitRootCommit) as Record<string, unknown> | undefined
  }

  getWorkspaceIdentity(workspaceId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM workspace_identity WHERE workspace_id = ?').get(workspaceId) as
      | Record<string, unknown>
      | undefined
  }

  searchTurnIndex(query: string, limit: number): Array<Record<string, unknown>> {
    const safe = `"${query.replace(/"/g, '""')}"`
    try {
      const rows = this.db
        .prepare(
          `SELECT ti.turn_id, ti.title, ti.conclusion, ti.source_rel_path, ti.occurred_at
           FROM turn_index_fts f
           JOIN turn_index ti ON ti.rowid = f.rowid
           WHERE turn_index_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(safe, limit) as Array<Record<string, unknown>>
      if (rows.length > 0) return rows
    } catch {
      // fall through to the substring fallback
    }
    // unicode61 does not split CJK phrases into useful tokens; substring
    // matching keeps search usable for Chinese memory entries.
    return this.db
      .prepare(
        `SELECT turn_id, title, conclusion, source_rel_path, occurred_at
         FROM turn_index
         WHERE title LIKE ? OR conclusion LIKE ?
         ORDER BY occurred_at DESC
         LIMIT ?`,
      )
      .all(`%${query}%`, `%${query}%`, limit) as Array<Record<string, unknown>>
  }

  countTurns(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS c FROM turns').get() as { c: number }).c)
  }

  getTurn(turnId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM turns WHERE turn_id = ?').get(turnId) as Record<string, unknown> | undefined
  }

  countTurnEvents(turnId: string): number {
    return Number(
      (this.db.prepare('SELECT COUNT(*) AS c FROM turn_events WHERE turn_id = ?').get(turnId) as { c: number }).c,
    )
  }

  /** Cache a legacy file's character length after the first full decode. */
  setRawChars(turnId: string, chars: number): void {
    this.db.prepare('UPDATE turns SET raw_chars = ? WHERE turn_id = ? AND raw_chars IS NULL').run(chars, turnId)
  }

  listJobs(state?: string): Array<Record<string, unknown>> {
    if (state === undefined) {
      return this.db.prepare('SELECT * FROM capture_job ORDER BY id').all() as Array<Record<string, unknown>>
    }
    return this.db.prepare('SELECT * FROM capture_job WHERE state = ? ORDER BY id').all(state) as Array<Record<string, unknown>>
  }

  // ---------------------------------------------------------------------------
  // UI read model. Every list below is bounded; no method returns the full
  // history.
  // ---------------------------------------------------------------------------

  /** One keyset page of day rows, newest first, joined to the workspace name. */
  listDayPage(beforeDate: string | null, beforeWorkspaceId: string | null, limit: number): Array<Record<string, unknown>> {
    const hasCursor = beforeDate !== null && beforeWorkspaceId !== null
    return this.db
      .prepare(
        `SELECT d.local_date, d.workspace_id, d.title, d.turn_count, d.report_rel_path,
                w.display_name
         FROM day_index d
         LEFT JOIN workspace_identity w ON w.workspace_id = d.workspace_id
         WHERE (? = 0 OR d.local_date < ? OR (d.local_date = ? AND d.workspace_id > ?))
         ORDER BY d.local_date DESC, d.workspace_id ASC
         LIMIT ?`,
      )
      .all(hasCursor ? 1 : 0, beforeDate, beforeDate, beforeWorkspaceId, limit) as Array<Record<string, unknown>>
  }

  getRootAbsolute(rootId: string): string | undefined {
    const row = this.db.prepare('SELECT absolute_root FROM root WHERE root_id = ?').get(rootId) as
      | { absolute_root: string }
      | undefined
    return row?.absolute_root
  }

  getCognitionEntry(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM cognition_entry WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
  }

  /**
   * Bounded projection of the current cognition, newest first per layer.
   * `workspaceId`: undefined means every workspace, null means global only.
   */
  listAllCognitionEntries(limit: number, workspaceId?: string | null): Array<Record<string, unknown>> {
    const filter =
      workspaceId === undefined
        ? ''
        : workspaceId === null
          ? 'AND c.workspace_id IS NULL'
          : 'AND c.workspace_id = ?'
    const statement = this.db.prepare(
      `SELECT c.*, w.display_name
       FROM cognition_entry c
       LEFT JOIN workspace_identity w ON w.workspace_id = c.workspace_id
       WHERE c.status = 'current' ${filter}
       ORDER BY c.layer, c.updated_at DESC
       LIMIT ?`,
    )
    return (workspaceId === undefined || workspaceId === null
      ? statement.all(limit)
      : statement.all(workspaceId, limit)) as Array<Record<string, unknown>>
  }

  createCognitionEntry(input: {
    id: string
    workspaceId: string | null
    layer: 'project' | 'whiteboard' | 'user' | 'rule'
    title: string
    conclusion: string
    enabled: boolean
    rootId: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO cognition_entry(id, workspace_id, layer, title, conclusion, status, enabled, version, source_rel_path, root_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 'current', ?, 1, NULL, ?, ?)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.layer,
        input.title,
        input.conclusion,
        input.enabled ? 1 : 0,
        input.rootId,
        nowIso(),
      )
  }

  /** Replace one entry's editable fields and advance its version. */
  updateCognitionEntry(input: {
    id: string
    workspaceId: string | null
    layer: 'project' | 'whiteboard' | 'user' | 'rule'
    title: string
    conclusion: string
    enabled: boolean
  }): boolean {
    const result = this.db
      .prepare(
        `UPDATE cognition_entry
         SET workspace_id = ?, layer = ?, title = ?, conclusion = ?, enabled = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'current'`,
      )
      .run(
        input.workspaceId,
        input.layer,
        input.title,
        input.conclusion,
        input.enabled ? 1 : 0,
        nowIso(),
        input.id,
      )
    return Number(result.changes) > 0
  }

  getProposal(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM memory_proposal WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
  }

  /** Bounded proposal list; `status === null` means every status. */
  listProposalsPage(status: string | null, limit: number): Array<Record<string, unknown>> {
    if (status === null) {
      return this.db
        .prepare(
          `SELECT p.*, w.display_name
           FROM memory_proposal p
           LEFT JOIN workspace_identity w ON w.workspace_id = p.workspace_id
           ORDER BY p.created_at DESC
           LIMIT ?`,
        )
        .all(limit) as Array<Record<string, unknown>>
    }
    return this.db
      .prepare(
        `SELECT p.*, w.display_name
         FROM memory_proposal p
         LEFT JOIN workspace_identity w ON w.workspace_id = p.workspace_id
         WHERE p.status = ?
         ORDER BY p.created_at DESC
         LIMIT ?`,
      )
      .all(status, limit) as Array<Record<string, unknown>>
  }

  countProposals(status: string): number {
    return Number(
      (this.db.prepare('SELECT COUNT(*) AS c FROM memory_proposal WHERE status = ?').get(status) as { c: number }).c,
    )
  }

  /**
   * Approve or reject one pending proposal. Approval inserts the entry and
   * review in one transaction; a second review throws instead of rewriting.
   */
  resolveProposal(input: {
    id: string
    action: 'approve' | 'reject'
    reviewer: string
    reason: string | null
  }): { entryId: string | null } {
    return this.tx(() => {
      const proposal = this.db.prepare('SELECT * FROM memory_proposal WHERE id = ?').get(input.id) as
        | Record<string, unknown>
        | undefined
      if (proposal === undefined) throw new Error(`proposal not found: ${input.id}`)
      if (String(proposal.status ?? '') !== 'pending') throw new Error(`proposal already reviewed: ${input.id}`)

      const now = nowIso()
      this.db
        .prepare('UPDATE memory_proposal SET status = ?, reviewed_at = ?, reviewer = ?, reason = ? WHERE id = ?')
        .run(input.action === 'approve' ? 'approved' : 'rejected', now, input.reviewer, input.reason, input.id)

      if (input.action === 'reject') return { entryId: null }
      const entryId = `cog-${input.id}`
      const layer = String(proposal.layer ?? 'user')
      this.db
        .prepare(
          `INSERT INTO cognition_entry(id, workspace_id, layer, title, conclusion, status, enabled, version, source_rel_path, root_id, updated_at)
           VALUES (?, ?, ?, ?, ?, 'current', 1, 1, NULL, 'default', ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             conclusion = excluded.conclusion,
             updated_at = excluded.updated_at`,
        )
        .run(
          entryId,
          typeof proposal.workspace_id === 'string' ? proposal.workspace_id : null,
          layer === 'rule' ? 'rule' : 'user',
          String(proposal.title ?? ''),
          String(proposal.content ?? ''),
          now,
        )
      return { entryId }
    })
  }

  listWorkspaces(limit = 500): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT w.workspace_id, w.display_name, w.created_at,
                (SELECT COUNT(*) FROM turns t WHERE t.workspace_id = w.workspace_id) AS turn_count,
                (SELECT MAX(t.occurred_at) FROM turns t WHERE t.workspace_id = w.workspace_id) AS last_turn_at
         FROM workspace_identity w
         ORDER BY w.created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>
  }

  listAllLocations(limit = 2_000): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM workspace_location WHERE status = 'active' ORDER BY last_seen DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_setting WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO app_setting(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value)
  }
}
