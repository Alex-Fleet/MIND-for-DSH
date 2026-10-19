import fs from 'node:fs'
import path from 'node:path'
import type { ResolvedConfig } from '../config.js'
import type { Store, TurnEventRow } from '../db/store.js'
import { nowIso } from '../db/store.js'
import { renderTurnMarkdown, turnMachineLine } from './render.js'
import type { CapturedTurn } from './types.js'

export interface IngestContext {
  workspaceId: string | null
  rootId: string
}

interface PendingIngest {
  turn: CapturedTurn
  context: IngestContext
}

export class CaptureWorker {
  private readonly pending: PendingIngest[] = []
  private scheduled = false
  private draining = false
  private disposed = false
  private readonly owner = `mind-${process.pid}`

  constructor(
    private readonly store: Store,
    private readonly config: ResolvedConfig,
  ) {}

  /** Queue a completed turn. The caller never blocks on disk or SQLite. */
  enqueue(turn: CapturedTurn, context: IngestContext): void {
    if (this.disposed) return
    this.pending.push({ turn, context })
    this.schedule()
  }

  /** Process everything queued right now (tests and shutdown). */
  flush(): void {
    this.drain()
  }

  /** Stop accepting work; safe to call before closing the store. */
  dispose(): void {
    this.disposed = true
    this.pending.length = 0
  }

  /** Recover jobs left running by a crashed process. */
  reconcile(): number {
    return this.store.recoverStaleJobs()
  }

  private schedule(): void {
    if (this.scheduled || this.disposed) return
    this.scheduled = true
    setImmediate(() => {
      this.scheduled = false
      this.drain()
    })
  }

  private drain(): void {
    if (this.draining || this.disposed) return
    this.draining = true
    try {
      while (this.pending.length > 0) {
        const item = this.pending.shift()
        if (item === undefined) break
        this.ingest(item)
      }
      this.consumeJobs()
    } finally {
      this.draining = false
    }
  }

  private ingest(item: PendingIngest): void {
    const { turn, context } = item
    const localDate = localDateOf(turn.startedAt)
    const safeId = safeTurnFileName(turn)
    const rawRelPath = path.posix.join(
      'projects',
      context.workspaceId ?? 'orphan',
      'turns',
      localDate,
      `${safeId}.md`,
    )
    const machineRelPath = path.posix.join(
      'projects',
      context.workspaceId ?? 'orphan',
      'index',
      `${localDate}.jsonl`,
    )

    const markdown = renderTurnMarkdown(turn, this.config.wrapWidth)
    writeAtomic(path.join(this.config.mindRoot, rawRelPath), markdown)
    appendLine(path.join(this.config.mindRoot, machineRelPath), turnMachineLine(turn))

    const events: TurnEventRow[] = turn.events.map(event => ({
      kind: event.type,
      seq: event.seq,
      toolName: toolNameOf(event.data),
      bytes: byteLength(event.data),
    }))

    this.store.insertTurnAndJob(
      {
        turnId: `${turn.sessionId}:${turn.turn}`,
        workspaceId: context.workspaceId,
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

  private consumeJobs(): void {
    for (;;) {
      const job = this.store.claimJob(this.owner, this.config.leaseMs)
      if (job === null) return
      try {
        // Step 2: the raw turn is already durable. Summarization lands in Step 3.
        this.store.completeJob(job.id)
        this.store.updateCaptureStatus(job.sessionId, { lastSeq: job.turnSeq, pending: 0, failed: 0 })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const dead = job.attempts >= this.config.maxAttempts
        const nextAt = new Date(Date.now() + retryDelayMs(job.attempts)).toISOString()
        this.store.failJob(job.id, message, nextAt, dead)
        this.store.updateCaptureStatus(job.sessionId, { failed: 1, lastError: message })
      }
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
