# MIND for DSH

把 [MIND](https://github.com/Alex-Fleet/MIND) 的记忆系统迁到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）上的原生插件。

目标不是"照搬"，而是把两边最好的部分合成一个：

- **MIND**：按时间分层的渐进式披露（turn → 日 → 周/月），让模型知道历史里有什么
- **Aik358/dsh-auto-memory**：原文全存 + 目录索引 + 按需下钻 + 宿主触发的自动捕获
- **两边都没有**：工作区身份追踪（文件夹改名/移动后记忆自动跟随）

> 状态：核心记忆层与 Web UI 已实现，等待 UI 验收。

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
| 当前 | 项目笔记 / 白板 / 用户规则 / 规则；点击进入结构化编辑（标题 / 类型 / 内容 / 启停），内容支持 Markdown 预览 |
| 工作区 | 身份、当前路径、inode、置信度；可复制 workspace id |
| 提案 | 待审用户规则；批准后进入「当前」并参与下一轮注入 |
| 设置 | 捕获/注入开关、MIND 根目录、规范目录、统计 |

模型侧另有两个工具：`mind_read_turn`（按字符分块读原文）与 `mind_search`（FTS5 检索，CJK 回退到 LIKE）。

## 数据

默认根目录 `$DSH_HOME/mind`：

- `mind.db` — SQLite（WAL），turns / 索引 / 工作区身份 / 提案 / 设置
- `projects/<workspace-id>/turns/<date>/*.md` — 可读原始 turn，硬换行 800 字符
- `projects/<workspace-id>/turns/<date>/*.events.jsonl` — 该 turn 的完整事件 payload（system/attempt/tool 等）
- `projects/<workspace-id>/index/`、`days/`、`weeks/`、`months/` — 机器索引与可读指针视图
- `settings.json` — UI 开关的持久化覆盖

## 可靠性 / 安全 / 时间

- 摘要失败**永不终止**：5s → 15s → 1m → 5m → 15m → 30m，之后每 30 分钟重试；启动时自动重排失败任务。
- 每轮落盘即在同一事务写入 fallback 索引；摘要失败也不会让时间线/FTS 丢 turn。
- 启动时从 DSH 持久会话找回未闭合 turn，并扫描孤儿 raw 文件补数据库行。
- 时间统一按北京时间（UTC+8），日界 04:00。
- MIND 根目录 0700、文件 0600；摘要/提案/快照/增量/工具输出会脱敏处理。
- 规范文件（`global/standards/`）尚未随插件提供，留到迁移阶段处理。

## 配置

`cordis.patch.yml` 里的 `info` row 接受：`mindRoot`、`captureEnabled`、`injectEnabled`、`uiEnabled`、`standardsDir`、`dayBoundaryMinutes`、`workerIntervalMs` 等。UI 里改的两个开关会写入 `settings.json`，重启后仍然生效。

## 开发

```sh
npm install
npm run typecheck   # host + client
npm test
npm run build       # tsc + esbuild client bundle -> lib/
```
