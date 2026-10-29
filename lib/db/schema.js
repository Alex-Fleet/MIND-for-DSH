export const SCHEMA_VERSION = 4;
/**
 * One idempotent schema block. Every statement uses IF NOT EXISTS so a fresh
 * database and an upgraded one converge on the same shape.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS root (
  root_id TEXT PRIMARY KEY,
  absolute_root TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_identity (
  workspace_id TEXT PRIMARY KEY,
  display_name TEXT,
  project_id TEXT,
  marker_id TEXT,
  git_remote TEXT,
  git_root_commit TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_location (
  location_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  volume_uuid TEXT,
  inode INTEGER,
  current_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  confidence TEXT NOT NULL DEFAULT 'low',
  first_seen TEXT,
  last_seen TEXT,
  retired_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loc_active_inode
  ON workspace_location(volume_uuid, inode) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_loc_ws ON workspace_location(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_path_history (
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT,
  PRIMARY KEY(workspace_id, path, first_seen)
);

CREATE INDEX IF NOT EXISTS idx_workspace_path_history_path
  ON workspace_path_history(path, last_seen DESC);

CREATE TABLE IF NOT EXISTS dsh_workspace_map (
  dsh_workspace_id TEXT PRIMARY KEY,
  mind_workspace_id TEXT NOT NULL,
  canonical_path TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
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
  raw_events_rel_path TEXT,
  raw_chars INTEGER,
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, turn_seq)
);
CREATE INDEX IF NOT EXISTS idx_turns_ws_date ON turns(workspace_id, local_date);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, turn_seq);

CREATE TABLE IF NOT EXISTS turn_events (
  id INTEGER PRIMARY KEY,
  turn_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  seq INTEGER,
  tool_name TEXT,
  bytes INTEGER,
  occurred_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_turn_events_turn ON turn_events(turn_id);

CREATE TABLE IF NOT EXISTS capture_job (
  id INTEGER PRIMARY KEY,
  turn_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  turn_seq INTEGER NOT NULL,
  workspace_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at TEXT NOT NULL,
  last_error TEXT,
  owner TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_state ON capture_job(state, next_at);

CREATE TABLE IF NOT EXISTS session_watermark (
  session_id TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capture_status (
  session_id TEXT PRIMARY KEY,
  last_seq INTEGER,
  pending INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turn_index (
  turn_id TEXT PRIMARY KEY,
  title TEXT,
  conclusion TEXT,
  topics_json TEXT,
  level TEXT NOT NULL DEFAULT 'turn',
  status TEXT NOT NULL DEFAULT 'current',
  source_rel_path TEXT,
  root_id TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turn_index_date ON turn_index(occurred_at);

CREATE VIRTUAL TABLE IF NOT EXISTS turn_index_fts USING fts5(
  title,
  conclusion,
  topics_json,
  content='turn_index',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS turn_index_ai AFTER INSERT ON turn_index BEGIN
  INSERT INTO turn_index_fts(rowid, title, conclusion, topics_json)
  VALUES (new.rowid, new.title, new.conclusion, new.topics_json);
END;
CREATE TRIGGER IF NOT EXISTS turn_index_ad AFTER DELETE ON turn_index BEGIN
  INSERT INTO turn_index_fts(turn_index_fts, rowid, title, conclusion, topics_json)
  VALUES ('delete', old.rowid, old.title, old.conclusion, old.topics_json);
END;
CREATE TRIGGER IF NOT EXISTS turn_index_au AFTER UPDATE ON turn_index BEGIN
  INSERT INTO turn_index_fts(turn_index_fts, rowid, title, conclusion, topics_json)
  VALUES ('delete', old.rowid, old.title, old.conclusion, old.topics_json);
  INSERT INTO turn_index_fts(rowid, title, conclusion, topics_json)
  VALUES (new.rowid, new.title, new.conclusion, new.topics_json);
END;

CREATE TABLE IF NOT EXISTS day_index (
  workspace_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  title TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  report_rel_path TEXT,
  root_id TEXT,
  source_turn_ids_json TEXT,
  PRIMARY KEY(workspace_id, local_date)
);

CREATE TABLE IF NOT EXISTS period_index (
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  title TEXT,
  report_rel_path TEXT,
  root_id TEXT,
  source_day_rel_paths_json TEXT,
  source_turn_ids_json TEXT,
  legacy_synthesized INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(workspace_id, kind, period)
);

CREATE TABLE IF NOT EXISTS cognition_entry (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  layer TEXT NOT NULL,
  title TEXT,
  conclusion TEXT,
  status TEXT NOT NULL DEFAULT 'current',
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  source_rel_path TEXT,
  root_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cog_ws_layer ON cognition_entry(workspace_id, layer, status);

CREATE TABLE IF NOT EXISTS memory_proposal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  layer TEXT NOT NULL,
  title TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_turn TEXT,
  reviewed_at TEXT,
  reviewer TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
