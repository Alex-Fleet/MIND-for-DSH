export interface MindConfig {
    /** Absolute root for MIND data. Defaults to $DSH_HOME/mind. */
    mindRoot?: string;
    captureEnabled?: boolean;
    injectEnabled?: boolean;
    uiEnabled?: boolean;
    /** How often the capture worker drains pending jobs. */
    workerIntervalMs?: number;
    /** Fast retries before the steady 30-minute summary retry cadence. */
    maxAttempts?: number;
    /** Lease duration for a claimed job. */
    leaseMs?: number;
    /** Hard-wrap width for model-readable turn files. */
    wrapWidth?: number;
    /** Directory containing behavior-standards.md, programming-standards.md, checklists-index.md, exps-index.md, user-profile.md. */
    standardsDir?: string;
    /** Local day boundary in minutes after midnight (default 240 = 04:00). */
    dayBoundaryMinutes?: number;
    /** Character budget for full turn summaries in the 7-day injection window. */
    turnSummaryChars?: number;
    /**
     * Generate LLM turn summaries. This is the index layer of the memory model,
     * so it is on by default; `false` is an explicit degradation switch that
     * keeps fallback indexes only.
     */
    summarizeEnabled?: boolean;
    /** Auxiliary summary provider/model; defaults to the turn's request model. */
    summaryProvider?: string;
    summaryModel?: string;
}
export type ResolvedConfig = Required<MindConfig>;
export declare const DEFAULT_CONFIG: ResolvedConfig;
export declare function resolveMindRoot(config?: MindConfig): string;
export declare function resolveConfig(config?: MindConfig): ResolvedConfig;
/** The two toggles the Settings page owns. */
export interface PersistedSettings {
    captureEnabled?: boolean;
    injectEnabled?: boolean;
}
/**
 * Read the UI-owned settings file. This is deliberately separate from the
 * Cordis config: a missing or malformed file means "no overrides", never a
 * load failure.
 */
export declare function loadPersistedSettings(mindRoot: string): PersistedSettings;
/** Atomically persist the UI-owned settings. */
export declare function savePersistedSettings(mindRoot: string, settings: PersistedSettings): void;
