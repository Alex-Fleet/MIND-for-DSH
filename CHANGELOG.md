# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Web UI: sidebar「记忆」entry and a full-area main panel with 时间线 / 当前 / 工作区 / 提案 / 设置 tabs.
- Timeline keyset pagination (50 days per page) with virtual scrolling; day detail and chunked raw-turn reading.
- Structured entry editor (B+): title, project/global scope, Markdown edit/preview, enable switch.
- Proposal review: approve/reject with pending badge; approval creates an editable entry.
- Settings page: capture/inject toggles persisted to `$DSH_HOME/mind/settings.json`.
- `/api/mind.*` exact Fetch routes on DSH's authenticated owner channel.
- `mind_read_turn` and `mind_search` model tools (shared chunk reader with the UI).

### Changed

- Schema v4: `turns.raw_events_rel_path` / `turns.raw_chars`; schema v3 adds provider/model; v2 adds `cognition_entry.enabled` and `app_setting`. `Store.migrate()` verifies and repairs columns on every open, not only on a version bump.
- Every turn writes a full event JSONL alongside the readable Markdown, so system/attempt/tool/compaction payloads are retained.
- Raw writes are fsync'd; ingest (turn, events, job, fallback index) commits in one transaction; events and machine JSONL are deduplicated.
- Summary failures now retry forever with a capped backoff (5s → 30m); the lease is 5 minutes and a hard timeout prevents a hung stream from blocking the drain loop.
- Startup recovery: unclosed turns are rebuilt from `sessionPersistence`, orphan raw files are reconciled, missing/stale day views are rebuilt, and dead/failed/pending summary jobs are re-armed.
- The snapshot gives the time axis first claim on the character budget; rules and cognition share only the remainder, and the closing tag is never dropped. Workspace display names are injected.
- All local dates/times use Beijing time (UTC+8) with a 04:00 day boundary, including the capture worker's `local_date`.
- MIND root is 0700 and files 0600, including SQLite WAL/SHM, settings, and navigation views; model-facing summaries, proposals, snapshots, increments, and tools redact credential-shaped text.
- Cognition versions only bump when content changes.
- The timeline expands inline (56px indent, rounded inset highlight, no side pane, no hard guide line).
- Day index refresh is cheap at capture; full views are rebuilt on summary/startup; increments use the last main turn query.
- Dev dependencies aligned to DSH `0.2.1-rc.2`.

### Fixed

- Duplicate ingest no longer downgrades a completed LLM index back to the fallback preview.
- Orphan raw reconciliation counts only DB-missing turns, so existing files can no longer starve an orphan beyond the first 200.
- Legacy dead summary jobs are re-armed even when the turn predates the provider/model columns.
- Shutdown/hot-reload flush uses the session's resolved workspace identity instead of a path hash.
- A session without a cwd reuses only its own cached workspace; it can no longer borrow another session's workspace.
- Summary configuration now overrides the turn model, and live turns reuse the last request model for later turns in the same session.
- The machine JSONL line is appended idempotently, so a DB retry cannot duplicate it.
- Recovered raw turns parse `.events.jsonl` back into `turn_events`, restore provider/model when present, and backfill the machine index.
- Recovery reuses the workspace's recorded path history instead of minting a new path-hash identity.
- Redaction now covers JSON-quoted keys (including `db_password`, `x-api-key`, camelCase and escaped values), short Authorization Basic credentials, and JWTs; chunked reads redact a 1 MB overlap window so a credential crossing a boundary cannot leak, and snapshot fields are redacted before clipping. Ordinary code references such as `getToken()` are left intact.
- Large legacy turns with `raw_chars = NULL` are readable again (`Number(null)` was being mistaken for an empty file), and redacted chunk markers are atomic even when marker and secret lengths happen to match.
- Session model inheritance now falls back to the last model persisted in the database, covering hot reloads, restarts, and raw recovery.
- Recovery normalizes symlinked/realpath variants before consulting path history, so a moved workspace is not split into an orphan.
- Orphan raw scanning streams sorted directories, continues past individual failures, and no longer builds the whole tree in memory.
- Recovered machine lines carry the parsed workspace path and use the turn start time when an event lacks `occurredAt`.
- The machine JSONL dedupe keeps an in-memory per-file key set, avoiding a full-file read for every turn.
- Startup hardens directories left at 0755 by older builds, and path history keeps one row per `(workspace, path)` with a lookup index.
- Pending summary jobs keep their attempts and backoff across a restart; only legacy dead/failed rows are re-armed.
- Redaction now handles assignment values with special characters/passphrases, short values, bare env names (`PASSWORD`, `DB_PASS`), base64url Basic tokens, short Authorization Bearer tokens, and PGP private keys, while leaving code references (`getToken()`, `process.env.*`, `config.*`, `bcrypt.*`) intact.
- The snapshot selects the most recent days first when the axis is truncated, then displays them chronologically; a truncated axis gets no enrichment budget.
- A partial summary provider/model configuration no longer mixes with the turn's other half.
- Permission hardening only touches MIND-owned directories (plus `settings.json` / `mind.db*`), never unrelated siblings in a custom root; old files are also set to 0600.
- `workspace_path_history` has a unique `(workspace_id, path)` index and is written with UPSERT, so concurrent writers cannot create duplicates.
- Duplicate ingest preserves an existing provider/model and can correct an `orphan` workspace when a later event carries the real identity.
- Raw recovery reads only the file head plus a streaming character count, caps event JSONL input, and writes the machine line before the DB commit.
- The machine-line dedupe cache is bounded and invalidates when the file's size/mtime changes.
- Large-file reads seek through bounded UTF-8 character checkpoints instead of scanning from byte 0 on every page.

### Known deferred

- The three standards files are not shipped with the plugin; provisioning is deferred to the migration step by user decision.
- Full session-log recovery sweep (more than 200 sessions, balanced interrupted closers) and atomic turn-directory event ordering are deferred to a separate design.
- A single credential larger than roughly 4 MB could cross the redaction window; normal keys/tokens are far smaller.

## [0.1.0] - 2026-10-18

- Initial capture, storage, summarization, views, injection, workspace identity, and retrieval tools.
