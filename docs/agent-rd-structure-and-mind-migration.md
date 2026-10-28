# Agent R&D 结构迁移与 DSH 记忆迁移计划

- 状态：草案，待确认
- 日期：2026-10-24
- 范围：`Agent R&D/` 下全部项目；`MIND-for-Claude`（原 `Memory Plugin`）；`MIND-for-DSH`

## 0. 目标与阶段

### 宏观架构

两条线，优先级不同：

- **MIND-for-DSH：目标系统，主交付。** 阶段 1 必须把它做完整、做正确、做稳定。文件结构迁移、旧数据导入、规则迁移、workspace 隔离、捕获/索引/注入/检索、UI、崩溃恢复、测试验收，都以它为准。
- **MIND-for-Claude：旧系统和过渡桥。** 阶段 1 只需要保活：hooks 不断、捕获不断、注入不断。`nailong.db → mind.db`、全面去硬编码、GitHub 改名、旧 hooks 收尾，都可以延后，不阻塞 DSH。
- **文件结构是两条线共同的前置条件。** 结构必须按目标树改；Claude 侧只做维持运行所需的最小路径兼容。
- **阶段 1 的验收标准是 MIND-for-DSH 完备可用，不是 Claude 侧清理干净。**

### 目标结构

```text
Agent R&D/
├── Archived/
│   ├── KG Kernal/
│   ├── MUSIK/
│   ├── Outsource Projects/
│   ├── WXZB/
│   ├── price review agent/
│   ├── game-test/
│   ├── Audit Automation System/
│   ├── AI4MATH/
│   └── Github Wandering/
├── GameExpert/
│   ├── GuanDan/
│   ├── MC_Design/
│   └── Millennius/
├── Opensource/
│   ├── MIND-for-Claude/        # 原 Memory Plugin
│   ├── MIND-for-DSH/
│   └── SHUOSC/
├── OASIS/
├── study assistant agent/
└── XuanYi Internship/
```

### 阶段划分

**阶段 1：结构迁移 + MIND-for-DSH 完备**

- 按目标结构移动项目。
- 把 MIND 的规则、索引、历史迁入 DSH。
- MIND-for-DSH 必须完整可用：捕获、索引、注入、检索、规则/提案、workspace 隔离、UI、崩溃恢复、测试。
- Claude 侧 MIND 只做保活，不做清理。

阶段 1 验收以 MIND-for-DSH 为准：

- [ ] 新 turn 能捕获、落盘、建索引。
- [ ] 时间线、日/周/月视图可用。
- [ ] static standards + 动态快照 + 项目规则注入正常。
- [ ] `mind_read_turn`、`mind_search`、`mind_remember` 可用。
- [ ] 提案审核 → 规则 → 注入闭环可用。
- [ ] 每个项目有独立 workspace，规则和历史归属正确。
- [ ] 旧数据迁移后条数、抽样内容、读取路径正确。
- [ ] 崩溃恢复、摘要重试、脱敏、权限隔离通过测试。
- [ ] DSH 重启后行为和迁移前一致。

**阶段 2：MIND-for-Claude 清理（可延后）**

不影响阶段 1 验收；DSH 稳定后再做。

- `nailong.db` → `mind.db`。
- 全面去硬编码（slug、用户名、绝对路径）。
- `Memory Plugin` 的 GitHub 仓库改名为 `MIND-for-Claude`。
- 更新或退役 Claude 侧 MIND hooks。
- 删除临时兼容 symlink、旧备份和旧缓存。

### 数据库命名

- **新库统一叫 `mind.db`**：DSH 目标库、迁移中间库、任何新生成的 SQLite 都用 `mind.db`，不再产生 `nailong.db` 新文件。
- **旧 Claude 源库**暂保留 `data/db/nailong.db`：它是待迁移的源文件，不是新库。阶段 1 不改名，避免停 hooks、处理 WAL 带来的稳定性风险。
- 文档里的 `nailong.db → mind.db` 专指旧 Claude 库改名，属于阶段 2；不影响 DSH 新库命名。

### 硬约束

1. 迁移过程中 MIND 的捕获、注入、检索不能中断。
2. 文件结构必须与目标树一致。
3. 迁移可中断、可重入、可回滚。
4. 源数据只读，验证通过前不删除。
5. 不在当前 Claude 会话的 cwd 内直接移动 `Memory Plugin`。

