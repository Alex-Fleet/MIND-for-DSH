# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Injection contract: all project rules, all monthly reports (full text), the continuous 21-day daily window ending 7 days before today, and 7-day turn summaries. Turn summaries use a configurable `turnSummaryChars` budget (default 100K) and aggregate older overflow by day instead of dropping or listing every turn.
- Migrated legacy day/month reports are immutable: view rebuilds update index counts but never overwrite curated report text.
- Web UI: sidebar「记忆」entry and a full-area main panel with 时间线 / 规则 / 工作区 / 提案 / 设置 tabs.
- Timeline keyset pagination (50 days per page) with virtual scrolling; day detail and chunked raw-turn reading.
- Structured rule editor (B+): title, project scope, Markdown edit/preview, enable switch.
- Proposal review: approve/reject with pending badge; approval creates an editable project rule.
- Settings page: capture/inject toggles persisted to `$DSH_HOME/mind/settings.json`.
- `/api/mind.*` exact Fetch routes on DSH's authenticated owner channel.
- `mind_read_turn` and `mind_search` model tools (shared chunk reader with the UI).
- `mind_remember` model tool: the main agent can record a durable project rule as a pending proposal for user review; it never activates a rule directly.
- `user-profile.md` is now part of the static standards section, injected alongside behavior/programming/checklists-index.
- `exps-index.md` is injected as an advisory engineering-experience index; the full exps files stay on-demand and are explicitly not mandatory rules.
- `npm run doctor` (`scripts/doctor.mjs`): read-only profile health check (bundle entry, `node_modules` link, lockfile specifier, build freshness) with `--fix` to relink and repair the manifest/lockfile. Guards against the post-move/post-update failure where `pnpm add` re-materialises a stale `link:` path and DSH silently drops the bundle.

### Changed

- Distribution: `lib/` is committed and the `prepare` install hook is removed. GitHub installs no longer build the package or install devDependencies, so the profile copy stays small and cannot shadow the host's `@deepseek-ai/*` packages. CI rebuilds and fails if the committed `lib/` is stale.
- `npm run doctor` now accepts both install modes: a `link:` checkout (verifies the symlink target) and a package copy from GitHub/npm (verifies the installed package name, version and `dsh.bundle.patch`, and never converts a package install back into a link). It also fails when an installed copy carries nested `@deepseek-ai` packages.
- LLM turn summarization is on by default (`summarizeEnabled=true`): the summary is the index layer, so a turn without one only has a fallback preview. `summarizeEnabled=false` remains an explicit degradation switch. Migrated turns that were already `invalid`/`merged` in the legacy DB stay `invalid` and are not re-summarized.
- The frozen snapshot is rebuilt when the workspace's rule set changes: the cache key now carries a rule stamp (count + latest update + summed versions), so an approved rule is visible in the next turn of the same session.
- The frozen snapshot is also rebuilt after a successful compaction or prune (`compaction/end` without an error, or `compaction/prune`); a failed compaction does not trigger it.
- Snapshot sections are ordered oldest → newest and slowest → fastest changing: project rules → all monthly reports → the 21-day daily window → the 7-day turn summaries → the 30-day time axis → the date line. The date line and time axis change daily, so keeping them last stops them from invalidating the historical prefix every midnight.
- Turn summaries are index-only. The background summarizer no longer emits rule proposals; only the main agent can create proposals, on explicit user request or a high-confidence durable rule.
- Schema v4: `turns.raw_events_rel_path` / `turns.raw_chars`; schema v3 adds provider/model; v2 adds `cognition_entry.enabled` and `app_setting`. `Store.migrate()` verifies and repairs columns on every open, not only on a version bump.
- Every turn writes a full event JSONL alongside the readable Markdown, so system/attempt/tool/compaction payloads are retained.
- Raw writes are fsync'd; ingest (turn, events, job, fallback index) commits in one transaction; events and machine JSONL are deduplicated.
- Summary failures now retry forever with a capped backoff (5s → 30m); the lease is 5 minutes and a hard timeout prevents a hung stream from blocking the drain loop.
- Startup recovery: unclosed turns are rebuilt from `sessionPersistence`, orphan raw files are reconciled, missing/stale day views are rebuilt, and dead/failed/pending summary jobs are re-armed.
- The snapshot is built once per session and reused; today's turns are excluded from the snapshot and delivered through the per-turn increment, so new turns no longer re-append the entire memory block.
- Snapshot sections (monthly reports, daily reports, turn summaries, time axis) are ordered oldest → newest for stable prefix caching.
- All local dates/times use Beijing time (UTC+8) with a 04:00 day boundary, including the capture worker's `local_date`.
- MIND root is 0700 and files 0600, including SQLite WAL/SHM, settings, and navigation views; model-facing summaries, proposals, snapshots, increments, and tools redact credential-shaped text.
- Rule versions only bump when content changes.
- The timeline expands inline (56px indent, rounded inset highlight, no side pane, no hard guide line).
- Day index refresh is cheap at capture; full views are rebuilt on summary/startup; increments use the last main turn query.
- Dev dependencies aligned to DSH `0.2.1-rc.2`.
- Documentation synced to the 2026-10-29 state: README (status, pages, data, standards provisioning), UI-DESIGN (accepted status, report page, settings scope, weekly removal), ARCHITECTURE (legacy raw caveat, marker/volume-UUID state, snapshot cache caveat) and the archived migration plan.

