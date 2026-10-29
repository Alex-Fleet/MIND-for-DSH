import fs from 'node:fs';
import path from 'node:path';
import { beijingTimeOf } from '../time.js';
/**
 * Rebuild one day's navigation view.
 *
 * The view is deterministic: one row per turn with its index title and a
 * pointer to the readable raw file. An optional LLM summary may be supplied,
 * but the pointer list is always complete.
 */
export function rebuildDayIndex(store, mindRoot, workspaceId, localDate, rootId, summary) {
    const rows = store.listTurnsForDay(workspaceId, localDate);
    const title = pickTitle(rows, localDate);
    const reportRelPath = path.posix.join('projects', workspaceId, 'days', `${localDate}.md`);
    // Migrated reports are curated source material. Never replace their text
    // with a deterministic turn list just because a summary landed later.
    const existing = store.getDayIndex(workspaceId, localDate);
    const existingRel = String(existing?.report_rel_path ?? '');
    if (existing !== undefined &&
        String(existing.root_id ?? '') === 'legacy' &&
        existingRel !== '' &&
        fs.existsSync(path.join(mindRoot, existingRel))) {
        const sourceTurnIds = rows.map(row => String(row.turn_id));
        const keptTitle = String(existing.title ?? title);
        store.upsertDayIndex({
            workspaceId,
            localDate,
            title: keptTitle,
            turnCount: rows.length,
            reportRelPath: existingRel,
            rootId: 'legacy',
            sourceTurnIds,
        });
        return { reportRelPath: existingRel, title: keptTitle, turnCount: rows.length, sourceTurnIds };
    }
    const lines = [`# ${localDate} · ${title}`, '', `- 条目数: ${rows.length}`];
    if (summary !== undefined && summary.trim() !== '') {
        lines.push('', '## 摘要', '', summary.trim());
    }
    lines.push('', '## 条目');
    for (const row of rows) {
        const time = beijingTimeOf(String(row.occurred_at ?? ''));
        const rowTitle = String(row.title ?? '(未摘要)');
        const conclusion = String(row.conclusion ?? '');
        const rawPath = String(row.raw_rel_path ?? '');
        const parts = [`[${time}] ${rowTitle}`];
        if (conclusion !== '')
            parts.push(conclusion);
        if (rawPath !== '')
            parts.push(rawPath);
        lines.push(`- ${parts.join(' · ')}`);
    }
    writeAtomic(path.join(mindRoot, reportRelPath), lines.join('\n'));
    const sourceTurnIds = rows.map(row => String(row.turn_id));
    store.upsertDayIndex({
        workspaceId,
        localDate,
        title,
        turnCount: rows.length,
        reportRelPath,
        rootId,
        sourceTurnIds,
    });
    return { reportRelPath, title, turnCount: rows.length, sourceTurnIds };
}
export function rebuildMonthIndex(store, mindRoot, workspaceId, month, rootId) {
    const days = store.listDaysInMonth(workspaceId, month);
    return rebuildPeriod(store, mindRoot, workspaceId, 'month', month, rootId, days);
}
export function rebuildWeekIndex(store, mindRoot, workspaceId, localDate, rootId) {
    const week = isoWeek(localDate);
    const days = store.listDaysInRange(workspaceId, week.start, week.end);
    return rebuildPeriod(store, mindRoot, workspaceId, 'week', week.key, rootId, days);
}
function rebuildPeriod(store, mindRoot, workspaceId, kind, period, rootId, days) {
    const reportRelPath = path.posix.join('projects', workspaceId, kind === 'week' ? 'weeks' : 'months', `${period}.md`);
    const title = days.length > 0 ? String(days[0]?.title ?? period) : period;
    // Same rule for migrated month/week reports: preserve curated text.
    const existing = store.getPeriodIndex(workspaceId, kind, period);
    const existingRel = String(existing?.report_rel_path ?? '');
    if (existing !== undefined &&
        Number(existing.legacy_synthesized ?? 0) === 1 &&
        existingRel !== '' &&
        fs.existsSync(path.join(mindRoot, existingRel))) {
        return {
            reportRelPath: existingRel,
            title: String(existing.title ?? title),
            sourceDayPaths: jsonArray(existing.source_day_rel_paths_json),
            sourceTurnIds: jsonArray(existing.source_turn_ids_json),
        };
    }
    const lines = [`# ${period} · ${kind === 'week' ? '周报' : '月报'}`, '', `- 有记录天数: ${days.length}`, '', '## 每日'];
    const sourceDayPaths = [];
    const sourceTurnIds = [];
    for (const day of days) {
        const date = String(day.local_date ?? '');
        const dayTitle = String(day.title ?? '');
        const count = Number(day.turn_count ?? 0);
        const report = String(day.report_rel_path ?? '');
        if (report !== '')
            sourceDayPaths.push(report);
        sourceTurnIds.push(...jsonArray(day.source_turn_ids_json));
        lines.push(`- ${date} · ${dayTitle} · ${count} turns${report === '' ? '' : ` · ${report}`}`);
    }
    writeAtomic(path.join(mindRoot, reportRelPath), lines.join('\n'));
    store.upsertPeriodIndex({
        workspaceId,
        kind,
        period,
        title,
        reportRelPath,
        rootId,
        sourceDayPaths,
        sourceTurnIds,
    });
    return { reportRelPath, title, sourceDayPaths, sourceTurnIds };
}
function pickTitle(rows, fallback) {
    for (const row of rows) {
        const title = row.title;
        if (typeof title === 'string' && title.trim() !== '')
            return title.trim();
    }
    return fallback;
}
function jsonArray(value) {
    if (typeof value !== 'string' || value === '')
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    catch {
        return [];
    }
}
/** ISO-8601 week key plus its Monday..Sunday range (UTC dates). */
export function isoWeek(localDate) {
    const date = new Date(`${localDate}T00:00:00Z`);
    const weekday = date.getUTCDay() || 7;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - weekday + 1);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const thursday = new Date(monday);
    thursday.setUTCDate(monday.getUTCDate() + 3);
    const year = thursday.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
    return {
        key: `${year}-W${String(week).padStart(2, '0')}`,
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
    };
}
function writeAtomic(target, content) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, target);
}
