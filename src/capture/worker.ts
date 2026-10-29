import fs from 'node:fs'
import path from 'node:path'
import type { ResolvedConfig } from '../config.js'
import type { ClaimedJob, Store, TurnEventRow } from '../db/store.js'
import { renderTurnMarkdown, turnMachineLine } from './render.js'
import type { CapturedTurn } from './types.js'
import type { SummarizeFn } from '../summarize/llm.js'
import type { TurnSummary } from '../summarize/parse.js'
import { rebuildDayIndex, rebuildMonthIndex } from '../views/navigation.js'
import { detectModel } from '../summarize/llm.js'
import { previewFromMarkdown, readTurnPreview } from '../turns/preview.js'
import { countChars } from '../turns/read.js'
import { localDateOf } from '../time.js'
import { redactSecrets } from '../security/redact.js'

export interface IngestContext {
  workspaceId: string | null
  rootId: string
}

interface PendingIngest {
  turn: CapturedTurn
  context: IngestContext
}

export class CaptureWorker {
  private readonly recent = new Map<string, CapturedTurn>()
  private readonly pending = new Map<string, PendingIngest>()
  /**
   * The last request model seen per session. DSH only records
   * `request/header` on initial/resume/route changes, so later turns in the
   * same loop carry no model event of their own.
   */
  private readonly sessionModels = new Map<string, { provider: string; model: string }>()
  private activeDrain: Promise<void> | null = null
  private disposed = false
  private readonly owner = `mind-${process.pid}`

  constructor(
    private readonly store: Store,
    private readonly config: ResolvedConfig,
    private readonly summarize?: SummarizeFn,
  ) {}

