import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export const DEFAULT_CONFIG = {
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
    turnSummaryChars: 100_000,
    summarizeEnabled: true,
    summaryProvider: '',
    summaryModel: '',
};
export function resolveMindRoot(config = {}) {
    if (config.mindRoot !== undefined && config.mindRoot !== '') {
        return path.resolve(config.mindRoot);
    }
    const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
    return path.join(dshHome, 'mind');
}
export function resolveConfig(config = {}) {
    const mindRoot = resolveMindRoot(config);
    return {
        ...DEFAULT_CONFIG,
        ...config,
        mindRoot,
        standardsDir: config.standardsDir !== undefined && config.standardsDir !== ''
            ? path.resolve(config.standardsDir)
            : path.join(mindRoot, 'global', 'standards'),
    };
}
/**
 * Read the UI-owned settings file. This is deliberately separate from the
 * Cordis config: a missing or malformed file means "no overrides", never a
 * load failure.
 */
export function loadPersistedSettings(mindRoot) {
    try {
        const raw = fs.readFileSync(path.join(mindRoot, 'settings.json'), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        const record = parsed;
        const settings = {};
        if (typeof record.captureEnabled === 'boolean')
            settings.captureEnabled = record.captureEnabled;
        if (typeof record.injectEnabled === 'boolean')
            settings.injectEnabled = record.injectEnabled;
        return settings;
    }
    catch {
        return {};
    }
}
/** Atomically persist the UI-owned settings. */
export function savePersistedSettings(mindRoot, settings) {
    fs.mkdirSync(mindRoot, { recursive: true, mode: 0o700 });
    const target = path.join(mindRoot, 'settings.json');
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, target);
    try {
        fs.chmodSync(target, 0o600);
    }
    catch {
        // Filesystems without POSIX modes.
    }
}
