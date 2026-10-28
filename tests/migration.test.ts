import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { SCHEMA_VERSION } from '../src/db/schema.js'
import { Store } from '../src/db/store.js'
import { buildSnapshot } from '../src/inject/snapshot.js'

const dirs: string[] = []

const sqlite = (
  process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') }
).getBuiltinModule('node:sqlite')

function tempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-migrate-'))
  dirs.push(dir)
  return path.join(dir, 'mind.db')
}

function legacyDb(withEnabled: boolean, userVersion: number): string {
  const dbPath = tempDb()
  const db = new sqlite.DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE cognition_entry (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      layer TEXT NOT NULL,
      title TEXT,
      conclusion TEXT,
      status TEXT NOT NULL DEFAULT 'current',
      version INTEGER NOT NULL DEFAULT 1,
      source_rel_path TEXT,
      root_id TEXT,
      updated_at TEXT NOT NULL
      ${withEnabled ? ', enabled INTEGER NOT NULL DEFAULT 1' : ''}
    );
    PRAGMA user_version = ${userVersion};
  `)
  db.prepare(
    `INSERT INTO cognition_entry(id, workspace_id, layer, title, conclusion, status, version, updated_at)
     VALUES ('cog-old', NULL, 'rule', 'old', 'kept', 'current', 3, '2026-01-01T00:00:00.000Z')`,
  ).run()
  db.close()
  return dbPath
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('schema migration', () => {
  it('upgrades a v1 database and preserves rows', () => {
    const dbPath = legacyDb(false, 1)
    const store = new Store(dbPath)
    const row = store.getCognitionEntry('cog-old')
    expect(row).toMatchObject({ id: 'cog-old', title: 'old', conclusion: 'kept', version: 3, enabled: 1 })
    store.close()

    const check = new sqlite.DatabaseSync(dbPath)
    const version = (check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    check.close()
    expect(version).toBe(SCHEMA_VERSION)
  })

  it('repairs a legacy user_version=0 database whose table already exists', () => {
    const dbPath = legacyDb(false, 0)
    const store = new Store(dbPath)
    expect(store.getCognitionEntry('cog-old')?.enabled).toBe(1)
    store.close()
  })

  it('tolerates a half-applied v1 migration where the column already exists', () => {
    const dbPath = legacyDb(true, 1)
    const store = new Store(dbPath)
    expect(store.getCognitionEntry('cog-old')?.enabled).toBe(1)
    store.close()
  })

  it('repairs a version-stamped database whose required columns are missing', () => {
    const dbPath = tempDb()
    const db = new sqlite.DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE turns (
        turn_id TEXT PRIMARY KEY,
        workspace_id TEXT,
        session_id TEXT NOT NULL,
        turn_seq INTEGER NOT NULL,
        origin TEXT NOT NULL DEFAULT 'main',
        source_status TEXT NOT NULL DEFAULT 'live',
        end_reason TEXT,
        occurred_at TEXT NOT NULL,
        local_date TEXT NOT NULL,
        root_id TEXT,
        raw_rel_path TEXT,
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(session_id, turn_seq)
      );
      PRAGMA user_version = 4;
    `)
    db.close()

    const store = new Store(dbPath)
    store.close()

    const check = new sqlite.DatabaseSync(dbPath)
    const columns = (check.prepare('PRAGMA table_info(turns)').all() as Array<{ name: string }>).map(row => row.name)
    check.close()
    expect(columns).toContain('raw_events_rel_path')
    expect(columns).toContain('raw_chars')
  })

  it('refuses a database newer than the code', () => {
    const dbPath = legacyDb(true, 99)
    expect(() => new Store(dbPath)).toThrow(/newer than code/)
  })
})

describe('rules-only migration', () => {
  it('converts legacy user rules and retires project/whiteboard rows once', () => {
    const dbPath = tempDb()
    const store = new Store(dbPath)
    store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
    store.close()

    const db = new sqlite.DatabaseSync(dbPath)
    const insert = db.prepare(
      `INSERT INTO cognition_entry(id, workspace_id, layer, title, conclusion, status, enabled, version, root_id, updated_at)
       VALUES (?, 'ws1', ?, ?, 'x', 'current', 1, 1, 'default', '2026-10-19T00:00:00.000Z')`,
    )
    insert.run('legacy-project', 'project', 'project note')
    insert.run('legacy-board', 'whiteboard', 'board item')
    insert.run('legacy-user', 'user', 'user rule')
    db.exec("DELETE FROM app_setting WHERE key = 'legacy_layers_migrated_v1'")
    db.close()

    const reopened = new Store(dbPath)
    expect(reopened.getCognitionEntry('legacy-project')?.status).toBe('retired')
    expect(reopened.getCognitionEntry('legacy-board')?.status).toBe('retired')
    expect(reopened.getCognitionEntry('legacy-user')?.layer).toBe('rule')
    expect(reopened.getSetting('legacy_layers_migrated_v1')).toBe('1')
    reopened.close()
  })
})

describe('injection scope', () => {
  it('injects enabled project rules and skips disabled ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-snapshot-'))
    dirs.push(dir)
    const store = new Store(path.join(dir, 'mind.db'))
    store.upsertWorkspaceIdentity({ workspaceId: 'ws1', displayName: 'Demo' })
    store.upsertCognitionEntry({
      id: 'rule-on',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'project rule',
      conclusion: 'applies to this project',
      sourceRelPath: null,
      rootId: 'default',
    })
    store.upsertCognitionEntry({
      id: 'off',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'disabled rule',
      conclusion: 'must not appear',
      sourceRelPath: null,
      rootId: 'default',
    })
    store.updateCognitionEntry({
      id: 'off',
      workspaceId: 'ws1',
      layer: 'rule',
      title: 'disabled rule',
      conclusion: 'must not appear',
      enabled: false,
    })

    const snapshot = buildSnapshot({
      store,
      workspaceId: 'ws1',
      rootPath: dir,
      localDate: '2026-10-19',
      dayBoundaryMinutes: 240,
    })
    expect(snapshot).toContain('project rule')
    expect(snapshot).not.toContain('disabled rule')
    expect(snapshot).toContain('日界 04:00')
    store.close()
  })
})
