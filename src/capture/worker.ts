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
    try {
      this.ingest({ turn, context })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[mind-dsh] capture failed: ${message}`)
      return
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
    const run = this.consumeJobs().catch(error => {
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
    writeAtomic(path.join(this.config.mindRoot, rawRelPath), markdown)
    appendLine(path.join(this.config.mindRoot, machineRelPath), turnMachineLine(turn))

    const events: TurnEventRow[] = turn.events.map(event => ({
      kind: event.type,
      seq: event.seq,
      toolName: toolNameOf(event.data),
      bytes: byteLength(event.data),
    }))

    const turnId = `${turn.sessionId}:${turn.turn}`
    this.recent.set(turnId, turn)
    this.store.insertTurnAndJob(
      {
        turnId,
        workspaceId,
        sessionId: turn.sessionId,
        turnSeq: turn.turn,
        origin: turn.origin,
        endReason: turn.endReason,
        occurredAt: new Date(turn.startedAt).toISOString(),
        localDate,
        rootId: context.rootId,
        rawRelPath,
      },
      events,
    )
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
        return true
      }

      const markdown = rawRelPath === '' ? '' : readSafe(path.join(this.config.mindRoot, rawRelPath))
      const turn = this.turnForJob(job, row, origin)
      const summary = await this.summarize(turn, markdown)
      if (summary === null) {
        const dead = job.attempts >= this.config.maxAttempts
        const nextAt = new Date(Date.now() + retryDelayMs(job.attempts)).toISOString()
        this.store.failJob(job.id, 'summary returned no valid JSON', nextAt, dead)
        this.store.updateCaptureStatus(job.sessionId, { failed: 1, lastError: 'summary returned no valid JSON' })
        return !dead
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
      const dead = job.attempts >= this.config.maxAttempts
      const nextAt = new Date(Date.now() + retryDelayMs(job.attempts)).toISOString()
      this.store.failJob(job.id, message, nextAt, dead)
      this.store.updateCaptureStatus(job.sessionId, { failed: 1, lastError: message })
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
      title: summary.title,
      conclusion: summary.conclusion,
      topics: summary.topics,
      sourceRelPath: meta.rawRelPath,
      rootId: meta.rootId,
      occurredAt: meta.occurredAt,
    })

    for (const entry of summary.durable) {
      if (entry.layer === 'project') {
        this.store.upsertCognitionEntry({
          id: `cog-${hash(`${turnId}:${entry.title}`)}`,
          workspaceId: meta.workspaceId,
          layer: 'project',
          title: entry.title,
          conclusion: entry.conclusion,
          sourceRelPath: meta.rawRelPath,
          rootId: meta.rootId,
        })
      } else {
        this.store.insertProposal({
          id: `prop-${hash(`${turnId}:${entry.title}`)}`,
          workspaceId: meta.workspaceId,
          layer: 'user',
          title: entry.title,
          content: entry.conclusion,
          sourceTurn: turnId,
        })
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
      events: [],
    }
  }
}

/** Asia/Shanghai local date with a 04:00 day boundary (no DST in this zone). */
export function localDateOf(timestamp: number, dayBoundaryMinutes = 240): string {
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000 - dayBoundaryMinutes * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

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
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts, 8))
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

function writeAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, content, 'utf8')
  fs.renameSync(temp, target)
}

function appendLine(target: string, line: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, `${line}\n`, 'utf8')
}
