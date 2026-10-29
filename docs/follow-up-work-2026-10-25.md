# 后续工作清单

> **已归档（2026-10-29）**：本清单写于 2026-10-25。其中三项已被后续决定取代——周报改为**停止生成**（不是补 UI）、设置页两个开关**不做**、性能测量**不做**；阶段一已于 2026-10-28 收口。本文保留作历史记录，当前状态与遗留问题见 [known-issues-2026-10-29.md](known-issues-2026-10-29.md)。

- 日期：2026-10-25
- 范围：MIND-for-DSH 阶段一收尾、阶段二清理、并行开工节点
- 当前分支：`feature/core`
- 当前状态：DSH 主交付已可用；有未提交改动，尚未 commit

---

## 1. 当前状态

### 已完成

- 22 个 workspace，旧项目结构已迁入目标目录。
- 历史数据：
  - 24,009 个 turn、447,762 个 event。
  - 277 组日报、21 组月报已从旧 `nailong.db` 恢复，旧正文逐条校验通过。
  - legacy 日报/月报有防覆盖标记：`day_index.root_id='legacy'`、`period_index.legacy_synthesized=1`。
- 注入：
  - 全局 standard + index；项目规则全量；月报全文；连续 21 天日报；最近 7 天 turns。
  - turns 只注入 `status='current'`；100K 字符完整摘要预算，溢出按天聚合。
  - 各 section 旧 → 新排序；快照按 session 只生成一次；今天的新 turn 走增量。
- 摘要：
  - `summarizeEnabled=false`，默认关闭 LLM 摘要。
  - 已摘要保留：15,029 条 `current`。
  - 未摘要：8,980 条 `invalid`，不再调用模型。
  - 后台摘要任务：全部 done，0 pending / 0 running。
- 验证：
  - 117/117 测试通过。
  - build 通过，DSH 已重启。
  - OASIS 注入 83,033 字符；XuanYi 107,710；MIND 123,045（均含 18,502 字符静态规范）。

### 当前语义

- MIND-for-DSH 与 MIND-for-Claude 是两套独立历史，不是索引关系。
- DSH 只读自己的 `~/.dsh/mind`，不读 Claude 的 `nailong.db`。
- 日报/月报的 legacy 正文不可被视图重建覆盖。
- 新 turn 没有 LLM 摘要，只有 fallback 索引；`invalid` 不进入注入的 turns 摘要段。

---

## 2. 可开工节点（节点 A）

### 定义

用户可以在 DSH 中正式开始项目工作，不需要等阶段一全部收尾。

### 开工前冒烟验收

在一个目标项目 workspace 新开会话：

- [ ] 发一条普通消息，时间线出现新 turn。
- [ ] raw Markdown 和 `.events.jsonl` 已落盘。
- [ ] 当天 `days/YYYY-MM-DD.md` 已生成，`day_index.report_rel_path` 非空。
- [ ] 注入包含：项目规则、月报、21 天日报、已有 turns 摘要。
- [ ] 用 `mind_read_turn` 能读到该 turn 原文。
- [ ] 用 `mind_search` 能搜到该 turn。
- [ ] 会话第二轮开始缓存命中接近 99%。

### 当前已知限制

- 新 turn 没有 LLM 结论；只有 fallback 标题。
- 周报 UI 尚未接入；月报页可用，时间线和日报可用。
- 2 条 pending 提案未处理，不影响开工。
- 阶段一的 UI 细节、文档、性能验收尚未全部完成。
- 涉及 DSH 重启的改动需要提前约时间，不在用户工作期间随意重启。

---

## 3. 阶段一剩余工作

### 3.1 UI 验收与补齐（P0）

- [ ] 工作区树：默认收起、点击/悬停逐级展开，叶子可选中。
- [ ] 时间线：展开某天后上下滚动不重叠。
- [ ] 展开天的日报按钮可打开日报。
- [ ] 报告页：
  - [ ] 月报视图可用。
  - [ ] 新增周报视图；数据库已有 34 份周报，UI 目前只查 `kind='month'`。
- [ ] 规则页、工作区页、提案页、设置页逐页走查。
- [ ] 空 workspace、无日报、无月报、无规则时的空态。

### 3.2 工具与规则闭环（P0）

- [ ] `mind_read_turn`：正常 turn、legacy turn、超 50KB 文件、分块边界。
- [ ] `mind_search`：CJK、英文、空查询、无结果。
- [ ] `mind_remember`：只写 pending，不直接生效。
- [ ] 提案审批 → `cognition_entry` → 下一次注入完整闭环。
- [ ] 处理剩余 2 条 pending 提案：
  - OASIS 交付流程与操作矩阵
  - XuanYi TFS PAT 使用与内网 API 约定

### 3.3 崩溃恢复与重启（P0）

- [ ] DSH 重启后未闭合 turn 能找回。
- [ ] 重启后时间线、日报、索引、注入一致。
- [ ] 租约过期的 running job 能回收。
- [ ] 孤儿 raw 文件不会被误删或重复计数。

### 3.4 注入与数据验收（P0）

