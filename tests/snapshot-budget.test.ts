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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-snapshot-budget-'))
  dirs.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo Project' })
  return { dir, store }
}

describe('snapshot budgets', () => {
  it('always keeps the time axis and closing tag when rules and cognition are huge', () => {
    const { dir, store } = setup()
    for (let index = 0; index < 30; index++) {
      store.upsertCognitionEntry({
        id: `rule-${index}`,
        workspaceId: 'ws1',
        layer: 'rule',
        title: `rule ${index}`,
        conclusion: 'r'.repeat(400),
        sourceRelPath: null,
        rootId: 'default',
      })
    }
    for (let index = 0; index < 40; index++) {
      store.upsertCognitionEntry({
        id: `project-${index}`,
        workspaceId: 'ws1',
        layer: 'project',
        title: `project ${index}`,
        conclusion: 'c'.repeat(400),
        sourceRelPath: null,
        rootId: 'default',
      })
    }
    store.upsertDayIndex({
      workspaceId: 'ws1',
      localDate: '2026-10-18',
      title: 'yesterday',
      turnCount: 3,
      reportRelPath: 'daily/2026-10-18.md',
      rootId: 'default',
      sourceTurnIds: [],
    })

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
      maxChars: 2000,
    })

    expect(snapshot).toContain('[工作区] Demo Project (ws1)')
    expect(snapshot).toContain('日界 04:00')
    expect(snapshot).toContain('[时间轴 · 最近 30 天]')
    expect(snapshot).toContain('2026-10-18')
    expect(snapshot).toContain('</mind_memory>')
    expect(snapshot.length).toBeLessThanOrEqual(2000)
    store.close()
  })

  it('keeps all 30 days when the axis itself fits in the snapshot budget', () => {
    const { dir, store } = setup()
    const dates: string[] = []
    for (let index = 0; index < 30; index++) {
      const date = new Date(Date.UTC(2026, 9, 19))
      date.setUTCDate(date.getUTCDate() - index)
      const localDate = date.toISOString().slice(0, 10)
      dates.push(localDate)
      store.upsertDayIndex({
        workspaceId: 'ws1',
        localDate,
        title: 't'.repeat(80),
        turnCount: 3,
        reportRelPath: `projects/ws1/days/${localDate}-${'x'.repeat(100)}.md`,
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
      maxChars: 12_000,
    })

    for (const date of dates) expect(snapshot).toContain(date)
    expect(snapshot).not.toContain('已截断')
    expect(snapshot.length).toBeLessThanOrEqual(12_000)
    store.close()
  })

  it('never exceeds maxChars when a truncation marker is needed', () => {
    const { dir, store } = setup()
    for (let index = 0; index < 5; index++) {
      const localDate = `2026-10-${String(15 + index).padStart(2, '0')}`
      store.upsertDayIndex({
        workspaceId: 'ws1',
        localDate,
        title: 't'.repeat(80),
        turnCount: 3,
        reportRelPath: `projects/ws1/days/${localDate}-${'x'.repeat(100)}.md`,
        rootId: 'default',
        sourceTurnIds: [],
      })
    }

    for (const maxChars of [305, 450, 550, 1000]) {
      const snapshot = buildSnapshot({
        store,
        workspaceId: 'ws1',
        rootPath: dir,
        localDate: '2026-10-19',
        dayBoundaryMinutes: 240,
        maxChars,
      })
      expect(snapshot.length).toBeLessThanOrEqual(maxChars)
      // Truncation must drop older days first, never the most recent one.
      if (maxChars >= 1000) {
        expect(snapshot).toContain('2026-10-19')
      }
    }
    store.close()
  })
})
