import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { TurnBuffer, type EventLike, type SessionLike } from './capture/buffer.js'
import { CaptureWorker, localDateOf } from './capture/worker.js'
import { resolveConfig, type MindConfig } from './config.js'
import { Store } from './db/store.js'
import { resolveWorkspace } from './identity/workspace.js'
import { buildIncrement } from './inject/increment.js'
import { buildSnapshot } from './inject/snapshot.js'
import { createStandardsProvider } from './inject/standards.js'
import { createLlmSummarizer } from './summarize/llm.js'
import type { MindContext } from './types.js'

export const name = 'mind-dsh'

/** Services required before apply() runs. */
export const inject = ['systemPrompt'] as const

const ROOT_ID = 'default'
const CONTEXT_SOURCE = { kind: 'mind-dsh' } as const

interface PreStepPayload {
  agent?: { session?: { id?: string; header?: { cwd?: string } } }
  turn?: number
  step?: number
  signal?: AbortSignal
}

type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: unknown[]; startsRequestSeries?: true }

/**
 * MIND for DSH entry point.
 *
 * Steps 1-4: capture, durable storage, indexing, and injection.
 */
export function apply(ctx: Context, rawConfig: MindConfig = {}): void {
  const config = resolveConfig(rawConfig)
  fs.mkdirSync(config.mindRoot, { recursive: true })

  const store = new Store(path.join(config.mindRoot, 'mind.db'))
  store.ensureRoot(ROOT_ID, config.mindRoot)

  const buffer = new TurnBuffer()
  const summarize = createLlmSummarizer({
    ctx,
    ...(config.summaryProvider === '' ? {} : { provider: config.summaryProvider }),
    ...(config.summaryModel === '' ? {} : { model: config.summaryModel }),
  })
  const worker = new CaptureWorker(store, config, summarize)
  const recovered = worker.reconcile()
  if (recovered > 0) {
    console.log(`[mind-dsh] recovered ${recovered} stale capture job(s)`)
  }

  const kick = setTimeout(() => {
    void worker.flush()
  }, 500)
  kick.unref()
  const interval = setInterval(() => {
    void worker.flush()
  }, config.workerIntervalMs)
  interval.unref()

  let currentWorkspaceId: string | null = null
  let currentWorkspacePath: string | null = null
  let currentCwd: string | null = null
  const lastIncrement = new Map<string, string>()

  function ensureWorkspace(cwd: string | null): string | null {
    if (cwd === null || cwd === '') return currentWorkspaceId
    if (cwd === currentCwd) return currentWorkspaceId
    currentCwd = cwd
    try {
      const resolved = resolveWorkspace(store, cwd)
      currentWorkspaceId = resolved.workspaceId
      currentWorkspacePath = resolved.workspacePath
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] workspace resolve failed: ${message}`)
      currentWorkspaceId = workspaceIdFor(cwd)
      currentWorkspacePath = cwd
    }
    return currentWorkspaceId
  }

  const c = ctx as MindContext
  const standards = createStandardsProvider(config.standardsDir)
  c.systemPrompt.section({
    name: 'mind-dsh:static',
    order: c.systemPrompt.getSectionOrder('TOOL_SESSION_QUERY'),
    text: () => standards(),
  })

  c.systemPrompt.context({
    name: 'mind-dsh:snapshot',
    order: 1000,
    text: () =>
      buildSnapshot({
        store,
        workspaceId: currentWorkspaceId ?? 'orphan',
        rootPath: config.mindRoot,
        localDate: localDateOf(Date.now(), config.dayBoundaryMinutes),
        dayBoundaryMinutes: config.dayBoundaryMinutes,
      }),
  })

  ctx.on('session/event', (sessionRaw: unknown, eventRaw: unknown) => {
    const session = sessionRaw as SessionLike
    const workspaceId = ensureWorkspace(session.header?.cwd ?? null)
    if (!config.captureEnabled) return
    const finished = buffer.push(session, eventRaw as EventLike)
    if (finished === null) return
    worker.enqueue(finished, {
      workspaceId: workspaceId ?? workspaceIdFor(finished.workspacePath),
      rootId: ROOT_ID,
    })
  })

  ctx.on('agent/pre-step', async (payload: unknown, next: () => Promise<unknown>): Promise<PreStepDecision> => {
    const downstream = (await next()) as PreStepDecision
    if (downstream.kind !== 'enter') return downstream

    const input = payload as PreStepPayload
    if (input.step !== 1) return downstream

    const workspaceId = ensureWorkspace(input.agent?.session?.header?.cwd ?? null) ?? currentWorkspaceId
    if (workspaceId === null) return downstream

    const increment = buildIncrement(store, workspaceId, localDateOf(Date.now(), config.dayBoundaryMinutes))
    if (increment === null) return downstream

    const sessionId = input.agent?.session?.id ?? 'unknown'
    if (lastIncrement.get(sessionId) === increment) return downstream
    lastIncrement.set(sessionId, increment)

    const message = createUserMessage({
      content: [{ type: 'text', text: increment }],
      source: CONTEXT_SOURCE as never,
    })

    return { ...downstream, messages: [...downstream.messages, message] }
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