- [ ] 22 个 workspace 规则全量注入。
- [ ] 月报全文、21 天日报窗口、7 天 turns 全部符合预期。
- [ ] legacy 日报/月报在任意重建、摘要、重启后都不被覆盖。
- [ ] `invalid` turns 不进入 turns 摘要段。
- [ ] 快照在同一 session 内稳定，不重复追加整份内容。
- [ ] 新会话缓存命中从第二轮开始接近 99%。

### 3.5 性能（P1）

- [ ] 测量首轮注入耗时：读取 21 天日报、月报、turns 的成本。
- [ ] 测量第二轮起缓存命中率和响应时间。
- [ ] 如果首轮慢，评估按 workspace + 日期缓存快照或报告内容。
- [ ] 确认 100K turns 预算不会因单条超大摘要而失控。

### 3.6 设置页与配置（P1）

- [ ] 决定是否在设置页暴露：
  - `summarizeEnabled`
  - `turnSummaryChars`
- [ ] 当前两者只能改配置文件。
- [ ] 若恢复摘要，需要明确：
  - 新 turn 是否重新生成摘要；
  - 已标记 invalid 的 turn 是否重试；
  - 是否只对最近 N 天摘要。

### 3.7 文档同步（P1）

- [x] `ARCHITECTURE.md`：注入契约、legacy 防覆盖、摘要关闭。
- [x] `CHANGELOG.md`：注入、恢复、摘要关闭、队列修复。
- [ ] `docs/DESIGN.md`：仍是旧参数（12,000 字符、30 天轴、规则 80/2200、摘要重试），需改为当前契约。
- [ ] `README.md`：删掉“摘要永久重试”等旧说明，补当前摘要策略和注入层级。
- [ ] `docs/UI-DESIGN.md`：同步工作区树、报告页、周报视图、时间线布局。
- [ ] `docs/agent-rd-structure-and-mind-migration.md`：补记 277/21 恢复、legacy 防覆盖、摘要关闭、invalid 策略、当前计数。
- [ ] 清理 `.migration` 的临时文件、旧备份和过期 state/journal。

### 3.8 Git 与发布（P0，需用户决定）

- 当前分支：`feature/core`
- 当前有 33 个未提交改动。
- [ ] 决定是否把这些改动整理成一个或多个 commit。
- [ ] 决定版本号（minor/major 由用户定）。
- [ ] commit 前确认 ARCHITECTURE/CHANGELOG 最新。
- [ ] 不擅自 push；push 前请示。
- [ ] 合并回 main 必须 `git merge --no-ff`，版本点写在 merge commit message；不打 tag。

---

## 4. 阶段二工作（可与用户开工并行）

阶段二不碰 DSH 的 `~/.dsh/mind` 数据，不影响 DSH 使用。

- [ ] `MIND-for-Claude/data/db/nailong.db` → `mind.db`。
- [ ] 全面去硬编码：slug、用户名、绝对路径、`NAILONG_*` 环境变量。
- [ ] GitHub 仓库改名 `Memory Plugin` → `MIND-for-Claude`。
- [ ] 旧 MIND hooks 收尾：
  - 决定保留还是退役；
  - 若保留，修复旧注入的 28/5 上限与 10K hook 拆分；
  - 若退役，移除 hooks，保留只读归档。
- [ ] 删除旧路径兼容 symlink。
- [ ] 清理旧备份、旧 dashboard 进程、旧缓存。
- [ ] 旧库最终归档说明：只读、保留位置、恢复命令。

---

## 5. 并行执行方式

### 用户侧

- 在 DSH 中按节点 A 冒烟验收后直接开始项目工作。
- 避免在 DSH 工作期间要求重启；需要重启时另行约时间。

### 代理侧

可以在不打断用户的前提下推进：

- 文档同步（DESIGN/README/UI-DESIGN/迁移文档）。
- 只读验收：数据一致性、注入内容、缓存、性能。
- 阶段二旧 MIND 清理（不改 DSH 数据）。
- 周报 UI、工具闭环、测试补充（需要重启时集中处理）。

需要重启 DSH 的改动：

- 先说明改了什么、为什么需要重启、预计多久。
- 用户确认后再重启，并恢复前台窗口。

---

## 6. 需要用户决定的事项

1. 摘要是否长期关闭；如果恢复，恢复范围和触发方式。
2. 周报视图是否现在补，优先级是否高于其他 UI 收尾。
3. `summarizeEnabled` / `turnSummaryChars` 是否放到设置页。
4. 当前 33 个未提交改动如何分支、commit、版本号。
5. 阶段二何时启动；旧 MIND hooks 保留还是退役。
6. 旧路径 symlink 何时删除。

---

## 7. 完成标准

### 节点 A：可正式开工

- 冒烟验收全部通过。
- DSH 新会话可捕获、索引、注入、读原文、搜索。
- 后台无摘要任务，日报/月报不被覆盖。

### 节点 B：阶段一完成

- UI（含周报）验收通过。
- 工具与提案闭环通过。
- 崩溃恢复/重启验收通过。
- 注入、数据、缓存、性能验收通过。
- 文档全部同步。
- 2 条 pending 提案处理完。
- Git commit/版本收尾完成。

### 阶段二完成

- 旧 MIND 库改名、去硬编码、hooks 处置、仓库改名、symlink 清理全部完成。
- 旧库只读归档，可回滚说明齐全。
