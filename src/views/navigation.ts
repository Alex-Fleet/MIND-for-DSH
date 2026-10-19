import fs from 'node:fs'
import path from 'node:path'
import type { Store } from '../db/store.js'
import { beijingTimeOf } from '../time.js'

export interface DayView {
  reportRelPath: string
  title: string
  turnCount: number
  sourceTurnIds: string[]
}

export interface PeriodView {
  reportRelPath: string
  title: string
  sourceDayPaths: string[]
  sourceTurnIds: string[]
}

/**
 * Rebuild one day's navigation view.
 *
 * The view is deterministic: one row per turn with its index title and a
 * pointer to the readable raw file. An optional LLM summary may be supplied,
 * but the pointer list is always complete.
 */
export function rebuildDayIndex(
  store: Store,
  mindRoot: string,
  workspaceId: string,
  localDate: string,
  rootId: string,
  summary?: string,
): DayView {
  const rows = store.listTurnsForDay(workspaceId, localDate)
  const title = pickTitle(rows, localDate)
  const reportRelPath = path.posix.join('projects', workspaceId, 'days', `${localDate}.md`)

  const lines: string[] = [`# ${localDate} · ${title}`, '', `- 条目数: ${rows.length}`]
  if (summary !== undefined && summary.trim() !== '') {
    lines.push('', '## 摘要', '', summary.trim())
  }
  lines.push('', '## 条目')
  for (const row of rows) {
    const time = beijingTimeOf(String(row.occurred_at ?? ''))
    const rowTitle = String(row.title ?? '(未摘要)')
    const conclusion = String(row.conclusion ?? '')
    const rawPath = String(row.raw_rel_path ?? '')
    const parts = [`[${time}] ${rowTitle}`]
    if (conclusion !== '') parts.push(conclusion)
    if (rawPath !== '') parts.push(rawPath)
    lines.push(`- ${parts.join(' · ')}`)
  }

  writeAtomic(path.join(mindRoot, reportRelPath), lines.join('\n'))
  const sourceTurnIds = rows.map(row => String(row.turn_id))
  store.upsertDayIndex({
    workspaceId,
    localDate,
    title,
    turnCount: rows.length,
    reportRelPath,
    rootId,
    sourceTurnIds,
  })

  return { reportRelPath, title, turnCount: rows.length, sourceTurnIds }
}

export function rebuildMonthIndex(
  store: Store,
  mindRoot: string,
  workspaceId: string,
  month: string,
  rootId: string,
): PeriodView {
  const days = store.listDaysInMonth(workspaceId, month)
  return rebuildPeriod(store, mindRoot, workspaceId, 'month', month, rootId, days)
}

export function rebuildWeekIndex(
  store: Store,
  mindRoot: string,
  workspaceId: string,
  localDate: string,
  rootId: string,
): PeriodView {
  const week = isoWeek(localDate)
  const days = store.listDaysInRange(workspaceId, week.start, week.end)
  return rebuildPeriod(store, mindRoot, workspaceId, 'week', week.key, rootId, days)
}

function rebuildPeriod(
  store: Store,
  mindRoot: string,
  workspaceId: string,
  kind: 'week' | 'month',
  period: string,
  rootId: string,
  days: Array<Record<string, unknown>>,
): PeriodView {
  const reportRelPath = path.posix.join(
    'projects',
    workspaceId,
    kind === 'week' ? 'weeks' : 'months',
    `${period}.md`,
  )
  const title = days.length > 0 ? String(days[0]?.title ?? period) : period
  const lines: string[] = [`# ${period} · ${kind === 'week' ? '周报' : '月报'}`, '', `- 有记录天数: ${days.length}`, '', '## 每日']

  const sourceDayPaths: string[] = []
  const sourceTurnIds: string[] = []
  for (const day of days) {
    const date = String(day.local_date ?? '')
    const dayTitle = String(day.title ?? '')
    const count = Number(day.turn_count ?? 0)
    const report = String(day.report_rel_path ?? '')
    if (report !== '') sourceDayPaths.push(report)
    sourceTurnIds.push(...jsonArray(day.source_turn_ids_json))
    lines.push(`- ${date} · ${dayTitle} · ${count} turns${report === '' ? '' : ` · ${report}`}`)
  }

  writeAtomic(path.join(mindRoot, reportRelPath), lines.join('\n'))
  store.upsertPeriodIndex({
    workspaceId,
    kind,
    period,
    title,
    reportRelPath,
    rootId,
    sourceDayPaths,
    sourceTurnIds,
  })

  return { reportRelPath, title, sourceDayPaths, sourceTurnIds }
}

function pickTitle(rows: Array<Record<string, unknown>>, fallback: string): string {
  for (const row of rows) {
    const title = row.title
    if (typeof title === 'string' && title.trim() !== '') return title.trim()
  }
  return fallback
}

function jsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** ISO-8601 week key plus its Monday..Sunday range (UTC dates). */
export function isoWeek(localDate: string): { key: string; start: string; end: string } {
  const date = new Date(`${localDate}T00:00:00Z`)
  const weekday = date.getUTCDay() || 7
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - weekday + 1)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  const year = thursday.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return {
    key: `${year}-W${String(week).padStart(2, '0')}`,
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function writeAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, content, 'utf8')
  fs.renameSync(temp, target)
}
