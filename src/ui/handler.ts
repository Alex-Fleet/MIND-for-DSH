import crypto from 'node:crypto'
import type { PersistedSettings, ResolvedConfig } from '../config.js'
import type { Store } from '../db/store.js'
import { readTurnPreview } from '../turns/preview.js'
import { readTurnChunk } from '../turns/read.js'

export const UI_ENDPOINTS = [
  'timeline',
  'day',
  'turn',
  'current',
  'workspaces',
  'proposals',
  'resolveProposal',
  'settings',
  'updateSettings',
  'saveEntry',
] as const

export type UiEndpoint = (typeof UI_ENDPOINTS)[number]

export interface UiDeps {
  store: Store
  config: ResolvedConfig
  saveSettings: (settings: PersistedSettings) => void
}

export interface UiErrorBody {
  code: string
  message: string
}

export type UiResult =
  | { ok: true; value: unknown }
  | { ok: false; error: UiErrorBody }

class UiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'UiError'
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LAYERS = ['project', 'whiteboard', 'user', 'rule'] as const
const MAX_BODY_CHARS = 100_000
const MAX_PAGE = 500

type Handler = (deps: UiDeps, payload: Record<string, unknown>) => Promise<unknown> | unknown

const HANDLERS: Record<UiEndpoint, Handler> = {
  timeline: readTimeline,
  day: readDay,
  turn: readTurn,
  current: readCurrent,
  workspaces: readWorkspaces,
  proposals: readProposals,
  resolveProposal,
  settings: readSettings,
  updateSettings,
  saveEntry,
}

/** Dispatch one UI request without touching HTTP framing. */
export async function handleUiRequest(
  deps: UiDeps,
  endpoint: string,
  payload: unknown,
): Promise<UiResult> {
  const handler = Object.hasOwn(HANDLERS, endpoint) ? HANDLERS[endpoint as UiEndpoint] : undefined
  if (handler === undefined) {
    return { ok: false, error: { code: 'not-found', message: `unknown endpoint: ${endpoint}` } }
  }
  try {
    const body = optionalObject(payload)
    return { ok: true, value: await handler(deps, body) }
  } catch (error) {
    if (error instanceof UiError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { code: 'internal', message } }
  }
}

// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------

function readTimeline(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const limit = boundedInt(payload.limit, 50, 1, MAX_PAGE)
  const before = optionalObject(payload.before)
  let beforeDate: string | null = null
  let beforeWorkspaceId: string | null = null
  if (before !== undefined && before !== null && Object.keys(before).length > 0) {
    beforeDate = requiredDate(before.date, 'before.date')
    beforeWorkspaceId = requiredString(before.workspaceId, 'before.workspaceId', 200)
  }

  const rows = deps.store.listDayPage(beforeDate, beforeWorkspaceId, limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    rows: page.map(row => ({
      date: String(row.local_date ?? ''),
      workspaceId: String(row.workspace_id ?? ''),
      workspaceName: String(row.display_name ?? row.workspace_id ?? ''),
      title: String(row.title ?? ''),
      turnCount: Number(row.turn_count ?? 0),
      reportPath: row.report_rel_path === null || row.report_rel_path === undefined ? null : String(row.report_rel_path),
    })),
    next:
      rows.length > limit && last !== undefined
        ? { date: String(last.local_date ?? ''), workspaceId: String(last.workspace_id ?? '') }
        : null,
  }
}

function readDay(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const workspaceId = requiredString(payload.workspaceId, 'workspaceId', 200)
  const date = requiredDate(payload.date, 'date')
  const limit = boundedInt(payload.limit, 300, 1, MAX_PAGE)
  const rows = deps.store.listTurnsForDay(workspaceId, date, limit + 1)
  return {
    date,
    workspaceId,
    truncated: rows.length > limit,
    rows: rows.slice(0, limit).map(row => ({
      turnId: String(row.turn_id ?? ''),
      sessionId: String(row.session_id ?? ''),
      turnSeq: Number(row.turn_seq ?? 0),
      origin: String(row.origin ?? 'main'),
      occurredAt: String(row.occurred_at ?? ''),
      title: row.title === null || row.title === undefined ? null : String(row.title),
      conclusion: row.conclusion === null || row.conclusion === undefined ? null : String(row.conclusion),
      preview: readTurnPreview(deps.config.mindRoot, row.raw_rel_path === null || row.raw_rel_path === undefined ? null : String(row.raw_rel_path)),
      indexed: row.index_status === 'current',
      rawPath: row.raw_rel_path === null || row.raw_rel_path === undefined ? null : String(row.raw_rel_path),
    })),
  }
}

