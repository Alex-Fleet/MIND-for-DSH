# MIND-for-DSH 已知问题记录（2026-10-29）

- 状态：A1（重复 turn）已于 2026-10-29 加防复发闸门；其余迁移遗留**记录、不修复**；实现偏差**记录、待排期**（非迁移导致）。
- 判据：**迁移产生**且**不影响新对话业务逻辑**的问题，记为历史问题；新对话的捕获 → 摘要 → 日/月视图 → 注入 → 读取已实测正常。
- 范围：只含 MIND-for-DSH。MIND-for-Claude 的旧库改名、去硬编码、GitHub 改名、symlink 清理由用户自行维护，不属于本仓库。
- 本文是记录，不是待办。第 4 节是处置草案与待办清单，**未执行**的部分不会自动发生。

---

## 0. 现状基线

数据截至 2026-10-29 17:15（北京时间，仍在增长）：

| 项 | 值 | 说明 |
|---|---:|---|
| turns | 24,974 | 其中 `legacy` 20,757、`live` 4,217 |
| turn_events | 480,478 | |
| turn_index current | 15,599 | 进入注入的 turns 摘要段 |
| turn_index invalid | 9,350 | 迁移数据，永不补摘要 |
| turn_index unsummarized | 11 | subagent turn，设计上不摘要 |
| day_index / 月报 / 历史周报 | 308 / 35 / 40 | 周报已停止生成，历史文件保留 |
| 工作区 / 活跃 location | 22 / 22 | 无数据的工作区含 3 个父目录 |
| 当前规则 | 27 | 分布在 6 个工作区；待审提案 0 |
| 注入静态段 | 19,415 字符 | 5 个规范文件，约 40 KB UTF-8 |
| 快照体积（实测） | XuanYi 89,006 / OASIS 80,117 / MIND-for-Claude 67,001 / MIND-for-DSH 426 字符 | 用库副本实算 |

运行态：

- 测试 127/127、typecheck（host + client）通过；`lib/` 与源码一致（无源码比 `lib/index.js` 新）。
- 捕获在跑：10-29 当天多个工作区持续产生 turn，摘要正常落 `current`。
- 宿主版本：**17:04:15 之前跑的是旧构建，17:04:19 重载后切到 10-28 构建**。依据：17:03/17:04 仍在写 `weeks/*.md`，而 10-28 构建已无 weekly 写入代码；17:04:19 发生一次插件重载（同一时刻插入 200 条重复行），之后 17:16、17:20 的 turn 都不再写周报。**17:28 又构建了含 A1 去重闸门的 10-29 构建，宿主需再重载一次才会加载。**
- Git：`feature/core` @ `6217f2e`，已建立 `origin/feature/core` 跟踪；本地无 `main`；`package.json` 版本仍是 `0.1.0`。

---

## 1. 迁移遗留（记录，不修）

### A1　重复 turn：3,800 组（**新重复已停止**，历史行待清理）

> **2026-10-29 更新**：`reconcileRawTurns()` 已加闸门——扫描到文件时先按 `raw_rel_path` 判断"是否已有任意 turn 行指向它"，有就跳过（且在读文件之前判断），不再二次 ingest。实测 21,183 个 raw `.md` 全部已有行指向，**闸门生效后该扫描的插入数恒为 0**。128 个测试通过，构建已于 17:28 更新；宿主下次重载后生效。**历史 3,800 条未删**（清理需备份与单独批准）。

**现象**：同一个 raw 文件对应两行——迁移写入的 `legacy-<session>-<seq>` 与后补的 `<session>:<seq>`。

**证据**：

- 这批 legacy 行统一在 `2026-10-24T13:17:11Z` 写入；live 双胞胎在 `13:18:00Z` 出现，相隔 49 秒。
- 10-29 17:04:19–20（约 1 秒）新增 200 条，200 个 raw 路径每个恰好 2 行。
- 当前 3,800 组重复、3,800 条多余行；涉及 OASIS 2,692、XuanYi 705 等 7 个工作区。

**机制**：迁移用 `legacy-<session>-<seq>` 作主键；启动对账 `reconcileRawTurns()`（`src/capture/worker.ts:276`）扫描 `turns/*.md` 时只认 `<session>:<seq>`，发现该 id 不存在就再插一行，每次上限 200。这是"迁移 + 启动对账"共同造成的，不是新对话链路的问题。