## 1. 当前数据盘点

### 旧 MIND（Claude 侧）

| 数据 | 数量 |
|---|---:|
| `data/db/nailong.db` | 1.4 GB |
| `turns` | 409,377 行 |
| `turn_summaries` | 21,479 条 |
| `daily_reports` | 295 篇 |
| `monthly_reports` | 27 篇 |
| `sessions` | 88 个 |
| turn 文件 | 约 15,373 个 |
| daily 文件 | 约 586 个 |
| monthly 文件 | 27 个 |
| 时间范围 | 2026-06-01 至 2026-10-24 |

### 旧 MIND 元数据

| 表 | 行数 | 内容 | 处理 |
|---|---:|---|---|
| `memory_registry` | 33 | 老 Markdown 记忆的章节索引、scope、权重、确认次数 | 不迁，随旧库归档 |
| `preferences` | 13 | 老偏好正文（铁律、工作风格、沟通、代码风格等） | 与现行 standard/user-profile 对比，重复丢弃，只补缺 |
| `memory_proposals` | 22 | 老提案，8 approved、14 rejected | 不批量导入；approved 多数已进 standard，只人工补缺 |

`memory_registry` 的 scope 分布：global 26、`project:学习助手agent` 5、`project:记忆插件开发` 2。它只是元数据，不是记忆正文。

### Claude Code memory

- 11 个 `MEMORY.md`，其中 8 个为空。
- 5 条索引条目，另有 5 个未进索引的文件，共 10 个记忆文件。
- 分类：约 4–5 条规则候选、3–4 条参考、2–3 条丢弃。

### 项目规则

- `~/.dsh/mind/global/projects/` 下 6 个项目的 `rules.md` 已存在。
- DSH SQLite 当前只有 1 条 rule，项目规则尚未导入。

### DSH 当前数据

| 数据 | 数量 |
|---|---:|
| `turns` | 41 |
| `turn_events` | 1,806 |
| `day_index` | 5 |
| `cognition_entry` | 1 |
| `memory_proposal` | 66（approved 1 / rejected 65） |
| `workspace` | 1（default-workspace） |

### 已完成的迁移

- 5 个全局 standard。
- 11 个 checklist、4 个 exps。
- browser-probe skill。
- 38 条旧记忆归档。

这些不重复迁移，只做路径和内容校验。

## 2. 阶段 1：结构迁移

### 2.1 备份

- `~/.claude/settings.json`
- `~/.dsh/profiles/desktop/`
- `~/.dsh/skills/browser-probe`、`~/.claude/skills/browser-probe`
- `Memory Plugin/projects.json`
- 旧 MIND DB（`VACUUM INTO` 快照）
- DSH `~/.dsh/mind/mind.db`

### 2.2 兼容层

- 移动后在旧路径保留临时 symlink，指向新路径。
- 至少覆盖 `Memory Plugin`、`MIND-for-DSH`；建议所有移动项目都保留，直到验证完成。
- 这样旧 hooks、旧 Claude 会话、运行中的 DSH 不会当场断。
- 所有 symlink 记录在迁移 journal，最后统一删除。

### 2.3 移动顺序

1. `Archived/` 下的项目。
2. `GameExpert`、`OASIS`、`study assistant agent`、`XuanYi Internship`。
3. `Opensource/SHUOSC`。
4. `Memory Plugin` → `Opensource/MIND-for-Claude`（最后）。
5. `MIND-for-DSH` → `Opensource/MIND-for-DSH`（停止/重启 DSH 前后处理）。

每一步单独 `mv`，记录 old/new，不批量执行。

### 2.4 路径改写

- `~/.claude/settings.json`：31 处 `Memory Plugin` 绝对路径。
- `projects.json`：更新项目路径；slug 暂时保留，作为历史别名。
- `~/.dsh/profiles/desktop/package.json`：更新 `mind-dsh` link。
- 两个 `browser-probe` symlink。
- Claude project memory 目录 key：旧 key 迁移到新 key，旧 key 保留临时 alias。
- 9 个 `.venv`：移动后重建。
- `benchmark/runner/check-cheat.mjs`、`benchmark/mind-context.txt`、OASIS 文档中的旧路径。
- 旧 MIND hooks：先靠兼容 symlink 继续工作；阶段 2 再改成新路径。

