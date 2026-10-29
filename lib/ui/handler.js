import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../security/redact.js';
import { readTurnPreview } from '../turns/preview.js';
import { readTurnChunk } from '../turns/read.js';
export const UI_ENDPOINTS = [
    'timeline',
    'day',
    'turn',
    'current',
    'workspaces',
    'reports',
    'report',
    'proposals',
    'resolveProposal',
    'settings',
    'updateSettings',
    'saveEntry',
];
class UiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'UiError';
    }
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LAYERS = ['rule'];
const MAX_BODY_CHARS = 100_000;
const MAX_PAGE = 500;
const HANDLERS = {
    timeline: readTimeline,
    day: readDay,
    turn: readTurn,
    current: readCurrent,
    workspaces: readWorkspaces,
    reports: readReports,
    report: readReport,
    proposals: readProposals,
    resolveProposal,
    settings: readSettings,
    updateSettings,
    saveEntry,
};
/** Dispatch one UI request without touching HTTP framing. */
export async function handleUiRequest(deps, endpoint, payload) {
    const handler = Object.hasOwn(HANDLERS, endpoint) ? HANDLERS[endpoint] : undefined;
    if (handler === undefined) {
        return { ok: false, error: { code: 'not-found', message: `unknown endpoint: ${endpoint}` } };
    }
    try {
        const body = optionalObject(payload);
        return { ok: true, value: await handler(deps, body) };
    }
    catch (error) {
        if (error instanceof UiError) {
            return { ok: false, error: { code: error.code, message: error.message } };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: { code: 'internal', message } };
    }
}
// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------
function readTimeline(deps, payload) {
    deps.refreshWorkspaceNames?.();
    const limit = boundedInt(payload.limit, 50, 1, MAX_PAGE);
    const before = optionalObject(payload.before);
    let beforeDate = null;
    let beforeWorkspaceId = null;
    if (before !== undefined && before !== null && Object.keys(before).length > 0) {
        beforeDate = requiredDate(before.date, 'before.date');
        beforeWorkspaceId = requiredString(before.workspaceId, 'before.workspaceId', 200);
    }
    const workspaceFilter = optionalNullableString(payload.workspaceId, 'workspaceId', 200);
    const rows = deps.store.listDayPage(beforeDate, beforeWorkspaceId, limit + 1, workspaceFilter);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
        rows: page.map(row => ({
            date: String(row.local_date ?? ''),
            workspaceId: String(row.workspace_id ?? ''),
            workspaceName: String(row.display_name ?? row.workspace_id ?? ''),
            title: String(row.title ?? ''),
            turnCount: Number(row.turn_count ?? 0),
            reportPath: row.report_rel_path === null || row.report_rel_path === undefined ? null : String(row.report_rel_path),
        })),
        next: rows.length > limit && last !== undefined
            ? { date: String(last.local_date ?? ''), workspaceId: String(last.workspace_id ?? '') }
            : null,
    };
}
function readDay(deps, payload) {
    const workspaceId = requiredString(payload.workspaceId, 'workspaceId', 200);
    const date = requiredDate(payload.date, 'date');
    const limit = boundedInt(payload.limit, 300, 1, MAX_PAGE);
    const rows = deps.store.listTurnsForDay(workspaceId, date, limit + 1);
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
    };
}
function readReports(deps, payload) {
    deps.refreshWorkspaceNames?.();
    const workspaceId = requiredString(payload.workspaceId, 'workspaceId', 200);
    const kind = requiredOneOf(payload.kind ?? 'month', ['week', 'month'], 'kind');
    const limit = boundedInt(payload.limit, 200, 1, MAX_PAGE);
    const rows = deps.store.listPeriods(workspaceId, kind, limit + 1);
    return {
        workspaceId,
        kind,
        truncated: rows.length > limit,
        rows: rows.slice(0, limit).map(row => ({
            workspaceId: String(row.workspace_id ?? ''),
            kind: String(row.kind ?? kind),
            period: String(row.period ?? ''),
            title: String(row.title ?? ''),
            reportPath: String(row.report_rel_path ?? ''),
        })),
    };
}
function readReport(deps, payload) {
    const relative = requiredString(payload.path, 'path', 500);
    const root = path.resolve(deps.config.mindRoot);
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
        throw new UiError('bad-request', 'report path escapes the MIND root');
    }
    try {
        const content = fs.readFileSync(target, 'utf8');
        return { path: relative, content: redactSecrets(content) };
    }
    catch {
        throw new UiError('not-found', `report not found: ${relative}`);
    }
}
function readTurn(deps, payload) {
    const turnId = requiredString(payload.turnId, 'turnId', 500);
    const offset = boundedInt(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const max = boundedInt(payload.max, 20_000, 1, 100_000);
    try {
        return readTurnChunk(deps.store, deps.config.mindRoot, turnId, offset, max);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new UiError(message.startsWith('turn not found') || message.includes('unavailable') ? 'not-found' : 'internal', message);
    }
}
function readCurrent(deps, payload) {
    deps.refreshWorkspaceNames?.();
    const limit = boundedInt(payload.limit, 300, 1, MAX_PAGE);
    const workspaceFilter = optionalNullableString(payload.workspaceId, 'workspaceId', 200);
    const rows = deps.store.listAllCognitionEntries(limit + 1, workspaceFilter);
    return {
        rows: rows.slice(0, limit).map(row => ({
            id: String(row.id ?? ''),
            workspaceId: row.workspace_id === null || row.workspace_id === undefined ? null : String(row.workspace_id),
            workspaceName: row.display_name === null || row.display_name === undefined
                ? row.workspace_id === null || row.workspace_id === undefined
                    ? '全局'
                    : String(row.workspace_id)
                : String(row.display_name),
            layer: String(row.layer ?? 'rule'),
            title: String(row.title ?? ''),
            content: String(row.conclusion ?? ''),
            enabled: Number(row.enabled ?? 1) === 1,
            version: Number(row.version ?? 1),
            updatedAt: String(row.updated_at ?? ''),
            sourcePath: row.source_rel_path === null || row.source_rel_path === undefined ? null : String(row.source_rel_path),
        })),
        truncated: rows.length > limit,
    };
}
function readWorkspaces(deps, payload) {
    deps.refreshWorkspaceNames?.();
    const limit = boundedInt(payload.limit, 200, 1, MAX_PAGE);
    const workspaces = deps.store.listWorkspaces(limit + 1);
    const locations = deps.store.listAllLocations(2_001);
    return {
        truncated: workspaces.length > limit || locations.length > 2_000,
        rows: workspaces.slice(0, limit).map(workspace => {
            const workspaceId = String(workspace.workspace_id ?? '');
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
            };
        }),
    };
}
function readProposals(deps, payload) {
    deps.refreshWorkspaceNames?.();
    const status = optionalOneOf(payload.status, ['pending', 'approved', 'rejected', 'all'], 'status') ?? 'pending';
    const limit = boundedInt(payload.limit, 200, 1, MAX_PAGE);
    const rows = deps.store.listProposalsPage(status === 'all' ? null : status, limit + 1);
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
    };
}
function resolveProposal(deps, payload) {
    const id = requiredString(payload.id, 'id', 200);
    const action = requiredOneOf(payload.action, ['approve', 'reject'], 'action');
    const reason = optionalNullableString(payload.reason, 'reason', 500) ?? null;
    const workspaceId = optionalNullableString(payload.workspaceId, 'workspaceId', 200);
    const proposal = deps.store.getProposal(id);
    if (proposal === undefined)
        throw new UiError('not-found', `proposal not found: ${id}`);
    if (action === 'approve' &&
        (proposal.workspace_id === null ||
            proposal.workspace_id === undefined ||
            proposal.workspace_id === '') &&
        (workspaceId === null || workspaceId === undefined || workspaceId === '')) {
        throw new UiError('bad-request', '该提案没有关联项目，请先选择一个项目');
    }
    try {
        return deps.store.resolveProposal({
            id,
            action,
            reviewer: 'ui',
            reason,
            ...(workspaceId === undefined ? {} : { workspaceId }),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.startsWith('proposal not found')
            ? 'not-found'
            : message.startsWith('proposal already reviewed')
                ? 'conflict'
                : 'internal';
        throw new UiError(code, message);
    }
}
function readSettings(deps, _payload) {
    const { config, store } = deps;
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
    };
}
function updateSettings(deps, payload) {
    const captureEnabled = optionalBoolean(payload.captureEnabled, 'captureEnabled');
    const injectEnabled = optionalBoolean(payload.injectEnabled, 'injectEnabled');
    if (captureEnabled === undefined && injectEnabled === undefined) {
        throw new UiError('bad-request', 'captureEnabled or injectEnabled is required');
    }
    if (captureEnabled !== undefined)
        deps.config.captureEnabled = captureEnabled;
    if (injectEnabled !== undefined)
        deps.config.injectEnabled = injectEnabled;
    deps.saveSettings({
        captureEnabled: deps.config.captureEnabled,
        injectEnabled: deps.config.injectEnabled,
    });
    return readSettings(deps, {});
}
// ---------------------------------------------------------------------------
// Entry editing (B+ structured form)
// ---------------------------------------------------------------------------
function saveEntry(deps, payload) {
    const id = optionalString(payload.id, 'id', 200);
    if (id !== undefined) {
        const existing = deps.store.getCognitionEntry(id);
        if (existing === undefined)
            throw new UiError('not-found', `entry not found: ${id}`);
        // Omitted fields keep the stored value: a partial update must never
        // silently clear content, re-enable, or move an entry to global.
        const layer = optionalOneOf(payload.layer, LAYERS, 'layer') ?? layerOf(existing.layer);
        const title = (optionalString(payload.title, 'title', 200) ?? String(existing.title ?? '')).trim();
        if (title === '')
            throw new UiError('bad-request', 'title must not be empty');
        const content = optionalString(payload.content, 'content', MAX_BODY_CHARS) ?? String(existing.conclusion ?? '');
        const enabled = optionalBoolean(payload.enabled, 'enabled') ?? Number(existing.enabled ?? 1) === 1;
        const workspaceId = Object.hasOwn(payload, 'workspaceId')
            ? optionalNullableString(payload.workspaceId, 'workspaceId', 200) ?? null
            : typeof existing.workspace_id === 'string'
                ? existing.workspace_id
                : null;
        if (workspaceId === null) {
            throw new UiError('bad-request', '规则必须属于一个项目');
        }
        const updated = deps.store.updateCognitionEntry({ id, workspaceId, layer, title, conclusion: content, enabled });
        if (!updated)
            throw new UiError('conflict', `entry is not editable: ${id}`);
        return { id, version: Number(deps.store.getCognitionEntry(id)?.version ?? 1) };
    }
    const layer = requiredOneOf(payload.layer, LAYERS, 'layer');
    const title = requiredString(payload.title, 'title', 200).trim();
    if (title === '')
        throw new UiError('bad-request', 'title must not be empty');
    const content = optionalString(payload.content, 'content', MAX_BODY_CHARS) ?? '';
    const workspaceId = optionalNullableString(payload.workspaceId, 'workspaceId', 200) ?? null;
    if (workspaceId === null) {
        throw new UiError('bad-request', '规则必须属于一个项目');
    }
    const enabled = optionalBoolean(payload.enabled, 'enabled') ?? true;
    const createdId = `cog-${crypto.randomUUID()}`;
    deps.store.createCognitionEntry({
        id: createdId,
        workspaceId,
        layer,
        title,
        conclusion: content,
        enabled,
        rootId: 'default',
    });
    return { id: createdId, version: 1 };
}
function layerOf(value) {
    return LAYERS.includes(value) ? value : 'rule';
}
// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------
function optionalObject(value) {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new UiError('bad-request', 'payload must be a JSON object');
    }
    return value;
}
function requiredString(value, name, max) {
    if (typeof value !== 'string' || value === '')
        throw new UiError('bad-request', `${name} must be a non-empty string`);
    if (value.length > max)
        throw new UiError('bad-request', `${name} exceeds ${max} characters`);
    return value;
}
function optionalString(value, name, max) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string')
        throw new UiError('bad-request', `${name} must be a string`);
    if (value.length > max)
        throw new UiError('bad-request', `${name} exceeds ${max} characters`);
    return value;
}
function optionalNullableString(value, name, max) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    return requiredString(value, name, max);
}
function requiredDate(value, name) {
    const text = requiredString(value, name, 10);
    if (!DATE_RE.test(text))
        throw new UiError('bad-request', `${name} must be YYYY-MM-DD`);
    const [yearText, monthText, dayText] = text.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day) {
        throw new UiError('bad-request', `${name} is not a real calendar date`);
    }
    return text;
}
function boundedInt(value, fallback, min, max) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new UiError('bad-request', 'expected a number');
    const rounded = Math.floor(value);
    if (rounded < min || rounded > max)
        throw new UiError('bad-request', `value must be between ${min} and ${max}`);
    return rounded;
}
function optionalBoolean(value, name) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'boolean')
        throw new UiError('bad-request', `${name} must be a boolean`);
    return value;
}
function requiredOneOf(value, allowed, name) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        throw new UiError('bad-request', `${name} must be one of: ${allowed.join(', ')}`);
    }
    return value;
}
function optionalOneOf(value, allowed, name) {
    if (value === undefined || value === null)
        return undefined;
    return requiredOneOf(value, allowed, name);
}