**影响**（仅历史日期）：

- `day_index.turn_count` 虚高：132/308 天大于该日唯一 raw 数（样例 XuanYi 2026-10-21：45 vs 39）。
- 展开某天会看到两条同内容记录，其中一条标"未摘要"。
- `mind_search` 会返回重复/无效行（见 B5）。
- 每次插件加载最多触发 200 次额外摘要调用（10-29 那批 200 条中 187 条在几分钟内被摘要为 `current`）。
- 被迁移标记为 `invalid` 的 turn 一旦被二次 ingest，会重新摘要成 `current`，理论上可进入 7 天摘要窗口；当前窗口内 0 条，剩余候选里 10-22～24 有 20 条（都在 MIND-for-Claude），但排在扫描队列后段，按当前速度大概率在进入窗口前已滑出。

**增长上限**：修复前可被二次 ingest 的是"渲染转录"型 legacy 文件，实测 5,992 个；已产生双胞胎 3,800 个，剩余约 2,192 个。**闸门生效后不再增长**，这 2,192 个候选永远不会被插入。

**为什么记录不修**：只影响历史日期的计数/展示/检索；新 turn 走 `<session>:<seq>`，raw 唯一，业务逻辑不受影响。

### A2　legacy "原文"有 71% 是旧系统的摘要卡

**现象**：20,757 个 legacy `.md` 中，14,766 个是旧 MIND 的摘要卡（`## 做了什么 / 关键决策 / 未完成 / 跨会话上下文`），5,991 个才是渲染后的对话转录（`结束原因: legacy_import`）。

**证据**：按文件头分类统计；真原文在 `.events.jsonl` 的 `legacy/message` 记录里（`raw` 字段含 assistant 文本、`tool_use`、`tool_result`），但 `mind_read_turn` 与 UI 只读 `.md`。

**影响**：对约 71% 的历史 turn，"点开原文"看到的是二手摘要；数据没丢，是读取层没有暴露。

### A3　day_index 计数虚高

132/308 天的 `turn_count` 大于该日唯一 raw 文件数，根因同 A1。UI 时间线的 "N turns" 会偏大，不影响当天新增记录。

### A4　旧历史有明确截止时间

MIND-for-Claude 迁入 DSH 的截止是 **2026-10-24 20:58（北京时间）**（见 MIND-for-Claude `docs/work-log-2026-10-25.md`）。旧库 `nailong.db` 仍有 411,849 条 message 记录，最后写入 2026-10-25 14:25；该时间之后在 Claude 侧产生的记忆只在 MIND-for-Claude，不在 DSH。这是设计上的两套独立历史，不是缺口。

### A5　本项目自己的历史挂在隔壁工作区

1,819 条 MIND-for-Claude 记录（含 10-25～10-28 的 42 轮 DSH 开发会话）归属于 `MIND-for-Claude` 工作区；`MIND-for-DSH` 工作区在 10-29 之前是 0 条，从本次会话才开始记录。历史归属是当时 cwd 决定的，新对话归属正确。

### A6　22 个 location 的 confidence 全是 low

迁移写入时统一为 `low`，UI 因此显示"低置信"。实测 22/22 的路径 inode 与库中记录一致，身份解析实际正常，仅显示层误导。

---

## 2. 实现偏差（记录，未修；非迁移导致）

> 这一组不在"迁移遗留不修"的判据内，只是本轮未授权改代码。是否修由后续决定。

### B1　快照缓存 key 不含日期

`src/index.ts:214` 的 key 是 `sessionId:workspaceId:ruleStamp`。会话跨 04:00 日界后不会重拍：日期行、最近 7 天 turns 窗口、21 天日报窗口都停在旧的一天，当天新 turn 只有一行增量兜底。历史会话确有跨天（10-25～10-28 同一会话）。

### B2　"卷 UUID"实际退化为设备号

`src/identity/workspace.ts:159-175` 执行 `diskutil info <工作目录>`，但 `diskutil info` 只接受挂载点，传子目录返回 `Could not find disk`，因此全部退化为 `dev:<设备号>`（当前 `dev:16777230`）。身份实际是 `(设备号, inode)`，同卷改名/移动仍可追踪，跨卷稳定性弱于设计描述。

### B3　工作区 marker 从未写入