  /**
   * Persist a completed turn.
   *
   * The raw file and index row are written synchronously (milliseconds) so a
   * one-shot headless process cannot exit before the original is durable.
   * Summarization stays asynchronous.
   */
  enqueue(turn: CapturedTurn, context: IngestContext): void {
    if (this.disposed) return
    const key = `${turn.sessionId}:${turn.turn}`
    const item = { turn, context }
    try {
      this.ingest(item)
      this.pending.delete(key)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[mind-dsh] capture failed, retained for retry: ${message}`)
      this.pending.set(key, item)
      while (this.pending.size > 200) {
        const oldest = this.pending.keys().next().value
        if (oldest === undefined) break
        this.pending.delete(oldest)
      }
    }
    // Start immediately: the summary request is an active handle, so a
    // one-shot headless process stays alive until it settles.
    void this.drain()
  }

  /** Process everything queued right now (tests and shutdown). */
  async flush(): Promise<void> {
    await this.drain()
  }

  /** Stop accepting work; safe to call before closing the store. */
  dispose(): void {
    // Last chance for an ingest that was blocked earlier; still no guarantee
    // under a persistent disk failure, but do not drop it silently.
    for (const item of this.pending.values()) {
      try {
        this.ingest(item)
      } catch {
        // Leave the raw/index compensation to the next startup.
      }
    }
    this.pending.clear()
    this.disposed = true
    this.recent.clear()
    this.sessionModels.clear()
  }

  /** Recover jobs left running by a crashed process. */
  reconcile(): number {
    return this.store.recoverStaleJobs()
  }

  private async drain(): Promise<void> {
    if (this.disposed) return
    if (this.activeDrain !== null) return this.activeDrain
    const run = this.retryPending()
      .then(() => this.consumeJobs())
      .catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[mind-dsh] drain failed: ${message}`)
    })
    this.activeDrain = run
    try {
      await run
    } finally {
      if (this.activeDrain === run) this.activeDrain = null
    }
  }

  private ingest(item: PendingIngest): void {
    const { turn, context } = item
    const workspaceId = context.workspaceId ?? 'orphan'
    const localDate = localDateOf(turn.startedAt, this.config.dayBoundaryMinutes)
    const safeId = safeTurnFileName(turn)
    const rawRelPath = path.posix.join('projects', workspaceId, 'turns', localDate, `${safeId}.md`)
    const machineRelPath = path.posix.join('projects', workspaceId, 'index', `${localDate}.jsonl`)

    const markdown = renderTurnMarkdown(turn, this.config.wrapWidth)
    const eventsRelPath = rawRelPath.replace(/\.md$/, '.events.jsonl')
    const turnId = `${turn.sessionId}:${turn.turn}`
    const occurredAt = new Date(turn.startedAt).toISOString()

    // Raw artifacts first: they are the durable source of truth even if the
    // database commit below fails. Startup reconciliation can rebuild the
    // database row from them. The machine line is keyed by session/turn and
    // appended idempotently, so a retry after a failed DB commit cannot
    // duplicate it.
    writeAtomic(path.join(this.config.mindRoot, rawRelPath), markdown)
    writeAtomic(path.join(this.config.mindRoot, eventsRelPath), renderEventsJsonl(turn))
    appendLineIfAbsent(
      path.join(this.config.mindRoot, machineRelPath),
      turn.sessionId,
      turn.turn,
      turnMachineLine(turn),
    )

    const events: TurnEventRow[] = turn.events.map(event => ({
      kind: event.type,
      seq: event.seq,
      toolName: toolNameOf(event.data),
      bytes: byteLength(event.data),
    }))

    const detected = detectModel(turn)
    if (detected !== null) this.sessionModels.set(turn.sessionId, detected)
    while (this.sessionModels.size > 500) {
      const oldest = this.sessionModels.keys().next().value
      if (oldest === undefined) break
      this.sessionModels.delete(oldest)
    }
    const selectedModel =
      detected ??
      this.sessionModels.get(turn.sessionId) ??
      this.store.findLastTurnModel(turn.sessionId)
    this.recent.set(turnId, turn)
    // Bounded cache: the summary normally runs immediately, but a job that
    // waits must not retain every event payload forever.
    while (this.recent.size > 100) {
      const oldest = this.recent.keys().next().value
      if (oldest === undefined) break
      this.recent.delete(oldest)
    }

    const preview = previewFromMarkdown(markdown)
    const turnRow = {
      turnId,
      workspaceId,
      sessionId: turn.sessionId,
      turnSeq: turn.turn,
      origin: turn.origin,
      endReason: turn.endReason,
      occurredAt,
      localDate,
      rootId: context.rootId,
      rawRelPath,
      rawEventsRelPath: eventsRelPath,
      rawChars: markdown.length,
      provider: selectedModel?.provider ?? null,
      model: selectedModel?.model ?? null,
    }
    const index = {
      title: preview ?? '(未摘要)',
      conclusion: '',
      topics: [],
      status: 'unsummarized' as const,
      sourceRelPath: rawRelPath,
      rootId: context.rootId,
      occurredAt,
    }

    // Turn + events + job + fallback index commit together. SQLITE_BUSY is
    // retried; if it still fails, the raw files above are reconciled at the
    // next startup.
    for (let attempt = 0; ; attempt++) {
      try {
        this.store.ingestTurn(turnRow, events, index)
        break
      } catch (error) {
        if (attempt >= 2) throw error
      }
    }

    try {
      this.store.refreshDayIndex(workspaceId, localDate, context.rootId)
      const day = this.store.getDayIndex(workspaceId, localDate)
      if (day === undefined || String(day.report_rel_path ?? '') === '') {
        // The hot-path refresh only updates title/count. Materialize the
        // report immediately so today's turns are readable before summaries
        // finish, without touching an existing migrated report.
        rebuildDayIndex(this.store, this.config.mindRoot, workspaceId, localDate, context.rootId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] day index refresh failed: ${message}`)
    }
  }

  /**
   * Give legacy turns without any index a preview-based fallback, so an old
   * summary failure cannot leave them invisible in the timeline or FTS.
   */
  backfillIndexes(limit = 500): number {
    const rows = this.store.listMissingTurnIndexes(limit)
    const days = new Map<string, { workspaceId: string; localDate: string; rootId: string }>()
    for (const row of rows) {
      const turnId = String(row.turn_id ?? '')
      const rawRelPath = String(row.raw_rel_path ?? '')
      const workspaceId = String(row.workspace_id ?? 'orphan')
      const localDate = String(row.local_date ?? '')
      const rootId = String(row.root_id ?? 'default')
      this.store.upsertTurnIndex({
        turnId,
        title: readTurnPreview(this.config.mindRoot, rawRelPath) ?? '(未摘要)',
        conclusion: '',
        topics: [],
        status: 'unsummarized',
        sourceRelPath: rawRelPath === '' ? null : rawRelPath,
        rootId,
        occurredAt: String(row.occurred_at ?? new Date().toISOString()),
      })
      if (localDate !== '') days.set(`${workspaceId}|${localDate}`, { workspaceId, localDate, rootId })
    }
    for (const day of days.values()) {
      this.rebuildViews(day.workspaceId, day.localDate, '', day.rootId)
    }
    return rows.length
  }

  /** Rebuild day/week/month views whose row counts drifted or are absent. */
  rebuildMissingViews(limit = 200): number {
    const days = this.store.listMissingDayViews(limit)
    for (const day of days) {
      this.rebuildViews(
        String(day.workspace_id ?? 'orphan'),
        String(day.local_date ?? ''),
        '',
        String(day.root_id ?? 'default'),
      )
    }
    return days.length
  }

  /**
   * Reconcile raw Markdown files that never reached the database (a crash or
   * a failed insert between the raw write and the transaction). Only the
   * readable raw is required; event metadata can be absent.
   */
  reconcileRawTurns(limit = 200): number {
    const base = path.join(this.config.mindRoot, 'projects')
    if (!fs.existsSync(base)) return 0
    const days = new Map<string, { workspaceId: string; localDate: string; rootId: string }>()

    // Stream directories in deterministic order. Only successful recoveries
    // count toward the limit, so existing files cannot starve a later orphan;
    // one corrupt file must not abort the rest of the scan.
    let inserted = 0
    // A raw file already represented by *any* turn row is not an orphan.
    // Legacy migration used `legacy-<session>-<seq>` ids, so checking only
    // `<session>:<seq>` would re-ingest the same file as a duplicate turn.
    const knownRawPaths = this.store.listRawPaths()
    outer:
    for (const workspaceEntry of sortedEntries(base)) {
      if (!workspaceEntry.isDirectory()) continue
      const workspaceId = workspaceEntry.name
      const turnsDir = path.join(base, workspaceId, 'turns')
      if (!fs.existsSync(turnsDir)) continue
      for (const dateEntry of sortedEntries(turnsDir)) {
        if (!dateEntry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateEntry.name)) continue
        const localDate = dateEntry.name
        const dateDir = path.join(turnsDir, localDate)
        for (const fileEntry of sortedEntries(dateDir)) {
          if (inserted >= limit) break outer
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.md') || fileEntry.name.includes('.tmp-')) continue
          const relative = path.posix.join('projects', workspaceId, 'turns', localDate, fileEntry.name)
          // Skip before opening the file: a normal startup scans tens of
          // thousands of already-known paths, and none of them need a read.
          if (knownRawPaths.has(relative)) continue
          const full = path.join(dateDir, fileEntry.name)
          const header = readRawHeader(full)
          if (header === null) continue
          const turnId = `${header.sessionId}:${header.turnSeq}`
          if (this.store.getTurn(turnId) !== undefined) continue

          // Recover from the head plus a streaming character count; a
          // multi-hundred-MB orphan must not be loaded as one string.
          const head = readHead(full, 64 * 1024)
          if (head === '') continue
          let rawChars: number
          try {
            rawChars = countChars(full)
          } catch {
            continue
          }
          const eventsPath = full.replace(/\.md$/, '.events.jsonl')
          const events = readEventsFile(eventsPath, parseTimestamp(header.occurredAt))
          const startedAt = parseTimestamp(header.occurredAt)
          const turn: CapturedTurn = {
            sessionId: header.sessionId,
            turn: header.turnSeq,
            startedAt,
            endedAt: events.at(-1)?.occurredAt ?? startedAt,
            endReason: header.endReason,
            origin: header.origin,
            workspacePath: header.workspacePath,
            events,
          }
          const detected = detectModel(turn)
          if (detected !== null) this.sessionModels.set(turn.sessionId, detected)
          const selectedModel =
            detected ??
            this.sessionModels.get(turn.sessionId) ??
            this.store.findLastTurnModel(header.sessionId)
          const rootId = 'default'
          const eventRows: TurnEventRow[] = events.map(event => ({
            kind: event.type,
            seq: event.seq,
            toolName: toolNameOf(event.data),
            bytes: byteLength(event.data),
          }))
          // Write the secondary index before the DB commit, like live ingest:
          // if it fails, the next startup retries instead of skipping an
          // already-committed turn with a permanently missing machine line.
          try {
            appendLineIfAbsent(
              path.join(this.config.mindRoot, 'projects', workspaceId, 'index', `${localDate}.jsonl`),
              header.sessionId,
              header.turnSeq,
              turnMachineLine(turn),
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[mind-dsh] machine index append failed for ${relative}: ${message}`)
            continue
          }
          try {
            this.store.ingestTurn(
              {
                turnId,
                workspaceId,
                sessionId: header.sessionId,
                turnSeq: header.turnSeq,
                origin: header.origin,
                endReason: header.endReason,
                occurredAt: new Date(startedAt).toISOString(),
                localDate,
                rootId,
                rawRelPath: relative,
                rawEventsRelPath: fs.existsSync(eventsPath) ? relative.replace(/\.md$/, '.events.jsonl') : null,
                rawChars,
                provider: selectedModel?.provider ?? null,
                model: selectedModel?.model ?? null,
              },
              eventRows,
              {
                title: previewFromMarkdown(head) ?? '(未摘要)',
                conclusion: '',
                topics: [],
                status: 'unsummarized',
                sourceRelPath: relative,
                rootId,
                occurredAt: new Date(startedAt).toISOString(),
              },
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[mind-dsh] raw recovery failed for ${relative}: ${message}`)
            continue
          }
          inserted += 1
          knownRawPaths.add(relative)
          days.set(`${workspaceId}|${localDate}`, { workspaceId, localDate, rootId })
        }
      }
    }
    for (const day of days.values()) {
      this.rebuildViews(day.workspaceId, day.localDate, '', day.rootId)
    }
    return inserted
  }

  private async retryPending(): Promise<void> {
    for (const [key, item] of [...this.pending]) {
      try {
        this.ingest(item)
        this.pending.delete(key)
      } catch {
        // Keep it for the next interval; the raw files may still be blocked.
      }
    }
  }

  private async consumeJobs(): Promise<void> {
    let failures = 0
    for (;;) {
      const job = this.store.claimJob(this.owner, this.config.leaseMs)
      if (job === null) return
      const ok = await this.processJob(job)
      if (!ok) {
        // A failed job is rescheduled with backoff. Keep draining other due
        // jobs instead of letting one bad turn block every newer turn.
        failures += 1
        if (failures >= 5) return
      }
    }
  }

  private async processJob(job: ClaimedJob): Promise<boolean> {
    try {
      const row = this.store.getTurn(job.turnId)
      if (row === undefined) {
        this.store.completeJob(job.id)
        return true
      }

      const workspaceId = String(row.workspace_id ?? 'orphan')
      const localDate = String(row.local_date ?? '')
      const rawRelPath = String(row.raw_rel_path ?? '')
      const origin = String(row.origin ?? 'main')

      // Summarization disabled: keep the fallback index as "waiting", never
      // call the model. Re-enabling summarization will re-queue it; migrated
      // legacy turns keep their separate `invalid` status and are never queued.
      if (this.config.summarizeEnabled === false) {
        this.store.markTurnIndexUnsummarized(job.turnId)
        this.rebuildViews(workspaceId, localDate, job.turnId, String(row.root_id ?? 'default'))
        this.store.completeJob(job.id)
        this.store.updateCaptureStatus(job.sessionId, { lastSeq: job.turnSeq, pending: 0, failed: 0 })
        this.recent.delete(job.turnId)
        return true
      }

      // Subagent sessions are raw-only: never spawn a capture child from them.
      if (origin === 'subagent' || this.summarize === undefined) {
        this.rebuildViews(workspaceId, localDate, job.turnId, String(row.root_id ?? 'default'))
        this.store.completeJob(job.id)
        this.store.updateCaptureStatus(job.sessionId, { lastSeq: job.turnSeq, pending: 0, failed: 0 })
        this.recent.delete(job.turnId)
        return true
      }

      const markdown = rawRelPath === '' ? '' : readSafe(path.join(this.config.mindRoot, rawRelPath))
      const turn = this.turnForJob(job, row, origin)
      const summary = await this.summarize(turn, markdown)
      if (summary === null) {
        // The raw turn and its fallback index are already durable. Keep
        // retrying with a capped backoff forever; a model/provider fix or a
        // transient outage must never permanently strand a turn.
        this.rebuildViews(workspaceId, localDate, job.turnId, String(row.root_id ?? 'default'))
        const nextAt = new Date(Date.now() + this.retryDelay(job.attempts)).toISOString()
        this.store.failJob(job.id, 'summary returned no valid JSON', nextAt)
        this.store.updateCaptureStatus(job.sessionId, { failed: 1, lastError: 'summary returned no valid JSON' })
        this.recent.delete(job.turnId)
        return false
      }

      this.recordSummary(job.turnId, summary, {
        workspaceId,
        localDate,
        rawRelPath,
        rootId: String(row.root_id ?? 'default'),
        occurredAt: String(row.occurred_at ?? new Date().toISOString()),
      })
      this.rebuildViews(workspaceId, localDate, job.turnId, String(row.root_id ?? 'default'))
      this.store.completeJob(job.id)
      this.store.updateCaptureStatus(job.sessionId, { lastSeq: job.turnSeq, pending: 0, failed: 0 })
      this.recent.delete(job.turnId)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const nextAt = new Date(Date.now() + this.retryDelay(job.attempts)).toISOString()
      this.store.failJob(job.id, message, nextAt)
      this.store.updateCaptureStatus(job.sessionId, { failed: 1, lastError: message })
      this.recent.delete(job.turnId)
      return false
    }
  }

  private recordSummary(
    turnId: string,
    summary: TurnSummary,
    meta: { workspaceId: string; localDate: string; rawRelPath: string; rootId: string; occurredAt: string },
  ): void {
    this.store.upsertTurnIndex({
      turnId,
      title: redactSecrets(summary.title),
      conclusion: redactSecrets(summary.conclusion),
      topics: summary.topics.map(topic => redactSecrets(topic)),
      sourceRelPath: meta.rawRelPath,
      rootId: meta.rootId,
      occurredAt: meta.occurredAt,
    })
  }

  private rebuildViews(workspaceId: string, localDate: string, turnId: string, rootId: string): void {
    if (localDate === '') return
    rebuildDayIndex(this.store, this.config.mindRoot, workspaceId, localDate, rootId)
    // Weekly reports were a mechanical list of the same daily titles the month
    // already aggregates, so they added no information and are no longer built.
    // Existing `weeks/*.md` and `period_index(kind='week')` rows are kept as-is.
    rebuildMonthIndex(this.store, this.config.mindRoot, workspaceId, localDate.slice(0, 7), rootId)
    void turnId
  }

  private retryDelay(attempts: number): number {
    // Fast recovery first, then a steady 30-minute cadence. Never a dead end.
    if (attempts > this.config.maxAttempts) return 30 * 60_000
    return retryDelayMs(attempts)
  }

  private turnForJob(job: ClaimedJob, row: Record<string, unknown>, origin: string): CapturedTurn {
    const cached = this.recent.get(job.turnId)
    if (cached !== undefined) return cached
    const startedAt = Date.parse(String(row.occurred_at ?? new Date().toISOString()))
    const sessionId = String(row.session_id ?? job.sessionId)
    const fallback = this.store.findLastTurnModel(sessionId)
    return {
      sessionId,
      turn: Number(row.turn_seq ?? job.turnSeq),
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      endedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      endReason: row.end_reason === null || row.end_reason === undefined ? null : String(row.end_reason),
      origin: origin === 'subagent' ? 'subagent' : 'main',
      workspacePath: null,
      provider: typeof row.provider === 'string' ? row.provider : fallback?.provider ?? null,
      model: typeof row.model === 'string' ? row.model : fallback?.model ?? null,
      events: [],
    }
  }
}

export { localDateOf } from '../time.js'

export function safeTurnFileName(turn: CapturedTurn): string {
  const safeSession = turn.sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${safeSession}--turn-${turn.turn}`
}

function toolNameOf(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  return typeof record.name === 'string' ? record.name : null
}

function byteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '')
  } catch {
    return 0
  }
}

function retryDelayMs(attempts: number): number {
  const steps = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000]
  const index = Math.min(Math.max(attempts - 1, 0), steps.length - 1)
  return steps[index] ?? 30 * 60_000
}


function readSafe(target: string): string {
  try {
    return fs.readFileSync(target, 'utf8')
  } catch {
    return ''
  }
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function readHead(target: string, maxBytes: number): string {
  let fd: number | undefined
  try {
    fd = fs.openSync(target, 'r')
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytes = fs.readSync(fd, buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytes).toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

function sortedEntries(dir: string): fs.Dirent[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    return []
  }
}

function readRawHeader(
  target: string,
): {
  sessionId: string
  turnSeq: number
  occurredAt: string
  endReason: string | null
  origin: 'main' | 'subagent'
  workspacePath: string | null
} | null {
  const head = readHead(target, 8192)
  const header = /^# Turn (.+?) \/ #(\d+)\s*$/m.exec(head)
  if (header === null) return null
  const sessionId = header[1] ?? ''
  const turnSeq = Number(header[2] ?? 0)
  if (sessionId === '' || !Number.isInteger(turnSeq)) return null
  const start = /^- 开始:\s*(.+)$/m.exec(head)?.[1]?.trim()
  const end = /^- 结束原因:\s*(.+)$/m.exec(head)?.[1]?.trim()
  const origin = /^- 来源:\s*(.+)$/m.exec(head)?.[1]?.trim()
  const workspace = /^- 工作区:\s*(.+)$/m.exec(head)?.[1]?.trim()
  return {
    sessionId,
    turnSeq,
    occurredAt: start ?? new Date().toISOString(),
    endReason: end ?? null,
    origin: origin === 'subagent' ? 'subagent' : 'main',
    workspacePath: workspace === undefined || workspace === '(unknown)' ? null : workspace,
  }
}

function readEventsFile(target: string, fallbackTime = 0): CapturedTurn['events'] {
  let raw: string
  try {
    const stat = fs.statSync(target)
    raw = stat.size > 16 * 1024 * 1024
      ? readHead(target, 16 * 1024 * 1024)
      : fs.readFileSync(target, 'utf8')
  } catch {
    return []
  }
  const events: CapturedTurn['events'] = []
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    try {
      const record = JSON.parse(line) as Record<string, unknown>
      if (typeof record.type !== 'string') continue
      events.push({
        type: record.type,
        seq: typeof record.seq === 'number' ? record.seq : null,
        occurredAt: typeof record.occurredAt === 'number' ? record.occurredAt : fallbackTime,
        data: record.data,
      })
    } catch {
      // A truncated/corrupt event line must not block recovering the turn.
    }
  }
  return events
}

interface MachineCacheEntry {
  keys: Set<string>
  stamp: string
}

const machineLineCache = new Map<string, MachineCacheEntry>()

function fileStamp(target: string): string {
  try {
    const stat = fs.statSync(target)
    // ctime catches same-size rewrites even if mtime is restored.
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
  } catch {
    return 'missing'
  }
}

function trimMachineLineCache(): void {
  while (machineLineCache.size > 100) {
    const oldest = machineLineCache.keys().next().value
    if (oldest === undefined) break
    machineLineCache.delete(oldest)
  }
}

function appendLineIfAbsent(target: string, sessionId: string, turn: number, line: string): void {
  const key = `${sessionId}:${turn}`
  const stamp = fileStamp(target)
  let entry = machineLineCache.get(target)
  if (entry === undefined || entry.stamp !== stamp) {
    const keys = new Set<string>()
    if (stamp !== 'missing') {
      try {
        for (const existing of fs.readFileSync(target, 'utf8').split('\n')) {
          if (existing.trim() === '') continue
          try {
            const record = JSON.parse(existing) as Record<string, unknown>
            if (typeof record.sessionId === 'string' && typeof record.turn === 'number') {
              keys.add(`${record.sessionId}:${record.turn}`)
            }
          } catch {
            // Keep scanning; one corrupt line must not create a duplicate.
          }
        }
      } catch {
        // Fall through to the append; a read failure is not a reason to drop it.
      }
    }
    entry = { keys, stamp }
    machineLineCache.set(target, entry)
  }
  if (entry.keys.has(key)) {
    trimMachineLineCache()
    return
  }

  appendLine(target, line)
  entry.keys.add(key)
  entry.stamp = fileStamp(target)
  trimMachineLineCache()
}

function renderEventsJsonl(turn: CapturedTurn): string {
  const lines: string[] = []
  for (const event of turn.events) {
    try {
      lines.push(
        JSON.stringify({
          type: event.type,
          seq: event.seq,
          occurredAt: event.occurredAt,
          data: event.data,
        }),
      )
    } catch {
      lines.push(
        JSON.stringify({
          type: event.type,
          seq: event.seq,
          occurredAt: event.occurredAt,
          data: null,
          serializationError: true,
        }),
      )
    }
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

function writeAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  const fd = fs.openSync(temp, 'w', 0o600)
  try {
    fs.writeFileSync(fd, content, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(temp, target)
}

function appendLine(target: string, line: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const fd = fs.openSync(target, 'a', 0o600)
  try {
    // open mode only applies to a newly created file; tighten upgraded files.
    try {
      fs.fchmodSync(fd, 0o600)
    } catch {
      // Filesystems without POSIX modes.
    }
    fs.writeFileSync(fd, `${line}\n`, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}
