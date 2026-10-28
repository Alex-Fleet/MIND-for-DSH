# MIND for DSH — 设计文档

> 版本：**v0.4**（已吸收两轮对抗性审查 + Step 1–6 实现反馈）
> 目标：在 DeepSeek Harness 上实现**全量保留、可导航、自动捕获**的记忆系统。
>
> **实现状态**：本文是设计稿，不是当前契约。**实现契约以 [ARCHITECTURE.md](../ARCHITECTURE.md) 为准。**
> 下列设计参数已被实现取代，仅保留作设计沿革：12,000 字符快照预算（已取消，改为无硬上限）、
> 时间轴排在月报之前（已改到最末）、规则 80 字 / 2200 字符上限（已取消，改为全量）、
> 摘要失败 5 次后 dead（已改为无限退避重试）、摘要默认关闭（已改回默认开启）。

---

## 0. 修订记录

### v0.1 → v0.2
- 捕获接缝 `turn-stopping` → `turn/end`
- 预算 8000 → 12000；时间轴改相对路径
- 单行 JSONL → 每 turn 多行文件
- 迁移改为 dry-run + `source_lost`
- 视图改为确定性导航
- 子代理加 origin 过滤
- 工作区一对多 location
- 用户规则改为提案审核

### v0.2 → v0.3（本轮）
| # | v0.2 残留问题 | v0.3 修正 |
|---|---|---|
| 1 | `turn/end` 回调拿不到消息、同步写文件/插库会阻塞、raw+job 无原子性 | 回调只登记内存事件；**worker 从事件缓冲/sessionQuery 读取**；`turns`+`capture_job` 同事务；raw 临时文件+rename；per-session watermark；启动对账 |
| 2 | `context` 快照每轮都变 → 每轮追加 12K，累积未解决 | **低频快照**（跨天才变）+ **极小增量块**（每 turn <120 字符）+ **总量上限**；不承诺未验证的 compaction 插件 API |
| 3 | 原文分块读取只在摘要里提了一句 | 明确定义 `mind_read_turn(turn_id, offset, max)`；渲染器硬换行（≤800 字符/行） |
| 4 | 工作区 UNIQUE 冲突、复制 vs 移动矛盾 | `workspace_location.status(active/retired)` + 部分唯一索引；**旧路径是否仍存在**判定复制/移动；补 DSH 映射表 DDL；无佐证时隔离不重绑 |
| 5 | `turn_id` 写成“事件 UUID” | 改为 `<session_id>:<turn>`；回填用 `turn/end.seq` |
| 6 | `startActivation` 参数写法错误 | 按 spec：`{provider,label,request:{prompt,maxDepth,agentOptions},signal,delivery}` |
| 7 | 子代理原文被 origin 过滤丢弃 | 子代理 **raw-only**：写原文与机器索引，但不 spawn 捕获子代理、不进注入 |
| 8 | FTS5 列名不匹配、无触发器 | 统一 `topics_json` + INSERT/UPDATE/DELETE 触发器 |
| 9 | 相对路径偏离“摘要带绝对路径”原则 | DB 存 `root_id + rel_path`；**注入时渲染绝对路径** |
| 10 | 旧月报仍是二次压缩 | 标 `legacy_synthesized`；不满足指针验收，或重算 |
| 11 | `source_lost` 无 schema 字段 | 增加 `turns.source_status`；`turn_index.source_path` 可空 |
| 12 | day/project 语义冲突 | 一个路径一个 workspace；`project_id` 只做跨 workspace 聚合 |
| 13 | 回填全量读 | per-session watermark + 窗口读 |
| 14 | compaction 清理无插件 API | 不承诺；改为总量上限 + 停止追加 + harness compaction 兜底 |
| 15 | 硬约束范围歧义 | 每轮只注入 `behavior-standards.md` 的「硬性约束」节（实测 4225）；编程/检查单按路径可读 |
| 16 | 时间轴标题过长 | 标题硬截断 24 字；月份行单独预算 |
| 17 | 规则注入无选取算法 | 每条 ≤80 字 + 总上限 2200 |

### v0.3 → v0.4（实现反馈，Step 1–6 已落地）

