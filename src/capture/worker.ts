import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ResolvedConfig } from '../config.js'
import type { ClaimedJob, Store, TurnEventRow } from '../db/store.js'
import { renderTurnMarkdown, turnMachineLine } from './render.js'
import type { CapturedTurn } from './types.js'
import type { SummarizeFn } from '../summarize/llm.js'
import type { TurnSummary } from '../summarize/parse.js'
import { rebuildDayIndex, rebuildMonthIndex, rebuildWeekIndex } from '../views/navigation.js'
import { detectModel } from '../summarize/llm.js'
import { previewFromMarkdown, readTurnPreview } from '../turns/preview.js'
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
    const localDate = localDateOf(turn.startedAt)
    const safeId = safeTurnFileName(turn)
    const rawRelPath = path.posix.join('projects', workspaceId, 'turns', localDate, `${safeId}.md`)
    const machineRelPath = path.posix.join('projects', workspaceId, 'index', `${localDate}.jsonl`)

    const markdown = renderTurnMarkdown(turn, this.config.wrapWidth)
    const eventsRelPath = rawRelPath.replace(/\.md$/, '.events.jsonl')
    const turnId = `${turn.sessionId}:${turn.turn}`
    const occurredAt = new Date(turn.startedAt).toISOString()
    const isNew = this.store.getTurn(turnId) === undefined

    // Raw artifacts first: they are the durable source of truth even if the
    // database commit below fails. Startup reconciliation can rebuild the
    // database row from them.
    writeAtomic(path.join(this.config.mindRoot, rawRelPath), markdown)
    writeAtomic(path.join(this.config.mindRoot, eventsRelPath), renderEventsJsonl(turn))
    if (isNew) appendLine(path.join(this.config.mindRoot, machineRelPath), turnMachineLine(turn))

    const events: TurnEventRow[] = turn.events.map(event => ({
      kind: event.type,
      seq: event.seq,
      toolName: toolNameOf(event.data),
      bytes: byteLength(event.data),
    }))

    const selectedModel = detectModel(turn)
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
    let scanned = 0
    let inserted = 0

    const workspaceDirs = fs.readdirSync(base, { withFileTypes: true })
    for (const workspaceEntry of workspaceDirs) {
      if (scanned >= limit) break
      if (!workspaceEntry.isDirectory()) continue
      const workspaceId = workspaceEntry.name
      const turnsDir = path.join(base, workspaceId, 'turns')
      if (!fs.existsSync(turnsDir)) continue
      for (const dateEntry of fs.readdirSync(turnsDir, { withFileTypes: true })) {
        if (scanned >= limit) break
        if (!dateEntry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateEntry.name)) continue
        const localDate = dateEntry.name
        const dateDir = path.join(turnsDir, localDate)
        for (const fileEntry of fs.readdirSync(dateDir, { withFileTypes: true })) {
          if (scanned >= limit) break
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.md') || fileEntry.name.includes('.tmp-')) continue
          scanned += 1
          const full = path.join(dateDir, fileEntry.name)
          const relative = path.relative(this.config.mindRoot, full).split(path.sep).join('/')
          let content: string
          try {
            content = fs.readFileSync(full, 'utf8')
          } catch {
            continue
          }
          const header = /^# Turn (.+?) \/ #(\d+)\s*$/m.exec(content)
          if (header === null) continue
          const sessionId = header[1] ?? ''
          const turnSeq = Number(header[2] ?? 0)
          if (sessionId === '' || !Number.isInteger(turnSeq)) continue
          const turnId = `${sessionId}:${turnSeq}`
          if (this.store.getTurn(turnId) !== undefined) continue
          const startMatch = /^- 开始:\s*(.+)$/m.exec(content)
          const endMatch = /^- 结束原因:\s*(.+)$/m.exec(content)
          const originMatch = /^- 来源:\s*(.+)$/m.exec(content)
          const occurredAt = startMatch?.[1]?.trim() ?? new Date().toISOString()
          const rootId = 'default'
          this.store.ingestTurn(
            {
              turnId,
              workspaceId,
              sessionId,
              turnSeq,
              origin: originMatch?.[1]?.trim() === 'subagent' ? 'subagent' : 'main',
              endReason: endMatch?.[1]?.trim() ?? null,
              occurredAt,
              localDate,
              rootId,
              rawRelPath: relative,
              rawEventsRelPath: relative.replace(/\.md$/, '.events.jsonl'),
              rawChars: content.length,
              provider: null,
              model: null,
            },
            [],
            {
              title: previewFromMarkdown(content) ?? '(未摘要)',
              conclusion: '',
              topics: [],
              status: 'unsummarized',
              sourceRelPath: relative,
              rootId,
              occurredAt,
            },
          )
          inserted += 1
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
    for (;;) {
      const job = this.store.claimJob(this.owner, this.config.leaseMs)
      if (job === null) return
      const ok = await this.processJob(job)
      if (!ok) return
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

    if (summary.worthRemembering) {
      for (const entry of summary.durable) {
        const title = redactSecrets(entry.title)
        const conclusion = redactSecrets(entry.conclusion)
        if (entry.layer === 'project') {
          this.store.upsertCognitionEntry({
            id: `cog-${hash(`${turnId}:${entry.title}`)}`,
            workspaceId: meta.workspaceId,
            layer: 'project',
            title,
            conclusion,
            sourceRelPath: meta.rawRelPath,
            rootId: meta.rootId,
          })
        } else {
          this.store.insertProposal({
            id: `prop-${hash(`${turnId}:${entry.title}`)}`,
            workspaceId: meta.workspaceId,
            layer: 'user',
            title,
            content: conclusion,
            sourceTurn: turnId,
          })
        }
      }
    }
  }

  private rebuildViews(workspaceId: string, localDate: string, turnId: string, rootId: string): void {
    if (localDate === '') return
    rebuildDayIndex(this.store, this.config.mindRoot, workspaceId, localDate, rootId)
    rebuildWeekIndex(this.store, this.config.mindRoot, workspaceId, localDate, rootId)
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
    return {
      sessionId: String(row.session_id ?? job.sessionId),
      turn: Number(row.turn_seq ?? job.turnSeq),
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      endedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      endReason: row.end_reason === null || row.end_reason === undefined ? null : String(row.end_reason),
      origin: origin === 'subagent' ? 'subagent' : 'main',
      workspacePath: null,
      provider: typeof row.provider === 'string' ? row.provider : null,
      model: typeof row.model === 'string' ? row.model : null,
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

function hash(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function readSafe(target: string): string {
  try {
    return fs.readFileSync(target, 'utf8')
  } catch {
    return ''
  }
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
    fs.writeFileSync(fd, `${line}\n`, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}
