# MIND for DSH

把 [MIND](https://github.com/Alex-Fleet/MIND) 的记忆系统迁到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）上的原生插件。

目标不是"照搬"，而是把两边最好的部分合成一个：

- **MIND**：按时间分层的渐进式披露（turn → 日 → 月），让模型知道历史里有什么
- **Aik358/dsh-auto-memory**：原文全存 + 目录索引 + 按需下钻 + 宿主触发的自动捕获
- **两边都没有**：工作区身份追踪（文件夹改名/移动后记忆自动跟随）

> 状态：核心记忆层与 Web UI 已实现并通过验收（2026-10-28，阶段一收口）。
> 迁移遗留与实现偏差集中记录在 [docs/known-issues-2026-10-29.md](docs/known-issues-2026-10-29.md)：重复 turn 已停止新增（2026-10-29 去重闸门），历史重复行待清理；其余迁移遗留只记录、不修复，实现偏差记录、待排期。
> MIND-for-Claude 的清理（旧库改名、去硬编码、symlink 等）由用户自行维护，不属于本仓库。

设计文档：[docs/DESIGN.md](docs/DESIGN.md) · UI 设计：[docs/UI-DESIGN.md](docs/UI-DESIGN.md) · 架构：[ARCHITECTURE.md](ARCHITECTURE.md)

## 一句话

> 原文全存，摘要只做带地址的索引；模型先看时间轴和当前认知，再按需下钻到原文。

## 安装

```sh
# 本地目录（开发）
dsh plugin --profile web add /absolute/path/to/MIND-for-DSH

# 桌面端
# Plugins → Add plugin → 填本地绝对路径或 npm 包名
```

插件包声明了 `dsh.bundle.patch`，安装后 bundle 会出现在 profile 的 `dsh.profile.bundles` 里。

## 使用

左侧栏「自动化任务」下方新增「记忆」入口，右侧整个区域是 MIND UI：

| 页 | 内容 |
|---|---|
| 时间线 | 按天倒序；keyset 分页 + 虚拟滚动；点开看当天 turns，再点开看原文分块 |
| 报告 | 按工作区查看月报（Markdown 渲染）；周报已停止生成，历史文件只读保留 |
| 规则 | 已批准的项目级长期规则；点击进入结构化编辑（标题 / 项目 / 内容 / 启停），内容支持 Markdown 预览 |
| 工作区 | 身份、当前路径、inode、置信度；可复制 workspace id |
| 提案 | 待审项目规则；批准后进入「规则」并参与下一轮注入 |
| 设置 | 捕获/注入开关、MIND 根目录、规范目录、统计 |

模型侧另有三个工具：`mind_read_turn`（按字符分块读原文）、`mind_search`（FTS5 检索，CJK 回退到 LIKE）、`mind_remember`（把长期规则写成待审提案，不直接生效）。

## 数据

默认根目录 `$DSH_HOME/mind`：

- `mind.db` — SQLite（WAL），turns / 索引 / 工作区身份 / 提案 / 设置
- `projects/<workspace-id>/turns/<date>/*.md` — 可读原始 turn，硬换行 800 字符
- `projects/<workspace-id>/turns/<date>/*.events.jsonl` — 该 turn 的完整事件 payload（system/attempt/tool 等）
- `projects/<workspace-id>/index/`、`days/`、`months/` — 机器索引与可读指针视图（`weeks/` 是历史遗留，不再生成）
- `settings.json` — UI 开关的持久化覆盖

> 迁移进来的 legacy turn 是例外：约 71% 的 `.md` 是旧 MIND 的摘要记录，不是对话转录；完整原始事件仍在同名 `.events.jsonl` 里。见 [docs/known-issues-2026-10-29.md](docs/known-issues-2026-10-29.md) A2。

## 可靠性 / 安全 / 时间

- 摘要失败**永不终止**：5s → 15s → 1m → 5m → 15m → 30m，之后每 30 分钟重试；启动时自动重排失败任务。
- 每轮落盘即在同一事务写入 fallback 索引；摘要失败也不会让时间线/FTS 丢 turn。
- 启动时从 DSH 持久会话找回未闭合 turn，并扫描孤儿 raw 文件补数据库行。
- 时间统一按北京时间（UTC+8），日界 04:00。
- MIND 根目录 0700、文件 0600；摘要/提案/快照/增量/工具输出会脱敏处理。
- 规范文件（`behavior-standards.md`、`programming-standards.md`、`checklists-index.md`、`exps-index.md`、`user-profile.md`）不入仓库（含个人信息），部署在 `$DSH_HOME/mind/global/standards/`；插件按 mtime 热读，改完下一轮生效。

## 配置

`cordis.patch.yml` 的 `config` 接受：`mindRoot`、`captureEnabled`、`injectEnabled`、`uiEnabled`、`standardsDir`、`dayBoundaryMinutes`、`workerIntervalMs`、`summarizeEnabled`、`turnSummaryChars`、`summaryProvider`、`summaryModel` 等。UI 里只暴露捕获/注入两个开关并写入 `settings.json`；摘要开关与预算按用户决定只走配置文件（改动成本本身是保护）。

## 运维：更新 DSH、移动仓库或装卸插件之后

`mind-dsh` 以 `link:` 方式装进 profile，解析结果记在 profile 的 `pnpm-lock.yaml` 里。**仓库路径变了而 lockfile 没跟着改**时，下一次 `pnpm add`（装/卸任何插件都会触发）会把 `node_modules/mind-dsh` 重链到旧路径；DSH 插件管理器发现解析不到 `dsh.bundle`，会静默把它从 `dsh.profile.bundles` 里剔除——但运行中的进程还留着已加载的模块，所以要到下次重启才暴露。

症状：更新/重启后「记忆」页消失、没有 `<mind_memory>` 注入、时间线停止增长。

检查与修复：

```sh
npm run doctor          # 只读：检查 bundle 条目、链接、lockfile、构建新鲜度
npm run doctor -- --fix # 修复链接 / bundle 列表 / lockfile（自动备份）
```

修复后重启 DSH，再跑一次 `npm run doctor` 确认 `RESULT: healthy`。非 `desktop` profile 用 `--profile=<name>`。移动仓库时，`package.json` 和 `pnpm-lock.yaml` 必须同时更新——`--fix` 能修 lockfile，但不会替你移动仓库。

## 开发

```sh
npm install
npm run typecheck   # host + client
npm test
npm run build       # tsc + esbuild client bundle -> lib/
```
