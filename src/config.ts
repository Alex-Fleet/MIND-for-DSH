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
  /** Maximum attempts before a job becomes dead. */
  maxAttempts?: number
  /** Lease duration for a claimed job. */
  leaseMs?: number
  /** Hard-wrap width for model-readable turn files. */
  wrapWidth?: number
}

export type ResolvedConfig = Required<MindConfig>

export const DEFAULT_CONFIG: ResolvedConfig = {
  mindRoot: '',
  captureEnabled: true,
  injectEnabled: true,
  uiEnabled: true,
  workerIntervalMs: 2000,
  maxAttempts: 5,
  leaseMs: 60_000,
  wrapWidth: 800,
}

export function resolveMindRoot(config: MindConfig = {}): string {
  if (config.mindRoot !== undefined && config.mindRoot !== '') {
    return path.resolve(config.mindRoot)
  }
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'mind')
}

export function resolveConfig(config: MindConfig = {}): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    mindRoot: resolveMindRoot(config),
  }
}