function readTurn(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const turnId = requiredString(payload.turnId, 'turnId', 500)
  const offset = boundedInt(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  const max = boundedInt(payload.max, 20_000, 1, 100_000)
  try {
    return readTurnChunk(deps.store, deps.config.mindRoot, turnId, offset, max)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UiError(message.startsWith('turn not found') || message.includes('unavailable') ? 'not-found' : 'internal', message)
  }
}

function readCurrent(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const limit = boundedInt(payload.limit, 300, 1, MAX_PAGE)
  const workspaceFilter = optionalNullableString(payload.workspaceId, 'workspaceId', 200)
  const rows = deps.store.listAllCognitionEntries(limit + 1, workspaceFilter)
  return {
    rows: rows.slice(0, limit).map(row => ({
      id: String(row.id ?? ''),
      workspaceId: row.workspace_id === null || row.workspace_id === undefined ? null : String(row.workspace_id),
      workspaceName:
        row.display_name === null || row.display_name === undefined
          ? row.workspace_id === null || row.workspace_id === undefined
            ? '全局'
            : String(row.workspace_id)
          : String(row.display_name),
      layer: String(row.layer ?? 'project'),
      title: String(row.title ?? ''),
      content: String(row.conclusion ?? ''),
      enabled: Number(row.enabled ?? 1) === 1,
      version: Number(row.version ?? 1),
      updatedAt: String(row.updated_at ?? ''),
      sourcePath: row.source_rel_path === null || row.source_rel_path === undefined ? null : String(row.source_rel_path),
    })),
    truncated: rows.length > limit,
  }
}

function readWorkspaces(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const limit = boundedInt(payload.limit, 200, 1, MAX_PAGE)
  const workspaces = deps.store.listWorkspaces(limit + 1)
  const locations = deps.store.listAllLocations(2_001)
  return {
    truncated: workspaces.length > limit || locations.length > 2_000,
    rows: workspaces.slice(0, limit).map(workspace => {
      const workspaceId = String(workspace.workspace_id ?? '')
      return {
        workspaceId,
        displayName: String(workspace.display_name ?? workspaceId),
        createdAt: String(workspace.created_at ?? ''),
        turnCount: Number(workspace.turn_count ?? 0),
        lastTurnAt: workspace.last_turn_at === null || workspace.last_turn_at === undefined
          ? null
          : String(workspace.last_turn_at),
        paths: locations
          .filter(location => String(location.workspace_id ?? '') === workspaceId)
          .map(location => ({
            path: String(location.current_path ?? ''),
            inode: location.inode === null || location.inode === undefined ? null : Number(location.inode),
            volumeUuid: location.volume_uuid === null || location.volume_uuid === undefined
              ? null
              : String(location.volume_uuid),
            confidence: String(location.confidence ?? 'low'),
            lastSeen: String(location.last_seen ?? ''),
          })),
      }
    }),
  }
}

function readProposals(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const status = optionalOneOf(payload.status, ['pending', 'approved', 'rejected', 'all'] as const, 'status') ?? 'pending'
  const limit = boundedInt(payload.limit, 200, 1, MAX_PAGE)
  const rows = deps.store.listProposalsPage(status === 'all' ? null : status, limit + 1)
  return {
    rows: rows.slice(0, limit).map(row => ({
      id: String(row.id ?? ''),
      workspaceId: row.workspace_id === null || row.workspace_id === undefined ? null : String(row.workspace_id),
      workspaceName: String(row.display_name ?? row.workspace_id ?? '全局'),
      layer: String(row.layer ?? 'user'),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      status: String(row.status ?? 'pending'),
      sourceTurn: row.source_turn === null || row.source_turn === undefined ? null : String(row.source_turn),
      createdAt: String(row.created_at ?? ''),
      reviewedAt: row.reviewed_at === null || row.reviewed_at === undefined ? null : String(row.reviewed_at),
    })),
    pendingCount: deps.store.countProposals('pending'),
    truncated: rows.length > limit,
  }
}

function resolveProposal(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const id = requiredString(payload.id, 'id', 200)
  const action = requiredOneOf(payload.action, ['approve', 'reject'] as const, 'action')
  const reason = optionalNullableString(payload.reason, 'reason', 500) ?? null
  try {
    return deps.store.resolveProposal({ id, action, reviewer: 'ui', reason })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = message.startsWith('proposal not found')
      ? 'not-found'
      : message.startsWith('proposal already reviewed')
        ? 'conflict'
        : 'internal'
    throw new UiError(code, message)
  }
}

function readSettings(deps: UiDeps, _payload: Record<string, unknown>): unknown {
  const { config, store } = deps
  return {
    captureEnabled: config.captureEnabled,
    injectEnabled: config.injectEnabled,
    uiEnabled: config.uiEnabled,
    mindRoot: config.mindRoot,
    standardsDir: config.standardsDir,
    workerIntervalMs: config.workerIntervalMs,
    dayBoundaryMinutes: config.dayBoundaryMinutes,
    wrapWidth: config.wrapWidth,
    maxAttempts: config.maxAttempts,
    turnCount: store.countTurns(),
    pendingProposals: store.countProposals('pending'),
  }
}

function updateSettings(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const captureEnabled = optionalBoolean(payload.captureEnabled, 'captureEnabled')
  const injectEnabled = optionalBoolean(payload.injectEnabled, 'injectEnabled')
  if (captureEnabled === undefined && injectEnabled === undefined) {
    throw new UiError('bad-request', 'captureEnabled or injectEnabled is required')
  }
  if (captureEnabled !== undefined) deps.config.captureEnabled = captureEnabled
  if (injectEnabled !== undefined) deps.config.injectEnabled = injectEnabled
  deps.saveSettings({
    captureEnabled: deps.config.captureEnabled,
    injectEnabled: deps.config.injectEnabled,
  })
  return readSettings(deps, {})
}

// ---------------------------------------------------------------------------
// Entry editing (B+ structured form)
// ---------------------------------------------------------------------------

function saveEntry(deps: UiDeps, payload: Record<string, unknown>): unknown {
  const id = optionalString(payload.id, 'id', 200)

  if (id !== undefined) {
    const existing = deps.store.getCognitionEntry(id)
    if (existing === undefined) throw new UiError('not-found', `entry not found: ${id}`)

    // Omitted fields keep the stored value: a partial update must never
    // silently clear content, re-enable, or move an entry to global.
    const layer = optionalOneOf(payload.layer, LAYERS, 'layer') ?? layerOf(existing.layer)
    const title = (optionalString(payload.title, 'title', 200) ?? String(existing.title ?? '')).trim()
    if (title === '') throw new UiError('bad-request', 'title must not be empty')
    const content = optionalString(payload.content, 'content', MAX_BODY_CHARS) ?? String(existing.conclusion ?? '')
    const enabled = optionalBoolean(payload.enabled, 'enabled') ?? Number(existing.enabled ?? 1) === 1
    const workspaceId = Object.hasOwn(payload, 'workspaceId')
      ? optionalNullableString(payload.workspaceId, 'workspaceId', 200) ?? null
      : typeof existing.workspace_id === 'string'
        ? existing.workspace_id
        : null

    const updated = deps.store.updateCognitionEntry({ id, workspaceId, layer, title, conclusion: content, enabled })
    if (!updated) throw new UiError('conflict', `entry is not editable: ${id}`)
    return { id, version: Number(deps.store.getCognitionEntry(id)?.version ?? 1) }
  }

  const layer = requiredOneOf(payload.layer, LAYERS, 'layer')
  const title = requiredString(payload.title, 'title', 200).trim()
  if (title === '') throw new UiError('bad-request', 'title must not be empty')
  const content = optionalString(payload.content, 'content', MAX_BODY_CHARS) ?? ''
  const workspaceId = optionalNullableString(payload.workspaceId, 'workspaceId', 200) ?? null
  const enabled = optionalBoolean(payload.enabled, 'enabled') ?? true

  const createdId = `cog-${crypto.randomUUID()}`
  deps.store.createCognitionEntry({
    id: createdId,
    workspaceId,
    layer,
    title,
    conclusion: content,
    enabled,
    rootId: 'default',
  })
  return { id: createdId, version: 1 }
}

function layerOf(value: unknown): (typeof LAYERS)[number] {
  return LAYERS.includes(value as (typeof LAYERS)[number]) ? (value as (typeof LAYERS)[number]) : 'rule'
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function optionalObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new UiError('bad-request', 'payload must be a JSON object')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value === '') throw new UiError('bad-request', `${name} must be a non-empty string`)
  if (value.length > max) throw new UiError('bad-request', `${name} exceeds ${max} characters`)
  return value
}

function optionalString(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new UiError('bad-request', `${name} must be a string`)
  if (value.length > max) throw new UiError('bad-request', `${name} exceeds ${max} characters`)
  return value
}

function optionalNullableString(value: unknown, name: string, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return requiredString(value, name, max)
}

function requiredDate(value: unknown, name: string): string {
  const text = requiredString(value, name, 10)
  if (!DATE_RE.test(text)) throw new UiError('bad-request', `${name} must be YYYY-MM-DD`)
  const [yearText, monthText, dayText] = text.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new UiError('bad-request', `${name} is not a real calendar date`)
  }
  return text
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UiError('bad-request', 'expected a number')
  const rounded = Math.floor(value)
  if (rounded < min || rounded > max) throw new UiError('bad-request', `value must be between ${min} and ${max}`)
  return rounded
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new UiError('bad-request', `${name} must be a boolean`)
  return value
}

function requiredOneOf<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new UiError('bad-request', `${name} must be one of: ${allowed.join(', ')}`)
  }
  return value as T[number]
}

function optionalOneOf<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] | undefined {
  if (value === undefined || value === null) return undefined
  return requiredOneOf(value, allowed, name)
}
