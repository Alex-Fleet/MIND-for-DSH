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

## 安装方式与运维

日常安装用 **GitHub 包**：profile 里记的是 `github:Alex-Fleet/MIND-for-DSH#<commit>`，`node_modules/mind-dsh` 是一份拷贝，和仓库路径无关。装/卸别的插件、移动仓库、重启都不会影响它。更新时用插件管理器添加新 commit；它会询问是否允许 `prepare` 构建，允许后自动写 `allowBuilds`。不建议绕过插件管理器直接用裸 `pnpm add`。

开发时用 `link:` 指向工作目录（改动即时生效）。这份安装会随仓库路径变化，移动仓库或装/卸插件后要跑一次自检。

```sh
npm run doctor          # 只读检查
npm run doctor -- --fix # 只对 link 安装重链；同时修 bundle 列表与 lockfile
```

`doctor` 同时认两种安装：`link:` 安装检查链接是否指向当前仓库；GitHub/npm 包安装检查拷贝的包名、版本和 `dsh.bundle.patch`。非 `desktop` profile 用 `--profile=<name>`。

故障排查：更新/重启后「记忆」页消失、没有 `<mind_memory>` 注入、时间线停止增长——先跑 `npm run doctor`。link 安装被旧路径打断时，`--fix` 会重链并修正 lockfile，然后重启；包安装缺文件时，用插件管理器重装同一个 commit。

## 开发

```sh
npm install
npm run typecheck   # host + client
npm test
npm run build       # tsc + esbuild client bundle -> lib/
```
