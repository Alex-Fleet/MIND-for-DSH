# 架构

MIND for DSH 是一个双面 Cordis 插件：Host 面负责捕获、存储、索引、注入与 HTTP API；Client 面只负责渲染和编辑。

## 模块边界

| 模块 | 职责 | 明确不做 |
|---|---|---|
| `src/capture/` | 从 `session/event` 缓冲 turn，渲染原始 Markdown，落盘并登记 `capture_job` | 不调用模型、不做摘要 |
| `src/summarize/` | 直接调用 `ctx.llm.stream` 生成结构化摘要 | 不读历史、不派生 subagent |
| `src/db/` | SQLite schema 与全部读写；WAL、事务、keyset 分页 | 不拼 Markdown 视图 |
| `src/views/` | 由 turn 索引重建日/周/月 Markdown 指针视图 | 不压缩原文、不再摘要 |
| `src/inject/` | 静态规范段、低频快照、每轮增量 | 不读原始 turn 正文 |
| `src/identity/` | `(volume UUID, inode)` 主键、标记与 git 回退、复制分叉 | 不常驻监听文件系统 |
| `src/tools/` | `mind_read_turn`、`mind_search` | 不暴露写操作 |
| `src/ui/` | 受 DSH 认证保护的 `/api/mind.*` 精确 Fetch 路由 | 不提供全量历史接口 |
| `src/client/` | 侧栏入口、主面板、分页虚拟列表、B+ 规则编辑器 | 不缓存全量列表、不做搜索框 |

## 数据流

```text
session/event
  └─ TurnBuffer ──(turn/end)──> CaptureWorker.ingest
                                 ├─ 原始 Markdown + 全量事件 JSONL（同步落盘、fsync）
                                 ├─ 单事务：turns + turn_events + capture_job + fallback index
                                 ├─ day_index 轻量刷新（全量视图由摘要/启动补偿重建）
                                 └─ drain
                                     ├─ llm.stream -> turn_index（升级 fallback）
                                     ├─ durable project -> cognition_entry
                                     ├─ durable user    -> memory_proposal
                                     └─ day/week/month 指针视图

启动
  ├─ sessionPersistence：找回未闭合 turn（turn/start 无 turn/end）
  ├─ 扫描孤儿 raw Markdown，补数据库行
  ├─ 回填缺失索引、重建漂移的日视图
  └─ 重排 dead/failed/pending 的摘要任务

agent/pre-step
  ├─ 静态规范段（systemPrompt.section，缓存友好）
  └─ 每轮增量（createUserMessage，<200 字符）

UI (Client)
  └─ fetch('/api/mind.*')
       └─ Connection 精确路由（仅 owner Peer）
            └─ handleUiRequest -> Store
```

## 关键不变量

1. **原文全量保留**：`projects/.../turns/*.md` 是可读原文；同名 `.events.jsonl` 保存每个 session 事件的完整 payload（含 system/message、assistant/attempt、工具结果等）。两者都是本地事实源。
2. **摘要只做索引**：`turn_index` 存标题、一句结论、主题和原始路径；不生成摘要的摘要。
3. **摘要是增强，不是入口**：每个 turn 落盘时在**同一事务**里写入 fallback 索引（用户首行 preview，`status='unsummarized'`），并轻量刷新 `day_index`；LLM 摘要成功后再升级为 `current`。摘要失败不会让 turn 从时间线/FTS 消失。
4. **摘要重试没有终点**：失败按 5s → 15s → 1m → 5m → 15m → 30m 退避，之后每 30 分钟一次，永不标记 dead；启动时重排 dead/failed/pending，并回填缺失索引与视图。
5. **崩溃恢复**：启动时通过 `sessionPersistence` 扫描持久会话，找回未闭合的 `turn/start`；同时扫描孤儿 raw 文件补齐数据库行。摘要流有硬超时，过期租约由周期任务回收。
6. **日报/周报/月报是确定性指针视图**：由 `turns` + `day_index` 生成，不调用 LLM，因此不受摘要失败影响。若将来加入 LLM 周期总结，必须复用同一重试队列。
7. **时间统一北京时间**：所有本地日期/时间按 UTC+8、04:00 日界计算；ISO 时间只作为机器存储格式。
8. **没有全量接口**：时间线 keyset 分页（50/页），当前/提案有上限，原文按 20K 字符分块。
9. **注入分层**：静态规范命中前缀缓存；动态快照只在内容变化时进入历史；每轮增量单独一条；快照按节预算，时间轴与闭合标签永不裁剪。
10. **工作区身份不依赖路径**：路径只是位置；身份由 inode / 标记 / git 回退确定；快照按当前会话的工作区解析。
11. **安全边界**：MIND 根目录 0700、文件 0600；摘要/提案/快照/增量/工具输出统一脱敏；UI 写路径最小（条目编辑、提案审核、两个开关）。

## Schema

`SCHEMA_VERSION = 4`：

- v2：`cognition_entry.enabled`、`app_setting`
- v3：`turns.provider` / `turns.model`
- v4：`turns.raw_events_rel_path` / `turns.raw_chars`

`Store.migrate()` 每次打开都校验并补列，不信任 `user_version`；修复在单个事务内完成，失败则回滚。

## 客户端加载

`package.json` 的 `dsh.client` 声明 `platform: web` 与加载顺序（renderer / sidebar / layout / connection）。`lib/client.js` 是 lazy-CJS 包装：

```js
window.__ModuleLoader__.load({ id: 'mind-dsh', factory: (require) => { ... } })
```

构建用 esbuild 产出 CJS，`react` 与 `react/jsx-runtime` 走平台共享模块。
