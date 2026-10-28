import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config.js'
import { Store } from '../src/db/store.js'
import { buildSnapshot } from '../src/inject/snapshot.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function setup(): { dir: string; store: Store } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-snapshot-order-'))
  dirs.push(dir)
  const store = new Store(path.join(dir, 'mind.db'))
  store.ensureRoot('default', dir)
  store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo Project' })
  return { dir, store }
}

function writeReport(dir: string, relPath: string, content: string): void {
  const file = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

/** Seed one row in every snapshot section so the ordering can be asserted. */
function seedAllSections(dir: string, store: Store): void {
  store.upsertCognitionEntry({
    id: 'rule-1',
    workspaceId: 'ws1',
    layer: 'rule',
    title: 'always run the checklist',
    conclusion: 'before claiming done',
    sourceRelPath: null,
    rootId: 'default',
  })

  writeReport(dir, 'projects/ws1/months/2026-09.md', '# 2026-09 monthly body')
  store.upsertPeriodIndex({
    workspaceId: 'ws1',
    kind: 'month',
    period: '2026-09',
    title: 'September',
    reportRelPath: 'projects/ws1/months/2026-09.md',
    rootId: 'default',
    sourceDayPaths: [],
    sourceTurnIds: [],
  })

  writeReport(dir, 'projects/ws1/days/2026-10-10.md', '# 2026-10-10 daily body')
  store.upsertDayIndex({
    workspaceId: 'ws1',
    localDate: '2026-10-10',
    title: 'tenth',
    turnCount: 1,
    reportRelPath: 'projects/ws1/days/2026-10-10.md',
    rootId: 'default',
    sourceTurnIds: [],
  })

  // Axis day: inside the last 30 days but before today.
  store.upsertDayIndex({
    workspaceId: 'ws1',
    localDate: '2026-10-18',
    title: 'axis day',
    turnCount: 1,
    reportRelPath: '',
    rootId: 'default',
    sourceTurnIds: [],
  })

  store.upsertTurnIndex({
    turnId: 'session-a:1',
    title: 'a turn',
    conclusion: 'a conclusion',
    topics: [],
    sourceRelPath: 'projects/ws1/turns/2026-10-19/session-a-1.md',
    rootId: 'default',
    occurredAt: '2026-10-19T02:00:00.000Z',
  })
}

describe('snapshot section order', () => {
  it('orders sections oldest → newest and keeps the volatile tail last', () => {
    const { dir, store } = setup()
    seedAllSections(dir, store)

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-25',
      dayBoundaryMinutes: 240,
    })

    const monthly = snapshot.indexOf('[月报')
    const daily = snapshot.indexOf('[日报')
    const turns = snapshot.indexOf('[Turn 摘要')
    const axis = snapshot.indexOf('[时间轴')
    const date = snapshot.indexOf('[日期]')

    expect(monthly).toBeGreaterThanOrEqual(0)
    expect(daily).toBeGreaterThan(monthly)
    expect(turns).toBeGreaterThan(daily)
    expect(axis).toBeGreaterThan(turns)
    expect(date).toBeGreaterThan(axis)
    // The date line is the very last section before the closing tag.
    expect(snapshot.lastIndexOf('[日期]')).toBe(date)
    store.close()
  })

  it('keeps rules before the historical sections', () => {
    const { dir, store } = setup()
    seedAllSections(dir, store)

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-25',
      dayBoundaryMinutes: 240,
    })

    expect(snapshot.indexOf('[项目规则')).toBeLessThan(snapshot.indexOf('[月报'))
    store.close()
  })
})

describe('ruleStamp', () => {
  it('changes when a rule is added, so the cached snapshot is rebuilt', () => {
    const { store } = setup()
    const before = store.ruleStamp('ws1')

    store.upsertCognitionEntry({
      id: 'rule-new',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'new rule',
      conclusion: 'new conclusion',
      sourceRelPath: null,
      rootId: 'default',
    })

    expect(store.ruleStamp('ws1')).not.toBe(before)
    store.close()
  })

  it('is stable when nothing changes', () => {
    const { store } = setup()
    store.upsertCognitionEntry({
      id: 'rule-1',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'rule',
      conclusion: 'conclusion',
      sourceRelPath: null,
      rootId: 'default',
    })

    expect(store.ruleStamp('ws1')).toBe(store.ruleStamp('ws1'))
    store.close()
  })
})

describe('summarize default', () => {
  it('ships with LLM summarization enabled', () => {
    expect(DEFAULT_CONFIG.summarizeEnabled).toBe(true)
  })
})