### 2.5 当前会话

当前 Claude 会话的 cwd 在 `Memory Plugin` 内。迁移脚本必须从 `/tmp` 或其他不在被移动目录内的 cwd 启动；当前会话只做审阅和验收。

## 3. 阶段 1：DSH 数据迁移

### 3.1 项目与 workspace 映射

- 为每个有数据的项目建立 DSH workspace，包括归档项目。
- stable project id 示例：`oasis`、`xuanyi-internship`、`study-assistant`、`mind-for-claude`、`audit-automation`、`kg-kernal`、`price-review`。
- 旧 slug 只作为 alias，不作为身份。

### 3.2 规则迁移

- 全局 standard 已在 DSH，不重迁。
- 项目 `rules.md` 导入对应 workspace。
- 10 个 Claude memory 文件逐条分类：
  - 规则 → workspace rule；
  - 参考 → exps / user-profile / 项目参考；
  - 过期/重复 → 丢弃。
- 冲突先裁决：`small-bugs-just-fix` vs 行为规范 ⑦-A；`important-research` vs 子代理策略；`commit-convention` 限项目级。
- 所有规则走 pending proposal，不自动通过。

### 3.3 历史迁移

建议分两步：

1. **先迁索引层**：`turn_summaries`、`daily_reports`、`monthly_reports`、日期索引。恢复时间线和日报/月报。
2. **再迁 raw turns**：按主键分批，源库只读，目标库 UPSERT，记录 cursor；迁移后验证 `mind_read_turn`。

raw turns 是否在阶段 1 全量导入，待确认；如果暂不导入，旧库保留只读归档，DSH 暂时只能读新 turn。

#### 3.3.1 `turn_index.status` 的迁移约定（硬性）

迁移脚本必须区分两种"没有摘要"，下标写错会导致启动时反复重排旧数据。

| 旧库情况 | 目标状态 | 含义 |
|---|---|---|
| 有有效摘要 | `current` | 直接可用 |
| 旧库标了 `invalid` / `merged` | `invalid` | 噪音或已合并，不补 |
| **旧库根本没有摘要记录** | **`invalid`** | 同样不补，只是缺摘要 |
| 新 turn 正常落盘、等待摘要 | `unsummarized` | 排队等 LLM 补 |

**禁止**把迁移数据写成 `unsummarized`。启动时的 `requeueSummaryFailures()` 只处理 `state IN ('dead','failed')` 且 `turn_index.status='unsummarized'` 的任务——被标成 `unsummarized` 的旧数据会被当成"等着补"，每次重启重排一批。

**事故记录（2026-10-25）**：迁移时把 376 条无摘要的旧 turn（9-24 / 9-25 / 9-26）写成 `unsummarized`，DSH 重启后它们被逐批重排为 pending，开始调用模型摘要。两次重启共重排约 380 条。处理：全部改为 `invalid`，`capture_job` 置 `done`，此后不再重排。

同一个语义现在有两个出口：`summarizeEnabled=false` 时新 turn 标 `unsummarized`（关掉只是暂停，重开能补），迁移数据标 `invalid`（永不补）。两者的区别必须在迁移脚本里显式体现。

### 3.4 旧元数据

- `memory_registry`、`preferences`、`memory_proposals` 不直接导入 DSH。
- 旧库整体归档；只把人工确认仍然有效的少数规则补进 standard 或 workspace rule。
- rejected 提案不迁。

## 4. 崩溃安全设计

### 状态目录

```text
Agent R&D/.migration/2026-10-24/
├── state.json
├── journal.jsonl
├── lock
├── backups/
└── logs/
```

### 状态机

```text
preflight
  → backup
  → freeze-or-compat
  → move-projects
  → rewrite-paths
  → workspace-map
  → import-rules
  → import-summaries
  → import-raw
  → verify
  → cleanup
```

### 规则

- 每步完成才写 `done`；写状态用临时文件 + fsync + rename。
- 每个 `mv` 记录 old/new/inode；重跑时检测“旧在/新在/两者都在”三种情况。
- 配置改写先备份，写临时文件再 rename。
- 数据导入分批事务，记录 cursor；重复导入用 UPSERT。
- 锁文件写 PID，检测 stale lock。
- 先 dry-run 输出清单，不写任何东西。
- 回滚按 journal 逆序执行。
- 验证通过前不删源数据、不删 symlink、不删旧库。