| 实现决定 | 原因 |
|---|---|
| 摘要改为 `ctx.get('llm').stream` 一次调用 | `turn/end` 后父 Agent 的 loop 已停止，`startActivation` 报 `agent loop is not active`；一次性 LLM 调用不需要活跃 loop，也没有工具/历史 |
| 原始落盘在监听器内同步执行（毫秒级） | headless 一次性进程可能在 `setImmediate` 前退出；原文必须立即持久化。摘要仍异步 |
| `turn/end` 后立即 `drain()` | LLM 请求是活跃句柄，进程会等到它完成；启动 kick + 周期 drain 补偿崩溃/一次性退出 |
| 动态增量走 `agent/pre-step` | `systemPrompt.context` 是合并快照；每轮变化会整份追加。增量作为一条小 user 消息追加（<200 字符） |
| 静态规范走 `systemPrompt.section`，函数式读取 | 14,831 字符常驻且字节稳定；文件变更时按 mtime 重读 |
| 工具注册用 `inject: ['systemPrompt','tools']` | Cordis 直接属性访问需要 inject；未注入时 `ctx.get('tools')` 拿不到服务 |
| 摘要失败重试 | 直接 LLM 调用失败/JSON 非法 → job 回到 pending，指数退避，5 次后 dead |

---

## 0.5 Spike 实测结果（2026-10-19，DSH 0.2.1-rc.2）

在隔离 `DSH_HOME=/tmp/dsh-spike-home` + headless profile 上实测：

1. **捕获（通过）**
   - 事件序列：`turn/start` → `assistant/message`（含 `message/usage/stream`）→ `tool/call`（`callId/name/arguments`）→ `tool/result`（完整输出）→ `turn/end`（`reason`）
   - `turn/end` 本身不带消息；按 session 缓冲前序事件即可拿到完整 turn。
2. **静态注入（通过）**
   - `systemPrompt.section` 注册的文本被模型准确复述（`MIND-STATIC-OK`）。
3. **动态 context（通过，但有累积）**
   - `request/context` 显示 `systemPromptUpdate: "in-history"`（作为 user 消息追加，不是系统提示）。
   - 1200 字符的动态快照每轮约 **+300 token**；`cacheRead` 逐轮增长（6144 → 6400）。
   - 结论：必须"低频快照 + 小增量 + 上限"，不能每轮整份重写。
4. **大文件读取（可用但需兜底）**
   - 138,536 字节文件，模型通过 shell（`od`/`tail`）读到末行 `END-MARKER-OK`。
   - 50KB/次、2000 字符/行的限制仍存在；提供 `mind_read_turn` 分块工具以保证确定性。
5. **强杀（SIGINT）**
   - session log 中保留了 `turn/start`、`user/message`、`assistant/message`、`tool/call`，但**没有 `turn/end`**。
   - 结论：启动对账必须扫描"有 `turn/start` 无 `turn/end`"的会话，补标 `aborted_unknown` 并捕获；不能只依赖 `turn/end`。
6. **备注**
   - headless 使用 `DEEPSEEK_API_KEY`；测试在隔离 HOME 进行，未污染真实 `~/.dsh`。

---

## 1. 问题与目标

| 问题 | MIND | Aik358 | 本设计 |
|---|---|---|---|
| 原文全存 | ⚠️ 丢 tool_result | ✅ | ✅ 全事件（旧数据尽力） |
| 摘要带地址 | ❌ | ✅ | ✅ |
| 知道历史有什么 | ✅ 时间轴 | ❌ 只有今天 | ✅ 时间轴常驻 |
| 写入不依赖主代理 | ❌ hook 内串行 | ✅ | ✅ 事件+队列+辅助模型调用 |
| 工作区跟随 | ❌ | ❌ | ✅ 三级身份 |

### 不可违背的原则
1. 原文全存（敏感内容例外见 §14）
2. 摘要只做索引：描述 + 路径 + 层级 + 时间
3. 不做二次压缩：高层视图是确定性聚合
4. 时间轴常驻
5. 写入不依赖主代理
6. 按需加载
7. 极简克制

---

## 2. 继承与取舍

**从 MIND**：时间轴披露链、每轮硬约束、SQLite、日报/周报/月报（改为导航视图）。
**从 Aik358**：原文归档+索引+下钻、宿主触发辅助模型调用、预算与配额、静态/动态分离、来源身份标注。
**不做**：重型配置/路由/工具、v1 语义检索、团队/多用户/移动端、摘要替代原文。

---

## 3. 架构与 DSH 接缝（已核对源码）

