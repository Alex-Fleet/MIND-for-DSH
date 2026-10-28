import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { buildSnapshot } from '../src/inject/snapshot.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function setup(): { dir: string; store: Store } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-snapshot-full-'))
  dirs.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo Project' })
  return { dir, store }
}

function writeReport(dir: string, relPath: string, content: string): void {
  const file = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

describe('snapshot content', () => {
  it('injects every project rule in full', () => {
    const { dir, store } = setup()
    for (let index = 0; index < 61; index++) {
      store.upsertCognitionEntry({
        id: `rule-${index}`,
        workspaceId: 'ws1',
        layer: 'rule',
        title: `rule ${index}`,
        conclusion: `conclusion ${index} ` + 'r'.repeat(400),
        sourceRelPath: null,
        rootId: 'default',
      })
    }

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })

    expect(snapshot).toContain('rule 0')
    expect(snapshot).toContain('rule 60')
    expect(snapshot).not.toContain('未注入')
    expect(snapshot.length).toBeGreaterThan(61 * 400)
    store.close()
  })

  it('injects the full text of the 21-day window ending 7 days before today', () => {
    const { dir, store } = setup()
    for (let index = 0; index < 30; index++) {
      const date = new Date(Date.UTC(2026, 9, 18))
      date.setUTCDate(date.getUTCDate() - index)
      const localDate = date.toISOString().slice(0, 10)
      const rel = `projects/ws1/days/${localDate}.md`
      writeReport(dir, rel, `DAILY ${localDate}\n` + 'd'.repeat(1000))
      store.upsertDayIndex({
        workspaceId: 'ws1',
        localDate,
        title: `daily ${localDate}`,
        turnCount: 1,
        reportRelPath: rel,
        rootId: 'default',
        sourceTurnIds: [],
      })
    }

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })

    // [2026-09-21, 2026-10-12): 21 days, excluding the most recent 7 days.
    expect(snapshot).toContain('DAILY 2026-09-21')
    expect(snapshot).toContain('DAILY 2026-10-11')
    expect(snapshot).not.toContain('DAILY 2026-10-12')
    expect(snapshot).not.toContain('DAILY 2026-10-18')
    expect(snapshot).not.toContain('已截断')
    store.close()
  })

  it('injects every monthly report in full', () => {
    const { dir, store } = setup()
    for (const month of ['2026-09', '2026-08']) {
      const rel = `projects/ws1/months/${month}.md`
      writeReport(dir, rel, `MONTHLY ${month}\n` + 'm'.repeat(500))
      store.upsertPeriodIndex({
        workspaceId: 'ws1',
        kind: 'month',
        period: month,
        title: `monthly ${month}`,
        reportRelPath: rel,
        rootId: 'default',
        sourceDayPaths: [],
        sourceTurnIds: [],
      })
    }

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })

    expect(snapshot).toContain('MONTHLY 2026-09')
    expect(snapshot).toContain('MONTHLY 2026-08')
    store.close()
  })

  it('injects every turn summary from the last seven days', () => {
    const { dir, store } = setup()
    store.upsertTurnIndex({
      turnId: 'recent',
      title: 'recent turn',
      conclusion: 'recent conclusion',
      topics: [],
      sourceRelPath: 'projects/ws1/turns/2026-10-18/recent.md',
      rootId: 'default',
      occurredAt: '2026-10-18T10:00:00.000Z',
    })
    store.upsertTurnIndex({
      turnId: 'old',
      title: 'old turn',
      conclusion: 'old conclusion',
      topics: [],
      sourceRelPath: 'projects/ws1/turns/2026-10-01/old.md',
      rootId: 'default',
      occurredAt: '2026-10-01T10:00:00.000Z',
    })
    store.upsertTurnIndex({
      turnId: 'noise',
      title: 'noise turn',
      conclusion: 'noise conclusion',
      topics: [],
      sourceRelPath: 'projects/ws1/turns/2026-10-18/noise.md',
      rootId: 'default',
      occurredAt: '2026-10-18T11:00:00.000Z',
    })
    ;(store as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db
      .prepare("UPDATE turn_index SET status = 'invalid' WHERE turn_id = 'noise'")
      .run()

    const before = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })
    expect(before).toContain('recent turn')
    expect(before).toContain('recent conclusion')
    expect(before).not.toContain('old turn')
    expect(before).not.toContain('noise turn')

    // Today's turn belongs to the per-turn increment, not the snapshot.
    store.upsertTurnIndex({
      turnId: 'today',
      title: 'today turn',
      conclusion: 'today conclusion',
      topics: [],
      sourceRelPath: 'projects/ws1/turns/2026-10-19/today.md',
      rootId: 'default',
      occurredAt: '2026-10-19T10:00:00.000Z',
    })
    const after = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })
    expect(after).not.toContain('today turn')
    expect(after).toBe(before)
    store.close()
  })

  it('budgets full turn summaries and groups overflow by day', () => {
    const { dir, store } = setup()
    const add = (turnId: string, day: string, hour: number) => {
      store.upsertTurnIndex({
        turnId,
        title: `turn ${turnId}`,
        conclusion: 'x'.repeat(200),
        topics: [],
        sourceRelPath: `projects/ws1/turns/${day}/${turnId}.md`,
        rootId: 'default',
        occurredAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
      })
    }
    add('a', '2026-10-18', 10)
    add('b', '2026-10-18', 11)
    add('c', '2026-10-18', 12)
    add('d', '2026-10-17', 10)
    add('e', '2026-10-17', 11)
    add('f', '2026-10-17', 12)

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
      turnBudgetChars: 700,
    })

    expect(snapshot).toContain('[未注入 turns — 按天聚合（较早）]')
    expect(snapshot).toContain('共 4 条 turns 未注入')
    expect(snapshot).toContain('2026-10-18 · 1 turns 未注入')
    expect(snapshot).toContain('2026-10-17 · 3 turns 未注入')
    store.close()
  })

  it('does not read report files outside the mind root', () => {
    const { dir, store } = setup()
    const secret = `outside-${path.basename(dir)}.md`
    const secretPath = path.join(path.dirname(dir), secret)
    fs.writeFileSync(secretPath, 'SECRET-OUTSIDE', 'utf8')
    try {
      store.upsertDayIndex({
        workspaceId: 'ws1',
        localDate: '2026-10-18',
        title: 'escape',
        turnCount: 1,
        reportRelPath: `../${secret}`,
        rootId: 'default',
        sourceTurnIds: [],
      })

      const snapshot = buildSnapshot({
        store,
        workspaceId: 'ws1',
        rootPath: dir,
        localDate: '2026-10-19',
        dayBoundaryMinutes: 240,
      })
      expect(snapshot).not.toContain('SECRET-OUTSIDE')
    } finally {
      fs.rmSync(secretPath, { force: true })
    }
    store.close()
  })
})