### 兼容不断服

- 旧路径 symlink 保证 hooks、旧 Claude 会话、运行中的 DSH 不中断。
- DSH 迁移前备份 DB + WAL；导入在副本上验证，再切换。
- 旧 MIND 在阶段 1 保持运行；阶段 2 再决定是否退役。

## 5. Slug 与身份

Claude Code 把 cwd 编码成目录名：`/`、空格、`.`、`_` 都变成 `-`，开头 `/` 变成开头 `-`。

因此：

- `jane_windme.com` 和 `user_alex` 是电脑用户名，不是项目身份。
- 同一个项目会因换电脑、换用户名、路径末尾差异产生多个 slug。

### 需要合并的典型 slug

| 项目 | slug 变体 | 说明 |
|---|---|---|
| OASIS | `...jane-windme-com...OASIS` | 旧用户名 |
| OASIS | `...user-alex...OASIS` | 当前用户名 |
| OASIS | `...jane-windme-com...OASIS-` | 旧目录名/末尾分隔符差异；不是新项目，当前被错误归到“新项目” |
| XuanYi | `...jane-windme-com...XuanYi-Internship` | 旧用户名，5 sessions |
| XuanYi | `...user-alex...XuanYi-Internship` | 当前用户名，2 sessions |
| study assistant | 旧路径、`study-assistant-agent`、当前路径 | 三种写法，同一项目 |
| Memory Plugin | 旧路径、当前路径、`nailong-doctor-system` | 同一项目历史 |
| price review | `price-review-agent` | 手写 slug，映射到 stable id |

### 阶段 1 最小处理

- 建 `slug → stable id` 映射表。
- 迁移时按映射合并，不修改旧库。
- `projects.json` 路径更新到新结构，slug 暂时保留。
- `OASIS-` 从“新项目”移除，合并到 OASIS。

### 阶段 2 完整去硬编码

- `projects.json` 使用 stable id + 相对路径 + aliases。
- 新会话通过 cwd/session cwd 解析，不靠 slug 前缀猜。
- 删除绝对路径中的用户名。
- `NAILONG_DATA_DIR` → `MIND_DATA_DIR`，保留旧名兼容。
- logger、备份名、测试文件、安装器中的 `nailong` 全部改成 `mind`。

## 6. 阶段 2：MIND-for-Claude 清理（可延后，不影响 DSH 验收）

### 6.1 `nailong.db` → `mind.db`

代码引用：

- `scripts/config.py`：`db_path`
- `scripts/backup.py`：备份名和 glob
- `scripts/store.py` / `scripts/llm_utils.py`：logger
- `scripts/migrate.py`：旧库副本名
- `install.py`：`_is_nailong`、`settings.json.pre-nailong.bak`
- `README.md`、`ARCHITECTURE.md`、`tests/test_api.py`

安全步骤：

1. 停写 hooks。
2. `sqlite3 nailong.db "VACUUM INTO 'mind.db'"`。
3. 核对表数和行数。
4. 改配置。
5. 旧文件保留为只读备份。
6. 更新备份命名、文档、测试。
7. 验证后恢复写。

### 6.2 其他

- GitHub 仓库 `Alex-Fleet/MIND` → `Alex-Fleet/MIND-for-Claude`（外部操作，先确认）。
- 更新 remote URL。
- 删除临时 symlink。
- 重建/清理 venv、缓存、旧备份。
- 决定 Claude 侧 MIND 继续运行还是退役。

## 7. 阶段 1 决策点

以下只影响阶段 1；阶段 2 的 Claude 清理不在这里。

### 已确认

**D1. raw turns 迁移范围：A**

阶段 1 全量导入 409,377 条 raw turns。迁移器分批、可中断、可校验；源库只读。

**D2. workspace 粒度：每个最小项目一个 workspace，共 18 个**

```text
Archived (9)
  kg-kernal
  musik
  outsource-projects
  wxzb
  price-review-agent
  game-test
  audit-automation-system
  ai4math
  github-wandering

GameExpert (3)
  guan-dan
  mc-design
  millennius

Opensource (3)
  mind-for-claude
  mind-for-dsh
  shuosc

独立项目 (3)
  oasis
  study-assistant
  xuanyi-internship
```