```
session/event(turn/end)
  → 监听器只登记 (session_id, turn, end_seq) 到内存队列
  → worker 读取该 turn 的事件（内存缓冲或 sessionQuery 窗口）
  → 写 raw（temp+rename）+ turns + capture_job（同事务）
  → 队列消费 → 辅助 LLM 一次调用（无工具、无会话历史）
  → 写 turn_index / day_index / period_index
```

| 用途 | DSH 扩展点 | 备注 |
|---|---|---|
| 会话创建 | `agent/created` | 旧文档的 `agent/session-start` 不存在；必须 try/catch，失败不阻止会话 |
| 轮末事件 | `session/event` 的 `turn/end` | payload 只有 `{turn, reason}`；**不含消息** |
| 轮末 flush | `agent/turn-stopping` | 仅自然停止时触发；不做 I/O、不抛异常 |
| 每步注入 | `system-prompt/assemble` | `section` 进 system；`context` 进 user-role |
| 子代理 | `ctx.subagents.startActivation({provider,label,request:{prompt,maxDepth,agentOptions},signal,delivery})` | `maxDepth` 在 `request` 内 |
| 会话读取 | `ctx.sessionQuery` | 窗口读，不整包 |
| 左侧栏 | `sidebar.panellist` + `main` 面板 | 两者都要注册 |
| 打包 | `dsh.bundle.patch` + profile + `engines.dsh` | |

---

## 4. 数据模型

### 4.1 文件布局

```
$DSH_HOME/mind/
├── mind.db
├── roots.json                      # root_id → 绝对根
├── projects/<workspace-id>/
│   ├── project.md                  # 项目规则（由 DB 派生）
│   ├── plan.md
│   ├── turns/YYYY-MM-DD/<turn-id>.md   # 多行、硬换行（模型可读）
│   ├── index/YYYY-MM-DD.jsonl          # 机器索引（元数据+摘要指针）
│   ├── days/YYYY-MM-DD.md              # 导航视图
│   ├── weeks/YYYY-Www.md
│   └── months/YYYY-MM.md
└── global/{MEMORY.md,standards/}
```

- `turns/*.md`：渲染器每 **≤800 字符**强制换行，规避读工具 2000 字符/行截断。
- `index/*.jsonl`：只给机器用，不暴露给模型。
- 所有 DB 路径存 `root_id + rel_path`；注入/展示时渲染为绝对路径。

### 4.2 核心表

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA user_version=1;

CREATE TABLE root (
  root_id TEXT PRIMARY KEY,
  absolute_root TEXT NOT NULL
);

-- 逻辑身份
CREATE TABLE workspace_identity (
  workspace_id TEXT PRIMARY KEY,
  display_name TEXT,
  project_id   TEXT,          -- 跨 workspace 聚合用
  marker_id    TEXT,
  git_remote   TEXT,
  git_root_commit TEXT,
  created_at   TEXT
);

-- 物理位置（一对多）
CREATE TABLE workspace_location (
  location_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  volume_uuid TEXT,
  inode INTEGER,
  current_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active / retired
  confidence TEXT NOT NULL DEFAULT 'low',  -- primary / marker / git / low
  first_seen TEXT, last_seen TEXT,
  retired_at TEXT
);
CREATE UNIQUE INDEX idx_loc_active_inode
  ON workspace_location(volume_uuid, inode) WHERE status='active';
CREATE INDEX idx_loc_ws ON workspace_location(workspace_id);

CREATE TABLE workspace_path_history (
  workspace_id TEXT, path TEXT, first_seen TEXT, last_seen TEXT,
  PRIMARY KEY(workspace_id, path, first_seen)
);

-- DSH 工作区映射
CREATE TABLE dsh_workspace_map (
  dsh_workspace_id TEXT PRIMARY KEY,
  mind_workspace_id TEXT NOT NULL,
  canonical_path TEXT,
  updated_at TEXT
);

-- 原文 turn
CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY,        -- <session_id>:<turn>
  workspace_id TEXT,
  session_id TEXT,
  turn_seq INTEGER,
  origin TEXT,                     -- main / subagent
  source_status TEXT NOT NULL,     -- live / migrated / source_lost
  occurred_at TEXT,                -- UTC
  local_date TEXT,                 -- 工作区时区日期
  raw_rel_path TEXT,               -- turns/...md（root_id 关联）
  root_id TEXT,
  created_at TEXT,
  UNIQUE(session_id, turn_seq)
);

