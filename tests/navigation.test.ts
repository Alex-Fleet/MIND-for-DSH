import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { isoWeek, rebuildDayIndex, rebuildMonthIndex, rebuildWeekIndex } from '../src/views/navigation.js'

const cleanup: string[] = []

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-nav-'))
  cleanup.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  return { dir, store }
}

function addTurn(store: Store, seq: number, date: string, title: string) {
  const turnId = `s1:${seq}`
  store.insertTurnAndJob(
    {
      turnId,
      workspaceId: 'ws1',
      sessionId: 's1',
      turnSeq: seq,
      origin: 'main',
      endReason: 'completed',
      occurredAt: `${date}T01:00:0${seq}.000Z`,
      localDate: date,
      rootId: 'default',
      rawRelPath: `projects/ws1/turns/${date}/s1--turn-${seq}.md`,
    },
    [],
  )
  store.upsertTurnIndex({
    turnId,
    title,
    conclusion: `${title} 的结论`,
    topics: ['t'],
    sourceRelPath: `projects/ws1/turns/${date}/s1--turn-${seq}.md`,
    rootId: 'default',
    occurredAt: `${date}T01:00:0${seq}.000Z`,
  })
}

describe('navigation views', () => {
  it('rebuilds a day view with every turn pointer', () => {
    const { dir, store } = setup()
    addTurn(store, 1, '2026-10-19', '第一件事')
    addTurn(store, 2, '2026-10-19', '第二件事')

    const view = rebuildDayIndex(store, dir, 'ws1', '2026-10-19', 'default')

    expect(view.turnCount).toBe(2)
    expect(view.sourceTurnIds).toEqual(['s1:1', 's1:2'])
    expect(view.title).toBe('第一件事')
    const report = fs.readFileSync(path.join(dir, view.reportRelPath), 'utf8')
    expect(report).toContain('第一件事')
    expect(report).toContain('第二件事')
    expect(report).toContain('projects/ws1/turns/2026-10-19/s1--turn-1.md')
    store.close()
  })

  it('rebuilds week and month views from day indexes', () => {
    const { dir, store } = setup()
    addTurn(store, 1, '2026-10-19', 'A')
    addTurn(store, 2, '2026-10-20', 'B')
    rebuildDayIndex(store, dir, 'ws1', '2026-10-19', 'default')
    rebuildDayIndex(store, dir, 'ws1', '2026-10-20', 'default')

    const week = rebuildWeekIndex(store, dir, 'ws1', '2026-10-19', 'default')
    const month = rebuildMonthIndex(store, dir, 'ws1', '2026-10', 'default')

    expect(week.sourceTurnIds.sort()).toEqual(['s1:1', 's1:2'])
    expect(month.sourceTurnIds.sort()).toEqual(['s1:1', 's1:2'])
    expect(fs.existsSync(path.join(dir, week.reportRelPath))).toBe(true)
    expect(fs.existsSync(path.join(dir, month.reportRelPath))).toBe(true)
    store.close()
  })

  it('preserves a curated legacy day report when rebuilding', () => {
    const { dir, store } = setup()
    addTurn(store, 1, '2026-10-19', '新 turn')
    const rel = 'projects/ws1/days/2026-10-19.md'
    const file = path.join(dir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '# 2026-10-19 · 迁移原文\n\nCURATED-DAY', 'utf8')
    store.upsertDayIndex({
      workspaceId: 'ws1',
      localDate: '2026-10-19',
      title: '迁移原文',
      turnCount: 1,
      reportRelPath: rel,
      rootId: 'legacy',
      sourceTurnIds: ['s1:1'],
    })

    const view = rebuildDayIndex(store, dir, 'ws1', '2026-10-19', 'legacy')
    expect(view.reportRelPath).toBe(rel)
    expect(fs.readFileSync(path.join(dir, rel), 'utf8')).toContain('CURATED-DAY')
    expect(store.getDayIndex('ws1', '2026-10-19')?.root_id).toBe('legacy')
    store.close()
  })

  it('preserves a curated legacy month report when rebuilding', () => {
    const { dir, store } = setup()
    addTurn(store, 1, '2026-10-19', 'A')
    rebuildDayIndex(store, dir, 'ws1', '2026-10-19', 'default')
    const rel = 'projects/ws1/months/2026-10.md'
    const file = path.join(dir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '# 2026-10 · 迁移原文\n\nCURATED-MONTH', 'utf8')
    store.upsertPeriodIndex({
      workspaceId: 'ws1',
      kind: 'month',
      period: '2026-10',
      title: '迁移原文',
      reportRelPath: rel,
      rootId: 'legacy',
      sourceDayPaths: ['projects/ws1/days/2026-10-19.md'],
      sourceTurnIds: ['s1:1'],
    })
    // upsertPeriodIndex creates live rows; mark this one as migrated.
    ;(store as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db
      .prepare("UPDATE period_index SET legacy_synthesized = 1 WHERE workspace_id = 'ws1' AND kind = 'month' AND period = '2026-10'")
      .run()

    const view = rebuildMonthIndex(store, dir, 'ws1', '2026-10', 'legacy')
    expect(view.reportRelPath).toBe(rel)
    expect(fs.readFileSync(path.join(dir, rel), 'utf8')).toContain('CURATED-MONTH')
    store.close()
  })

  it('computes ISO week keys', () => {
    expect(isoWeek('2026-10-19')).toMatchObject({ key: '2026-W43', start: '2026-10-19', end: '2026-10-25' })
  })
})
