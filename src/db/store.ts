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
    if (current < SCHEMA_VERSION) {
      this.db.exec(SCHEMA_SQL)
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    }
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
    const now = nowIso()
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO turns(turn_id, workspace_id, session_id, turn_seq, origin, source_status, end_reason,
                             occurred_at, local_date, root_id, raw_rel_path, created_at)
           VALUES (?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?)
           ON CONFLICT(turn_id) DO UPDATE SET
             end_reason = COALESCE(excluded.end_reason, turns.end_reason),
             raw_rel_path = COALESCE(excluded.raw_rel_path, turns.raw_rel_path)`,
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
          now,
        )

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
    })
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

  failJob(id: number, error: string, nextAt: string, dead: boolean): void {
    this.db
      .prepare("UPDATE capture_job SET state = ?, next_at = ?, last_error = ?, owner = NULL, lease_until = NULL WHERE id = ?")
      .run(dead ? 'dead' : 'pending', nextAt, error.slice(0, 500), id)
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

  countTurns(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS c FROM turns').get() as { c: number }).c)
  }

  getTurn(turnId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM turns WHERE turn_id = ?').get(turnId) as Record<string, unknown> | undefined
  }

  listJobs(state?: string): Array<Record<string, unknown>> {
    if (state === undefined) {
      return this.db.prepare('SELECT * FROM capture_job ORDER BY id').all() as Array<Record<string, unknown>>
    }
    return this.db.prepare('SELECT * FROM capture_job WHERE state = ? ORDER BY id').all(state) as Array<Record<string, unknown>>
  }
}