CREATE TABLE turn_events (
  id INTEGER PRIMARY KEY,
  turn_id TEXT,
  kind TEXT,                       -- message/tool_call/tool_result/thinking/attachment
  seq INTEGER,
  blob_path TEXT,                  -- 大内容/附件
  occurred_at TEXT
);

-- 摘要索引
CREATE TABLE turn_index (
  turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id),
  title TEXT,
  conclusion TEXT,
  topics_json TEXT,                -- JSON 数组
  level TEXT DEFAULT 'turn',
  status TEXT DEFAULT 'current',   -- current/superseded/retracted
  source_rel_path TEXT,            -- 可空（source_lost）
  root_id TEXT,
  occurred_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE turn_index_fts USING fts5(
  title, conclusion, topics_json,
  content='turn_index', content_rowid='rowid'
);
-- INSERT/UPDATE/DELETE 触发器同步 FTS

-- 导航
CREATE TABLE day_index (
  workspace_id TEXT, local_date TEXT,
  title TEXT,             -- 确定性：当天第一条高优先级 turn 的 title
  turn_count INTEGER,
  report_rel_path TEXT, root_id TEXT,
  source_turn_ids_json TEXT,
  PRIMARY KEY(workspace_id, local_date)
);
CREATE TABLE period_index (
  workspace_id TEXT, kind TEXT, period TEXT,
  title TEXT, report_rel_path TEXT, root_id TEXT,
  source_day_rel_paths_json TEXT,
  source_turn_ids_json TEXT,
  legacy_synthesized INTEGER DEFAULT 0,
  PRIMARY KEY(workspace_id, kind, period)
);

-- 项目规则（单一权威，workspace-scoped）
CREATE TABLE cognition_entry (
  id TEXT PRIMARY KEY, workspace_id TEXT,
  layer TEXT,             -- rule only (project-scoped)
  title TEXT, conclusion TEXT,
  status TEXT DEFAULT 'current', version INTEGER DEFAULT 1,
  source_rel_path TEXT, root_id TEXT, updated_at TEXT
);
CREATE INDEX idx_cog_ws_layer ON cognition_entry(workspace_id, layer, status);

-- 捕获队列
CREATE TABLE capture_job (
  id INTEGER PRIMARY KEY,
  turn_id TEXT UNIQUE,
  session_id TEXT, turn_seq INTEGER,
  workspace_id TEXT,
  state TEXT,             -- pending/running/done/failed/dead
  attempts INTEGER DEFAULT 0,
  next_at TEXT, last_error TEXT,
  owner TEXT, lease_until TEXT,
  created_at TEXT
);
CREATE INDEX idx_job_state ON capture_job(state, next_at);

-- 每 session watermark（回填用）
CREATE TABLE session_watermark (
  session_id TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL,
  updated_at TEXT
);

-- 提案（user/rule 必须审核）
CREATE TABLE memory_proposal (
  id TEXT PRIMARY KEY, workspace_id TEXT,
  layer TEXT, title TEXT, content TEXT,
  status TEXT DEFAULT 'pending',   -- pending/approved/rejected
  source_turn TEXT,
  reviewed_at TEXT, reviewer TEXT, reason TEXT,
  created_at TEXT
);

-- 可观测性
CREATE TABLE capture_status (
  session_id TEXT PRIMARY KEY,
  last_seq INTEGER,
  pending INTEGER, failed INTEGER,
  last_error TEXT, updated_at TEXT
);
```

---

## 5. 写入链路（v0.3 重写）

### 5.1 监听器（只登记，不做 I/O）

```
on session/event:
  if event.type == 'turn/end':
     mem.queue.push({session_id, turn, end_seq})
     schedule(worker)          # 不 await、不写盘、不抛异常
```

- 监听器内**禁止**：文件 I/O、SQLite、spawn、LLM。
- `agent/turn-stopping` 仅做内存 flush；异常必须吞掉。

### 5.2 数据来源

每个 turn 的事件：
1. **在线**：监听器同时维护每 session 的**当前 turn 事件缓冲**（只保留当前 turn 的 message/tool 事件，边界由 `turn/start`/`turn/end` 确定）。
2. **回填/崩溃恢复**：worker 用 `ctx.sessionQuery` 从 per-session watermark 起**窗口读取**（不是整包）。

### 5.3 worker

```
for job in capture_job where state=pending and next_at<=now:
   lease job
   events = buffer or sessionQuery window
   render turns/<date>/<turn-id>.md (硬换行)
   write temp → rename
   BEGIN
     insert/update turns (source_status=live)
     insert capture_job (state=running/done)
   COMMIT
   if origin == 'subagent':
       write machine index only; DONE   # 不 spawn、不进注入
   else:
       call auxiliary llm.stream (one-shot, no tools/history)
       validate JSON → upsert turn_index / proposals
   update watermark