`resolveWorkspace(..., { writeMarker: true })` 只有测试调用；生产链路不写 `.mind/workspace-id`。因此"marker"回退层实际不存在，复制/跨卷只剩 git 身份可用。

### B4　subagent turn 永久停在 unsummarized

子代理会话是 raw-only（设计如此），但索引状态保持 `unsummarized`（语义像"等待摘要"）。观测值随新子代理会话在 6～25 之间波动，不进入注入，无功能影响，只是状态语义不精确。

### B5　mind_search 不过滤 status

`src/db/store.ts:1031` 的检索不区分 `current/invalid`，会返回重复与迁移噪音。按用户决定，该工具当前没有使用场景。

### B6　启动时全量 chmod

`src/security/permissions.ts:19` 在插件加载时遍历 `projects/` 下全部文件（实测约 4.3 万个）逐个 chmod。功能正确，但启动成本随历史增长。

### B7　死代码

`DayDetail`、`insertTurnAndJob`、`getWatermark` / `setWatermark`、`rebuildWeekIndex`、`listJobs`、`countTurnEvents` 均无调用方（周报视图移除后 `rebuildWeekIndex` 只剩定义）。

### B8　宿主曾在旧构建上运行（17:04:19 已切换）

17:03/17:04 仍有 `weeks/*.md` 写入，而磁盘构建已移除周报 → 当时运行的是 10-28 之前的代码。17:04:19 插件重载后，17:16、17:20 的 turn 不再写周报，说明新构建已生效；无需再重启。

---

## 3. 仓库卫生

- 本地只有 `feature/core`，没有 `main`；版本仍 `0.1.0`（10-19 起未动）。
- `dummy`（200 KB）是早期调试留下的 SQLite 库（`user_version = 4`），未跟踪。
- CI 用 `actions/checkout@v4` / `setup-node@v4`，未按仓库规范钉 commit SHA。

---

## 4. 将来若要修（只记录方案，未执行）

| 项 | 处置草案 |
|---|---|
| A1 | 防复发**已完成**（2026-10-29，`reconcileRawTurns` 按 `raw_rel_path` 去重）。历史 3,800 条清理待批准：备份 → 删 `legacy-` 双胞胎（保留带摘要的 `<session>:<seq>`）→ 重建 132 天 `day_index` |
| A2 | 读取时按需从 `.events.jsonl` 渲染 legacy 转录，或离线批量转写 `.md`（二选一，需先定数据归属） |
| A3 | 随 A1 一起重建 |
| A6 | 按 inode 命中回填 `confidence='primary'`，或 UI 不再展示该字段 |
| B1 | 快照缓存 key 加 `localDate`（跨日界线自动重拍） |
| B2 | 先解析挂载点（如 `df -P`）再 `diskutil info <mountpoint>` |
| B3 | 显式开关；写入会往用户项目目录加 `.mind/`，需产品决策 |
| B4 | 子代理 turn 落成独立状态（如 `raw-only`），不再复用 `unsummarized` |
| B5 | 检索加 `status='current'` 过滤 |
| B6 | 只给新建文件设权限，或在根目录记录一次"已加固"标记 |
| B7 | 删除死代码 |
| B8 | 已发生：17:04:19 插件重载后切到 10-28 构建，无需操作 |

---

## 5. 复现命令

```sh
# A1：重复 raw 路径
sqlite3 "file:$HOME/.dsh/mind/mind.db?mode=ro" \
  "select count(*), sum(n)-count(*) from (select raw_rel_path, count(*) n from turns group by raw_rel_path having n>1);"

# A3：计数虚高
sqlite3 "file:$HOME/.dsh/mind/mind.db?mode=ro" \
  "select d.local_date, d.turn_count,
          (select count(distinct t.raw_rel_path) from turns t
            where t.workspace_id=d.workspace_id and t.local_date=d.local_date) uniq
     from day_index d
    where d.turn_count >
          (select count(distinct t.raw_rel_path) from turns t
            where t.workspace_id=d.workspace_id and t.local_date=d.local_date)
    limit 10;"

# A2：legacy 文件格式（摘要卡 vs 转录）
grep -l '^## 做了什么' $HOME/.dsh/mind/projects/*/turns/*/legacy-*.md | wc -l

# B8：运行进程是否还在写周报
find $HOME/.dsh/mind/projects -path '*/weeks/*.md' -newermt '2026-10-28' -ls
```
