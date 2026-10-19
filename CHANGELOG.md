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
- The snapshot has per-section budgets; the time axis and closing tag are never truncated. Workspace display names are injected.
- All local dates/times use Beijing time (UTC+8) with a 04:00 day boundary.
- MIND root is 0700 and files 0600; model-facing summaries, proposals, snapshots, increments, and tools redact credential-shaped text.
- Cognition versions only bump when content changes.
- The timeline expands inline (56px indent, rounded inset highlight, no side pane, no hard guide line).
- Day index refresh is cheap at capture; full views are rebuilt on summary/startup; increments use the last main turn query.
- Dev dependencies aligned to DSH `0.2.1-rc.2`.

### Known deferred

- The three standards files are not shipped with the plugin; provisioning is deferred to the migration step by user decision.

## [0.1.0] - 2026-10-18

- Initial capture, storage, summarization, views, injection, workspace identity, and retrieval tools.