`Archived`、`GameExpert`、`Opensource` 目录本身不是 workspace。

**D3. 归档项目建 workspace：全部建**

18 个 workspace 都建；有数据的项目都迁。

**D4. 现有项目规则怎么进 DSH：B**

全部转成 pending proposal，逐条审核。

粒度：**按 `##` 章节一条提案，不按每个 bullet 一条**。6 个项目规则文件共 23 个 `##` 章节，预计 23 条项目规则提案；memory 规则另行逐条处理。

**D6. 现有 41 turns / default-workspace：A**

继续留在 `default-workspace`。

**D8. 破坏性操作：授权**

- 9 个 `.venv`：旧 venv 改名保留，再重建。
- 有未提交改动的 git 仓库：只备份，不自动 commit。
- 旧 MIND hooks：阶段 1 继续运行，不退役。

### 已确认：D5 / D7

**D5. Claude memory 的分类（已确认）**

已逐项确认：

| 记忆文件 | 建议去向 |
|---|---|
| `test-flow-and-operation-matrix` | OASIS 项目规则（已定） |
| `important-research-do-it-yourself` | 行为规范（已定）：发散 brainstorm 可多子代理；技术选型/框架评估这类收敛性重要调研由主代理做，判断和结论不下放 |
| `small-bugs-just-fix` | 丢弃（已定）：保留现行 ⑦-A，不引入“小 bug 直接修”的例外 |
| `architecture-principles` | 丢弃（已定）：通用架构部分已被编程规范覆盖，审计立场不单独迁移 |
| `commit-convention` | 丢弃（已定）：项目已归档，按全局 Git 规范走 |
| `browser-probe-skill-install` | 不迁：skill 已在 DSH/Claude 生效；只把“移动仓库后重建 symlink”写进迁移操作清单，旧记忆删/归档 |
| `mimo-pricing-source` | 丢弃（已定）：价格有时效性，以后用时再查官方价 |
| `siliconflow-api-key` | 丢弃（已定）：全局规范已覆盖密钥从环境变量读取 |
| `tfs-pat-env-file` | XuanYi 项目规则（已定） |
| `mind-migration-global-first` | 迁移完成后删（已确认） |

**D7. 兼容 symlink 范围：A（已确认）**

symlink 是文件系统快捷方式：旧路径 `/.../Memory Plugin` 变成一个链接，指向新路径 `/.../Opensource/MIND-for-Claude`。旧 hooks 仍按旧路径找文件，实际读到新位置；验证完再删链接。

已确认：所有移动过的项目都留临时 symlink，验证后删。

### 默认执行，不需要决策

- DSH 新库、迁移中间库统一命名 `mind.db`。
- 旧 Claude 源库阶段 1 保留 `nailong.db`。
- 旧 MIND 元数据（registry/preferences/proposals）随旧库归档，不直接导入 DSH。
- 迁移脚本用 Python，独立于 Claude/DSH 进程，从 `/tmp` 启动。
- 当前 Claude 会话不直接移动 `Memory Plugin`。

## 8. 执行状态（2026-10-24）

### 已完成

- Stage 1a：9 个项目移入 `Archived/`，`SHUOSC` 移入 `Opensource/`。
- Stage 1b：`Memory Plugin` → `Opensource/MIND-for-Claude`；Claude hooks、skill symlink、`projects.json` 已更新。
- Stage 1c：`MIND-for-DSH` → `Opensource/MIND-for-DSH`；DSH profile link 已更新，DSH 已后台重启。
- 9 个开发 venv 已重建，旧 venv 保留，`uv pip check` 全部通过。
- MIND-for-Claude 验证：
  - 30 个 inject hook 全部 rc=0。
  - 各段字符数低于 10K；dailies/monthlies 已拆成两段。
  - 新项目 slug 已注册，项目注入恢复。
  - 测试 83 passed / 0 failed。
  - dashboard 已从新路径重启，8765 返回 200。
