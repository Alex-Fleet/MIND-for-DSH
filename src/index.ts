import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { TurnBuffer, type EventLike, type SessionLike } from './capture/buffer.js'
import { CaptureWorker } from './capture/worker.js'
import { resolveConfig, type MindConfig } from './config.js'
import { Store } from './db/store.js'
import { createLlmSummarizer } from './summarize/llm.js'
import type { MindContext } from './types.js'

export const name = 'mind-dsh'

/** Services required before apply() runs. */
export const inject = ['systemPrompt'] as const

const ROOT_ID = 'default'

/**
 * MIND for DSH entry point.
 *
 * Step 2: durable capture. Every completed turn is buffered, rendered to a
 * model-readable multi-line file, indexed in SQLite, and queued for the
 * summarizer (Step 3).
 */
export function apply(ctx: Context, rawConfig: MindConfig = {}): void {
  const config = resolveConfig(rawConfig)
  fs.mkdirSync(config.mindRoot, { recursive: true })

  const store = new Store(path.join(config.mindRoot, 'mind.db'))
  store.ensureRoot(ROOT_ID, config.mindRoot)

  const buffer = new TurnBuffer()
  const summarize = createLlmSummarizer({ ctx })
  const worker = new CaptureWorker(store, config, summarize)
  const recovered = worker.reconcile()
  if (recovered > 0) {
    console.log(`[mind-dsh] recovered ${recovered} stale capture job(s)`)
  }

  // A previous one-shot process may have exited with jobs still pending.
  const kick = setTimeout(() => {
    void worker.flush()
  }, 500)
  kick.unref()
  const interval = setInterval(() => {
    void worker.flush()
  }, config.workerIntervalMs)
  interval.unref()

  const c = ctx as MindContext
  c.systemPrompt.section({
    name: 'mind-dsh:static',
    order: c.systemPrompt.getSectionOrder('TOOL_SESSION_QUERY'),
    text: '[MIND] initializing',
  })

  ctx.on('session/event', (sessionRaw: unknown, eventRaw: unknown) => {
    if (!config.captureEnabled) return
    const finished = buffer.push(sessionRaw as SessionLike, eventRaw as EventLike)
    if (finished === null) return
    worker.enqueue(finished, {
      workspaceId: workspaceIdFor(finished.workspacePath),
      rootId: ROOT_ID,
    })
  })

  ctx.effect(() => () => {
    clearTimeout(kick)
    clearInterval(interval)
    const remaining = buffer.flushAll()
    for (const turn of remaining) {
      worker.enqueue(turn, { workspaceId: workspaceIdFor(turn.workspacePath), rootId: ROOT_ID })
    }
    void worker.flush().finally(() => {
      worker.dispose()
      store.close()
    })
  })

  console.log('[mind-dsh] loaded')
}

/** Stable path-derived workspace id until Step 5 adds inode identity. */
export function workspaceIdFor(workspacePath: string | null): string | null {
  if (workspacePath === null || workspacePath === '') return null
  let real = workspacePath
  try {
    real = fs.realpathSync(workspacePath)
  } catch {
    // Keep the original path when it cannot be resolved.
  }
  return crypto.createHash('sha1').update(real).digest('hex').slice(0, 16)
}
