import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { TurnBuffer, type EventLike, type SessionLike } from './capture/buffer.js'
import { CaptureWorker, localDateOf } from './capture/worker.js'
import { loadPersistedSettings, resolveConfig, savePersistedSettings, type MindConfig } from './config.js'
import { Store } from './db/store.js'
import { syncDshWorkspaceNames } from './identity/dsh-names.js'
import { workspacePathCandidates } from './identity/path.js'
import { SessionWorkspaceCache } from './identity/session-cache.js'
import { resolveWorkspace } from './identity/workspace.js'
import { hardenDirectoryTree } from './security/permissions.js'
import { findOpenTurn } from './recovery/open-turn.js'
import { buildIncrement } from './inject/increment.js'
import { buildSnapshot } from './inject/snapshot.js'
import { createStandardsProvider } from './inject/standards.js'
import { createLlmSummarizer } from './summarize/llm.js'
import { registerMindTools } from './tools/mind-tools.js'
import { registerUiRoutes } from './ui/routes.js'
import type { MindContext } from './types.js'

export const name = 'mind-dsh'

/** Services required before apply() runs. */
export const inject = ['systemPrompt', 'tools'] as const

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
  fs.mkdirSync(config.mindRoot, { recursive: true, mode: 0o700 })
  // A custom mindRoot could point at a shared directory. Only harden roots
  // that are new/empty, explicitly marked, or the conventional `.../mind`
  // directory with an existing database.
  const rootMarker = path.join(config.mindRoot, '.mind-root')
  let rootEntries: string[] = []
  try {
    rootEntries = fs.readdirSync(config.mindRoot)
  } catch {
    // Treat an unreadable root as unsafe to harden.
  }
  const safeRoot =
    rootEntries.length === 0 ||
    fs.existsSync(rootMarker) ||
    (path.basename(config.mindRoot) === 'mind' && fs.existsSync(path.join(config.mindRoot, 'mind.db')))
  if (safeRoot) {
    try {
      if (!fs.existsSync(rootMarker)) {
        fs.writeFileSync(rootMarker, 'mind\n', { encoding: 'utf8', mode: 0o600 })
      }
      fs.chmodSync(config.mindRoot, 0o700)
      hardenDirectoryTree(config.mindRoot)
    } catch {
      // A read-only or exotic filesystem may refuse chmod; do not block capture.
    }
  } else {
    console.warn(
      `[mind-dsh] mindRoot is a non-empty directory without a MIND marker; skipping permission hardening: ${config.mindRoot}`,
    )
  }

  // The Settings page owns two switches. Persisted values win over the
  // profile config so a UI toggle survives a restart.
  const persisted = loadPersistedSettings(config.mindRoot)
  if (persisted.captureEnabled !== undefined) config.captureEnabled = persisted.captureEnabled
  if (persisted.injectEnabled !== undefined) config.injectEnabled = persisted.injectEnabled

  const store = new Store(path.join(config.mindRoot, 'mind.db'))
  store.ensureRoot(ROOT_ID, config.mindRoot)

  // DSH owns the user-visible workspace title (including the localized
  // "默认工作区" for the automatic title). MIND stores its own identity, so
  // project the DSH title onto the matching MIND workspace before names are
  // read by the UI.
  let workspaceRegistry: WorkspaceRegistryLike | null = null
  let lastWorkspaceSync = 0
  const syncWorkspaceNames = (force = false): void => {
    if (workspaceRegistry === null) return
    const now = Date.now()
    if (!force && now - lastWorkspaceSync < 30_000) return
    lastWorkspaceSync = now
    try {
      syncDshWorkspaceNames(store, workspaceRegistry.list())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] workspace title sync failed: ${message}`)
    }
  }
  ctx.inject(['workspaceRegistry'], child => {
    workspaceRegistry = (
      child as unknown as { workspaceRegistry: WorkspaceRegistryLike }
    ).workspaceRegistry
    syncWorkspaceNames(true)
  })

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
  const retried = store.requeueSummaryFailures()
  if (retried > 0) {
    console.log(`[mind-dsh] requeued ${retried} retryable summary job(s)`)
  }
  const reconciled = worker.reconcileRawTurns()
  if (reconciled > 0) {
    console.log(`[mind-dsh] reconciled ${reconciled} orphan raw turn(s)`)
  }
  const backfilled = worker.backfillIndexes()
  if (backfilled > 0) {
    console.log(`[mind-dsh] backfilled ${backfilled} turn index(es)`)
  }
  const rebuilt = worker.rebuildMissingViews()
  if (rebuilt > 0) {
    console.log(`[mind-dsh] rebuilt ${rebuilt} stale day view(s)`)
  }

  const kick = setTimeout(() => {
    void worker.flush()
  }, 500)
  kick.unref()
  const interval = setInterval(() => {
    // A restart inside the lease window would otherwise leave a job running
    // until the next restart; recover it as soon as the lease expires.
    const recoveredNow = store.recoverStaleJobs()
    if (recoveredNow > 0) {
      console.log(`[mind-dsh] recovered ${recoveredNow} expired capture job(s)`)
    }
    void worker.flush()
  }, config.workerIntervalMs)
  interval.unref()

  const workspaces = new SessionWorkspaceCache(cwd => {
    try {
      const resolved = resolveWorkspace(store, cwd)
      return { id: resolved.workspaceId, path: resolved.workspacePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] workspace resolve failed: ${message}`)
      return { id: workspaceIdFor(cwd), path: cwd }
    }
  })
  const lastIncrement = new Map<string, string>()

  function ensureWorkspace(sessionId: string, cwd: string | null): string | null {
    return workspaces.get(sessionId, cwd)
  }

  const c = ctx as MindContext
  const standards = createStandardsProvider(config.standardsDir)
  c.systemPrompt.section({
    name: 'mind-dsh:static',
    order: c.systemPrompt.getSectionOrder('TOOL_SESSION_QUERY'),
    text: () => (config.injectEnabled ? standards() : ''),
  })

  const snapshotCache = new Map<string, string>()

  /**
   * Drop every cached snapshot for one session so the next turn rebuilds it.
   * Used when a compaction/prune changed what the model can still see: the
   * frozen block must be re-read from the durable store, otherwise both the
   * folded history and the memory block go missing.
   */
  const invalidateSnapshot = (sessionId: string): void => {
    const prefix = `${sessionId}:`
    for (const key of snapshotCache.keys()) {
      if (key.startsWith(prefix)) snapshotCache.delete(key)
    }
    lastIncrement.delete(sessionId)
  }
  c.systemPrompt.context({
    name: 'mind-dsh:snapshot',
    order: 1000,
    text: (context: unknown) => {
      if (!config.injectEnabled) return ''
      // The assembly context carries the current agent; use its session/cwd
      // instead of a process-global "last workspace", which can leak across
      // concurrent sessions.
      const agent = (
        context as {
          agent?: { id?: string; session?: { header?: { cwd?: string } } }
        }
      ).agent
      const sessionId = typeof agent?.id === 'string' ? agent.id : 'unknown'
      const cwd = agent?.session?.header?.cwd ?? null
      const workspaceId = ensureWorkspace(sessionId, cwd) ?? 'orphan'
      syncWorkspaceNames()
      const cacheKey = `${sessionId}:${workspaceId}:${store.ruleStamp(workspaceId)}`
      const cached = snapshotCache.get(cacheKey)
      if (cached !== undefined) return cached
      const text = buildSnapshot({
        store,
        workspaceId,
        rootPath: config.mindRoot,
        localDate: localDateOf(Date.now(), config.dayBoundaryMinutes),
        dayBoundaryMinutes: config.dayBoundaryMinutes,
        turnBudgetChars: config.turnSummaryChars,
      })
      snapshotCache.set(cacheKey, text)
      while (snapshotCache.size > 200) {
        const oldest = snapshotCache.keys().next().value
        if (oldest === undefined) break
        snapshotCache.delete(oldest)
      }
      return text
    },
  })

  registerMindTools(c.tools, store, config.mindRoot, agent => {
    const sessionId =
      typeof agent?.session?.id === 'string'
        ? agent.session.id
        : typeof agent?.id === 'string'
          ? agent.id
          : 'unknown'
    const cwd = agent?.session?.header?.cwd ?? null
    const workspaceId = ensureWorkspace(sessionId, cwd)
    return workspaceId === null || workspaceId === 'orphan' ? null : workspaceId
  })

  // Recover turns that were open when the previous process died. DSH's
  // persisted session log is the source of truth; the live buffer alone
  // would lose the turn. This runs only after the plugin is active, and
  // skips turns already present in MIND.
  ctx.inject(['sessionPersistence'], child => {
    void recoverInterruptedTurns(
      child as unknown as { sessionPersistence: SessionPersistenceLike; get?: (name: string) => unknown },
      store,
      worker,
    ).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mind-dsh] interrupted-turn recovery failed: ${message}`)
    })
  })

  registerUiRoutes(
    ctx,
    {
      store,
      config,
      saveSettings: settings => savePersistedSettings(config.mindRoot, settings),
      refreshWorkspaceNames: () => syncWorkspaceNames(true),
    },
    config.uiEnabled,
  )

  ctx.on(
    'session/event',
    ((sessionRaw: unknown, eventRaw: unknown) => {
      const session = sessionRaw as SessionLike
      const sessionId = String(session.id ?? 'unknown')
      // Compaction/prune folded part of the history away. Rebuild the memory
      // block on the next turn so the folded span is replaced by durable
      // memory. This runs even when capture is off, because injection may be
      // on independently. A failed compaction changed nothing, so it is
      // ignored.
      const event = eventRaw as EventLike
      if (isCompactionSuccess(event)) invalidateSnapshot(sessionId)
      const workspaceId = ensureWorkspace(sessionId, session.header?.cwd ?? null)
      if (!config.captureEnabled) return
      const finished = buffer.push(session, event)
      if (finished === null) return
      worker.enqueue(finished, {
        workspaceId: workspaceId ?? 'orphan',
        rootId: ROOT_ID,
      })
    }) as never,
  )

  ctx.on(
    'agent/pre-step',
    (async (payload: unknown, next: () => Promise<unknown>): Promise<PreStepDecision> => {
      const downstream = (await next()) as PreStepDecision
      if (downstream.kind !== 'enter') return downstream
      if (!config.injectEnabled) return downstream

      const input = payload as PreStepPayload
      if (input.step !== 1) return downstream

      const workspaceId = ensureWorkspace(
        String(input.agent?.session?.id ?? 'unknown'),
        input.agent?.session?.header?.cwd ?? null,
      )
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
    }) as never,
  )

  ctx.effect(() => () => {
    clearTimeout(kick)
    clearInterval(interval)
    const remaining = buffer.flushAll()
    for (const turn of remaining) {
      const workspaceId = ensureWorkspace(turn.sessionId, turn.workspacePath) ?? 'orphan'
      worker.enqueue(turn, { workspaceId, rootId: ROOT_ID })
    }
    void worker.flush().finally(() => {
      worker.dispose()
      store.close()
    })
  })

  console.log('[mind-dsh] loaded')
}

interface PersistedSessionRecord {
  header: {
    id: string
    cwd?: string
    origin?: string
    delegationDepth?: number
  }
  eventCount?: number
  live?: boolean
}

interface SessionEventLike {
  type: string
  seq: number
  time?: number
  data?: unknown
}

interface SessionHandleLike {
  read(offset?: number): Promise<{ events: readonly SessionEventLike[] }>
  close(): Promise<void>
}

interface SessionPersistenceLike {
  list(options?: unknown): Promise<readonly PersistedSessionRecord[]>
  stat?(id: string, options?: unknown): Promise<{ eventCount?: number } | undefined>
  open(id: string, mode: 'read' | 'write', options?: unknown): Promise<SessionHandleLike>
}

interface WorkspaceRegistryLike {
  list(): ReadonlyArray<{ id?: unknown; path?: unknown; title?: unknown }>
}

async function recoverInterruptedTurns(
  host: { sessionPersistence: SessionPersistenceLike; get?: (name: string) => unknown },
  store: Store,
  worker: CaptureWorker,
): Promise<void> {
  const persistence = host.sessionPersistence
  const agents = host.get?.('agents') as { get?: (id: string) => unknown } | undefined
  let records: readonly PersistedSessionRecord[]
  try {
    records = await persistence.list()
  } catch {
    return
  }

  let recovered = 0
  for (const record of records.slice(0, 200)) {
    const sessionId = record.header.id
    if (sessionId === '') continue
    if (record.live === true) continue
    if (agents?.get?.(sessionId) !== undefined) continue

    const eventCount = Number(record.eventCount ?? 0)
    let tail: readonly SessionEventLike[] = []
    try {
      const handle = await persistence.open(sessionId, 'read')
      try {
        tail = (await handle.read(Math.max(0, eventCount - 50))).events
      } finally {
        await handle.close()
      }
    } catch {
      continue
    }
    const last = tail[tail.length - 1]
    if (last !== undefined && last.type === 'turn/end') continue

    // The tail is empty or does not end in turn/end: read the complete log to
    // find the turn/start (a long turn may start more than 50 events back).
    let all: readonly SessionEventLike[] = []
    try {
      const handle = await persistence.open(sessionId, 'read')
      try {
        all = (await handle.read(0)).events
      } finally {
        await handle.close()
      }
    } catch {
      continue
    }

    const openTurn = findOpenTurn(all)
    if (openTurn === null) continue
    const { turn, startSeq } = openTurn
    const turnId = `${sessionId}:${turn}`
    if (store.getTurn(turnId) !== undefined) continue

    const events = all
      .filter(event => event.seq >= startSeq)
      .map(event => ({
        type: event.type,
        seq: event.seq,
        occurredAt: typeof event.time === 'number' ? event.time : Date.now(),
        data: event.data,
      }))
    const startedAt = events[0]?.occurredAt ?? Date.now()
    const cwd = record.header.cwd ?? null
    let workspaceId: string | null = null
    if (cwd !== null && cwd !== '') {
      try {
        workspaceId = resolveWorkspace(store, cwd).workspaceId
      } catch {
        // The directory may have been moved or deleted while the process was
        // down. Reuse its recorded identity; a fresh path hash would split the
        // same logical workspace in two. Try symlink/realpath variants too.
        let historical: Record<string, unknown> | undefined
        for (const candidate of workspacePathCandidates(cwd)) {
          historical = store.findWorkspaceByPath(candidate)
          if (historical !== undefined) break
        }
        workspaceId = historical === undefined ? 'orphan' : String(historical.workspace_id)
      }
    }
    worker.enqueue(
      {
        sessionId,
        turn,
        startedAt,
        endedAt: events.at(-1)?.occurredAt ?? startedAt,
        endReason: 'interrupted',
        origin: record.header.origin === 'subagent' ? 'subagent' : 'main',
        workspacePath: cwd,
        events,
      },
      { workspaceId: workspaceId ?? 'orphan', rootId: ROOT_ID },
    )
    recovered += 1
  }
  if (recovered > 0) {
    console.log(`[mind-dsh] recovered ${recovered} interrupted turn(s) from session logs`)
  }
}

/**
 * True when a session event means context was successfully compacted or
 * pruned: `compaction/end` without an error, or `compaction/prune`.
 *
 * DSH emits `compaction/start` → `compaction/summary` → `compaction/end` for a
 * summarising compaction, and a standalone `compaction/prune` for a pure
 * trim. Manual `/compact` commands carry `sourceCommandId`; automatic ones do
 * not. Both success paths invalidate the snapshot; a failed `compaction/end`
 * carries `error` and must not.
 */
export function isCompactionSuccess(event: EventLike): boolean {
  if (event.type === 'compaction/prune') return true
  if (event.type !== 'compaction/end') return false
  const data = event.data
  if (data === null || typeof data !== 'object') return true
  const error = (data as Record<string, unknown>).error
  return error === undefined || error === null || error === ''
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