- 4 个问题已修：slug 注册、dailies 超限、monthlies 超限、rename 测试归档目录。
- 18 个 MIND workspace 已创建，加上 `default-workspace` 共 19 个；映射写入 `.migration/2026-10-24/workspace-map.json`。
- DSH 原生 `~/.dsh/storages/workspace.json` 也已补入同样的 18 个 workspace，共 19 条；已重启 DSH 加载。
- 另加 3 个父工作区 `Archived`、`GameExpert`、`Opensource`，用于 DSH 的「按工作区树」分组；两套注册表现在各 22 条。
- 6 个项目规则文件的 23 个 `##` 章节已导入为 pending 提案，按 workspace 分配；导入报告在 `.migration/2026-10-24/project-rule-import.json`。
- 3 条 memory 条目：`test-flow` 和 `tfs` 已生成 2 条 pending 提案；`important-research` 已并入 `behavior-standards.md`（Claude 与 DSH 两份一致）。
- 历史迁移完成：20,757 个 legacy turn、400,031 个 event；DSH 总计 20,799 turns / 401,855 events；17 个 workspace 有旧数据；raw 文件 20,757 个；289 个 day index、34 个月报；2C 丢弃 GOAI/Desktop/nailong 共 774 turn / 10,029 message；日报/月报按 A 合并。

### 已修复

- `config.json` 的 `inject.global_folders` 已从 `["exps"]` 改为 `[]`。backend/database/frontend/cross-cutting 正文不再每轮注入；`exps-index.md` 仍注入，正文按需 Read。
- global pack 4–24 为空，21 个空 hook，暂保留。
- dailies/monthlies 拆包后各有两段同名标题，内容不重复，暂保留。

### 2026-10-25：摘要恢复与旧数据重排事故

- 摘要恢复默认开启（`summarizeEnabled=true`）。当天 28 个 turn 全部补出 `current` 摘要。
- `requeueSummaryFailures()` 收窄：只重排 `state IN ('dead','failed')` 且 `turn_index.status='unsummarized'` 的任务，不再无差别重排。
- 关闭摘要时新 turn 的标记从 `invalid` 改为 `unsummarized`：关掉只是暂停，重开能补；迁移数据仍用 `invalid`，永不补。
- **事故**：迁移把 376 条无摘要的旧 turn（9-24 / 9-25 / 9-26）写成 `unsummarized`，两次重启后被逐批重排为 pending，共约 380 条开始调用模型。处理：全部改 `invalid`、`capture_job` 置 `done`；约定见 §3.3.1。
- 快照段序改为「项目规则 → 月报 → 日报 → turns → 时间轴 → 日期」，日期与时间轴移到最末，避免每天变化作废前面几万字缓存。
- 快照缓存 key 加入 `ruleStamp`（规则条数 + 最新更新时间 + 版本和），批准规则后同一会话下一轮即生效。
- 监听 `compaction/end`（无 error）与 `compaction/prune`，命中即清该 session 的快照缓存，下一轮重拍；压缩失败不重拍。
- 测试 127/127 通过。

## 9. 后续步骤

1. ~~决定并处理 exps 正文注入问题~~（已完成：只注入 exps-index，正文按需 Read）。
2. 建立 18 个 DSH workspace，并确认每个 workspace 的路径和显示名。
3. ~~按 D4-B 把 6 个项目规则文件的 23 个 `##` 章节转成 pending 提案~~（已完成）。
4. ~~处理 D5 中仍需迁移的少量条目~~（已完成：test-flow、tfs 已生成 pending；important-research 已并入行为规范）。
5. ~~按 D1-A 把旧 MIND 历史迁入 DSH~~（已完成）：
   - 20,757 个 legacy turn、400,031 个 event；
   - raw 文件与 events JSONL 各 20,757 个；
   - 289 个 day index、34 个月报；
   - 2C 丢弃 GOAI/Desktop/nailong；
   - 日报/月报按 A 合并。
6. 处理旧库中没有当前项目归属的数据：GOAI、Desktop 一次性项目、nailong-doctor-system。
7. 迁移/核对各项目的 Claude memory key（新 slug 已补，旧 key 保留）。
8. 验证 DSH：workspace 选择器、规则注入、`mind_read_turn`、`mind_search`、`mind_remember`、提案审核、时间线/日/周/月视图。
9. 重启 DSH / Claude，做一次完整验收。
10. 最后删除旧路径兼容 symlink。
11. 阶段 2（可延后）：`nailong.db → mind.db`、全面去硬编码、GitHub 仓库改名、旧 MIND hooks 收尾。
12. Git/版本收尾：确认 ARCHITECTURE/CHANGELOG，再决定 commit 和版本号。
