import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface MindConfig {
  /** Absolute root for MIND data. Defaults to $DSH_HOME/mind. */
  mindRoot?: string
  captureEnabled?: boolean
  injectEnabled?: boolean
  uiEnabled?: boolean
  /** How often the capture worker drains pending jobs. */
  workerIntervalMs?: number
  /** Fast retries before the steady 30-minute summary retry cadence. */
  maxAttempts?: number
  /** Lease duration for a claimed job. */
  leaseMs?: number
  /** Hard-wrap width for model-readable turn files. */
  wrapWidth?: number
  /** Directory containing behavior-standards.md, programming-standards.md, checklists-index.md. */
  standardsDir?: string
  /** Local day boundary in minutes after midnight (default 240 = 04:00). */
  dayBoundaryMinutes?: number
  /** Auxiliary summary provider/model; defaults to the turn's request model. */
  summaryProvider?: string
  summaryModel?: string
}

export type ResolvedConfig = Required<MindConfig>

export const DEFAULT_CONFIG: ResolvedConfig = {
  mindRoot: '',
  captureEnabled: true,
  injectEnabled: true,
  uiEnabled: true,
  workerIntervalMs: 2000,
  maxAttempts: 5,
  leaseMs: 300_000,
  wrapWidth: 800,
  standardsDir: '',
  dayBoundaryMinutes: 240,
  summaryProvider: '',
  summaryModel: '',
}

export function resolveMindRoot(config: MindConfig = {}): string {
  if (config.mindRoot !== undefined && config.mindRoot !== '') {
    return path.resolve(config.mindRoot)
  }
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'mind')
}

export function resolveConfig(config: MindConfig = {}): ResolvedConfig {
  const mindRoot = resolveMindRoot(config)
  return {
    ...DEFAULT_CONFIG,
    ...config,
    mindRoot,
    standardsDir:
      config.standardsDir !== undefined && config.standardsDir !== ''
        ? path.resolve(config.standardsDir)
        : path.join(mindRoot, 'global', 'standards'),
  }
}

/** The two toggles the Settings page owns. */
export interface PersistedSettings {
  captureEnabled?: boolean
  injectEnabled?: boolean
}

/**
 * Read the UI-owned settings file. This is deliberately separate from the
 * Cordis config: a missing or malformed file means "no overrides", never a
 * load failure.
 */
export function loadPersistedSettings(mindRoot: string): PersistedSettings {
  try {
    const raw = fs.readFileSync(path.join(mindRoot, 'settings.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    const settings: PersistedSettings = {}
    if (typeof record.captureEnabled === 'boolean') settings.captureEnabled = record.captureEnabled
    if (typeof record.injectEnabled === 'boolean') settings.injectEnabled = record.injectEnabled
    return settings
  } catch {
    return {}
  }
}

/** Atomically persist the UI-owned settings. */
export function savePersistedSettings(mindRoot: string, settings: PersistedSettings): void {
  fs.mkdirSync(mindRoot, { recursive: true, mode: 0o700 })
  const target = path.join(mindRoot, 'settings.json')
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temp, target)
  try {
    fs.chmodSync(target, 0o600)
  } catch {
    // Filesystems without POSIX modes.
  }
}