```

### 5.4 原子性与对账

- `turns` 与 `capture_job` 同事务；raw 先写 temp 再 rename（rename 成功后才提交事务）。
- 启动对账：
  - raw 存在但无 job → 补 job
  - job 存在但无 raw → 重新渲染
  - watermark 之后的事件 → 回填
  - **有 `turn/start` 无 `turn/end` → 标 `aborted_unknown` 并捕获**（实测：SIGINT 强杀不会发 `turn/end`）
- `capture_status` 按 session 记录 last_seq / pending / failed。

### 5.5 幂等

- `turn_id = <session_id>:<turn>`
- `UNIQUE(session_id, turn_seq)`
- job 带 `owner` + `lease_until`，防止多进程重复消费。

### 5.6 成本

| 控件 | 策略 |
|---|---|
| 会话防抖 | 按会话合并，不全局丢弃 |
| 短 turn | 仍写确定性索引（标题=用户消息前 80 字）；LLM 摘要可选 |
| 每日预算 | 超预算降级：保 raw + 确定性索引 |
| 并发 | 队列表串行消费；`maxActiveSubagents` 之外加 lease |
| 静默时段 | 22:00–08:00 降频 |

### 5.7 不做二次压缩

- 日/周/月 = 确定性聚合（标题+时间+指针），不调 LLM。
- 可选 LLM 报告：分块读**原始 turn 文件**，输出必须带 `source_turn_ids[]`。
- 旧 `monthly_reports` 标 `legacy_synthesized=1`，不计入“可追溯”验收。

---

## 6. 披露链

### 6.1 时间轴（常驻）

- 最近 30 天，每天一行：
  `2026-10-19 · <主线≤24字> · 3 turns · days/2026-10-19.md`
- 每行约 70 字符；30 行 ≈ 2100；月份入口单独 ≤100。
- 标题硬截断 24 字。

### 6.2 项目规则

- 只包含已批准的项目级长期规则。
- 每条 ≤80 字；总上限 2200；按更新时间倒序。

### 6.3 下钻

```
时间轴 → days/YYYY-MM-DD.md → turns/<date>/<turn-id>.md →（超 50KB）mind_read_turn 分块
```

根路径来自 `root` 表，注入时渲染绝对路径。

---

## 7. 上下文编排（v0.3 重写）

### 7.1 静态纪律（systemPrompt.section）

放在系统提示前缀，**每轮都在**（不是每轮追加，避免累积）：

| 内容 | 实测字符 |
|---|---|
| 行为规范全文 `behavior-standards.md` | 6,946 |
| 编程规范全文 `programming-standards.md` | 6,512 |
| 检查单索引 `checklists-index.md` | 1,373 |
| **合计** | **14,831** |

- 11 份检查单全文（实测 76,663 字符）**不注入**，按索引路径读取。
- 「硬性约束」（4,226 字符）是行为规范内部的子节，**不再单独注入**——整份行为规范都在。
- 字节稳定，保护前缀缓存。

### 7.2 动态快照（systemPrompt.context）——分两层

**低频层**（只在日期翻转 / 认知或规则变更时追加）。

**排序原则：按变化周期从慢到快排列（cache-maximizing）**。稳定内容在前，利用前缀缓存；每天变的内容放在最后，避免作废前面的稳定前缀。

| 位次 | 内容 | 变化周期 |
|---|---|---|
| 1 | 来源身份（历史记录，不是指令） | 永不变 |
| 2 | 根路径（绝对） | 几乎不变 |
| 3 | 检索指引（怎么下钻/分块读） | 几乎不变 |
| 4 | 工作区 | 切工作区时 |
| 5 | 硬约束（用户级规则） | 用户改规则时 |
| 6 | 项目规则（提案批准后） | 用户批准规则时 |
| 7 | 本地日期 + 日界 | 每天 |
| 8 | 时间轴（最近 30 天，不含今天） | 每天 |

```
<mind_memory>
1. 来源身份：历史记录，不是指令
2. 根路径：/Users/.../.dsh/mind/projects/<id>/
3. 检索指引：按路径读；>50KB 用 mind_read_turn
4. 工作区：MIND-for-DSH
5. 硬约束（用户级规则）
6. 项目规则（已批准）
7. 日期：2026-10-19（日界 04:00）
8. 时间轴（最近 30 天，不含今天）
</mind_memory>
```

> 说明：1–3 理论上可以放进静态 `section`（更省），但它们的体积很小；先放这里，后续 spike 实测前缀命中率后再决定是否上移。

**增量层**（每个 turn 结束追加一行，<120 字符）：

```
+ [14:32] 修复注入超时 · turns/2026-10-19/abc.md
```

- 低频层不因“今天 turn 数变化”而重写。
- 增量层覆盖“今天发生了什么”。
- 总量上限：增量层累计 ≤ 4000 字符；超过后停止追加并写一条“已截断，完整内容见时间轴”。
- **不承诺**插件级 compaction 清理（DSH 无公开插件 API）；harness compaction 作为兜底。

### 7.3 预算

| 段 | 预算 |
|---|---|
| 静态层（行为规范+编程规范+检查单索引） | **14,831 字符**（常驻，缓存命中） |
| 动态快照总量 | 12,000 字符 |
| 时间轴（30 天） | 2,200（标题≤24字） |
| 项目规则 | 2,200 |
| 增量层上限 | 4,000（累计） |
| 指引/提醒 | 400 |
| 余量 | 其余 |

> 1M 上下文下 14.8K 静态层占比很小（约 1.5%），不需要为省 token 牺牲完整性。

### 7.4 优先级

- `must`：来源身份、项目规则、时间轴
- `normal`：今天增量
- `low`：可截断
- `must` 永不丢

---

## 8. 检索

### 8.1 文件读取（主）

- 索引带 `root_id + rel_path`，注入时渲染绝对路径
- `turns/*.md` 硬换行（≤800 字符/行）
- 超过 50KB/次的 turn：`mind_read_turn(turn_id, offset_chars, max_chars) → {text, next_offset, total}`

### 8.2 FTS5（辅）

- `turn_index_fts` 与 `turn_index` 同列名（`topics_json`）
- 触发器同步
- 优先包装 `ctx.sessionQuery`，避免重复索引

### 8.3 v2 语义（默认关闭）

---

## 9. 工作区身份（v0.3 重写）

### 9.1 不变量（实测）
- 同卷 rename/move：inode 不变
- copy/跨卷/恢复：inode 变
- inode 可能复用

### 9.2 身份级别
| 级别 | 标识 | 置信 |
|---|---|---|
| 主 | `(volume_uuid, inode)` + 旧路径消失 | primary |
| 辅 | xattr marker（可选） | marker |
| 回退 | git remote + root commit（归一化 SSH/HTTPS/.git） | git |
| 无 | 新建 workspace | low |

### 9.3 解析算法（fail-safe）

```
stat 当前路径 → (vol, inode)

A. 命中 active location:
   - 旧路径仍存在且 inode 不同 → 这是复制品 → 新建 workspace（fork）
   - 旧路径不存在 → 移动 → 重绑（retire 旧 location）
   - 旧路径存在且 inode 相同 → 同路径 → 直接用
   - marker/git 冲突 → 不重绑；retire 旧 location；新建 low 置信 workspace

B. 未命中 location：
   - marker 命中且原 location 的旧路径不存在 → 重绑
   - marker 命中但旧路径仍存在 → fork
   - git 命中同理
   - 都没有 → 新建 low 置信 workspace

C. inode 复用防护：
   - 无 marker/git 佐证时，要求 ctime/path_history 支持，否则不自动重绑
```

### 9.4 DSH 映射
- `dsh_workspace_map` 表；DSH 仍按 canonical path，MIND 负责记忆跟随。
- UI 明示“记忆已跟随，DSH 工作区是新的”。

### 9.5 平台
- v1 仅 macOS；volume UUID 用 `diskutil info -plist <mount>` 获取并缓存。
- 网络卷/不支持平台 → 降级为路径 + marker，并提示。

---

## 10. 规范与检查单

- 每轮只注入 `behavior-standards.md` 的硬约束节（4225）
- 编程规范/检查单按路径可读
- 条目级编辑；user/rule 变更走提案审核
- 注入侧只读取 `status='approved'` 的提案

---

## 11. UI（极简）

- 左侧栏 `sidebar.panellist` + `main` 面板，位置在插件/自动化之后
- 页面：时间线 / 当前 / 工作区 / 设置 / **提案审核**
- 所有列表 keyset 分页（`(date,turn_id)`），虚拟滚动，禁止全量
- installed Client module + host Remote service（不用 dynamic package）
- 复用官方 UI primitives

---

## 12. 迁移

### 12.1 dry-run（先审计）
统计口径必须区分：
- `live_source`：JSONL 仍存在 → 对比全事件，统计缺失 tool_result/attachment
- `dead_source`：JSONL 不存在 → 只标 `source_lost_unknown`，不报“缺失 N 条”
- `legacy_archive`：无 JSONL、只有 MIND raw_json → 标 `source_lost`，尽力重建
- 空摘要、坏链接、多 slug 同日冲突

### 12.2 原文重建
- 从 live JSONL 重新 ingest 全事件
- 未知来源标 `source_lost`

### 12.3 项目映射
- `cwd` 恢复旧路径；`projects.json` 建 `project_id`
- 一个路径一个 workspace；project 只做跨 workspace 聚合
- orphan 显式标记

### 12.4 字段映射
同 v0.2，补：`source_status`、`legacy_synthesized`、`source_rel_path` 可空、tombstone。

### 12.5 验收
- dry-run 报告与最终结果按 session/turn/事件类型/路径计数一致
- 抽样以 live JSONL 为准

---

## 13. 性能与资源

- SQLite WAL + busy_timeout；重活放 worker/子进程
- UI keyset 分页 + 虚拟滚动
- raw 渲染硬换行
- 每日 checkpoint；磁盘阈值告警
- 备份/回滚流程

---

## 14. 安全与边界

- 插件无沙箱，以用户权限运行（README 明示）
- 捕获时 redaction（密钥/token），保留 tombstone
- 注入前再次过滤凭据
- 路径 canonicalize + allowlist
- user/rule 只经提案审核
- 默认不写用户项目目录
- 数据目录权限 0700

---

## 15. 风险与实现前 spike

| 风险 | 缓解 |
|---|---|
| DSH 预览期破坏性变更 | `engines.dsh` + 契约测试 + 降级为只写不注入 |
| 捕获事件缓冲的可靠性 | spike：验证 turn/start→turn/end 的事件顺序与 sessionQuery 窗口 API |
| context 累积 | 低频层 + 小增量 + 上限；spike 实测 retained 字符总量 |
| 子代理成本 | 队列 + 预算 + 降级 |
| inode 复用 / 复制 | 旧路径存在性判定 + 低置信隔离 |
| 迁移缺口 | dry-run 报告 + `source_lost` |

### 已完成的 spike（2026-10-19）
1. **捕获**：通过。事件序列与 payload 见 §0.5。
2. **注入**：通过。静态 section 到达模型；动态 context 作为 in-history 消息追加，实测约 +300 token/轮（1200 字符快照）。
3. **读取**：可用。138KB 文件可经 shell 读到末行；仍需 `mind_read_turn` 分块兜底。

### 仍需实现期验证
- `sessionQuery` 的窗口读 API（回填用）。
- compaction 对 in-history 快照的清理行为。
- 中止/错误 turn 的 `turn/end` 是否仍发布（代码显示会，需实测一次 Ctrl-C）。

---

## 16. 验收标准

1. 文件夹重命名/同卷移动 → 新路径继承旧记忆
2. 复制品 → 默认分叉，不串历史
3. 每轮上下文含项目规则 + 时间轴
4. 任意记忆可从时间轴读到多行原文；>50KB 可 `mind_read_turn` 分块
5. 日/周/月每条可追溯到 turn_id（legacy 月报除外，显式标记）
6. UI 列表不全量加载
7. 错误/中止/超时 turn 也被捕获
8. 主代理不调工具时写入仍发生
9. 崩溃重启后 pending 自动恢复
10. 迁移 dry-run 与实际结果计数一致

---

## 17. 开放问题（需用户拍板）

1. 复制品：默认分叉（本设计）还是询问？
2. v1 是否需要 FTS5，还是纯路径？
3. 旧 MIND 数据：迁移，还是只读保留 + 重建索引？
4. 时间轴常驻 30 天是否可接受（预算已按相对路径算）？