### Fixed

- Startup orphan reconciliation no longer re-ingests a raw turn file that any turn row already points at. Migrated legacy turns use `legacy-<session>-<seq>` ids, so the scan (which only looked for `<session>:<seq>`) used to insert a duplicate row and re-summarize it on plugin load — 200 per load, inflating day counts and duplicating history. The scan now dedupes by `raw_rel_path` before reading the file; genuinely orphaned raws are still recovered. Existing duplicate rows are left untouched (see [docs/known-issues-2026-10-29.md](docs/known-issues-2026-10-29.md) A1).
- Restart no longer re-queues migrated turns that never had a summary. `requeueSummaryFailures()` now only re-arms jobs whose `turn_index.status` is `unsummarized`, so the 376 legacy turns (2026-09-24 … 09-26) that were marked `unsummarized` by the migration stopped being re-summarized on every restart; they are now `invalid` and permanently parked. Disabling summarization also marks new turns `unsummarized` (paused, resumable) instead of `invalid` (never resumed), keeping the two cases distinct.
- Restored curated daily/monthly reports that had been overwritten by deterministic view rebuilds; the files now come from the legacy `nailong.db` source and are protected by legacy markers.
- Missing day reports are materialized immediately after a turn is ingested, so today's timeline is readable before summaries finish.
- Summary jobs are processed newest-turn-first and a failed job no longer blocks the rest of the queue; summary fallback uses the mounted `deepseek-account` provider instead of a non-existent `deepseek-official` provider.
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
- Timeline rows use `workspace name - date` as the primary title; the day's first-turn summary is now the subtitle. A workspace selector at the top of the timeline filters both the page and its keyset pagination.
- Workspace names are projected from the DSH workspace registry: renames are picked up, and the automatic `default-workspace` title is displayed as the localized `默认工作区`. Every dropdown (timeline workspace filter and rule editor project picker) uses the shell's `Menu` primitive instead of a native `<select>`; the native control remains only as a fallback when the primitive module is unavailable.
- Long-term memory is rules-only: the summary emits project-level long-term rules, every rule goes through the proposal queue, and approved rules are workspace-scoped. Automatic project notes/whiteboard writes and their UI/snapshot sections are removed.
- The summary prompt now separates rules from one-off facts: specific watch targets, transient prices, and temporary tasks are rejected; macro, durable project methods/constraints are accepted.
- The former「当前」tab is now「规则」; the editor no longer offers a global scope.
- The same macro rule appearing in later turns is deduplicated against pending/approved proposals and current rules, so it cannot be approved twice.
- A one-time migration converts legacy `user` rules to `rule`, retires `project`/`whiteboard` rows (kept but hidden), and records the migration flag in `app_setting`.
- The dropdown trigger is now rendered inside the DSH `Menu` root, restoring keyboard navigation, Escape/Tab behavior, and click-to-close; the native select appears only when the primitives module is missing.
- The rule editor requires an explicit project (no silent attach to the newest workspace) and disables save with a localized hint when no workspace exists.
- A pending proposal without a workspace can be assigned a project from the proposal card before approval.
- Rules beyond the 60-item injection cap emit an explicit “more rules not injected” marker instead of disappearing silently.
- Workspace titles are stored verbatim; the client localizes `default-workspace` to `默认工作区` or `Default Workspace` from the reader's language.

### Removed

- Weekly report generation. A week's report was a mechanical list of the same daily titles the month already aggregates, so it carried no information of its own. `weeks/*.md` files and existing `period_index(kind='week')` rows stay in place as history; nothing new is written. Day and month views are unchanged.

### Known deferred

- Migration residue (duplicate legacy turns from re-ingestion, legacy raw files that are old MIND summaries, inflated day counts) and implementation deviations (snapshot cache key without a date, volume-UUID fallback, marker never written, search not filtering status) are catalogued in [docs/known-issues-2026-10-29.md](docs/known-issues-2026-10-29.md). Migration-caused items are recorded and intentionally **not fixed** (they do not affect new conversations); non-migration items are pending scheduling.
- Full session-log recovery sweep (more than 200 sessions, balanced interrupted closers) and atomic turn-directory event ordering are deferred to a separate design.
- A single credential larger than roughly 4 MB could cross the redaction window; normal keys/tokens are far smaller.

## [0.1.0] - 2026-10-18

- Initial capture, storage, summarization, views, injection, workspace identity, and retrieval tools.
