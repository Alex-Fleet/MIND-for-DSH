# MIND for DSH

把 [MIND](https://github.com/Alex-Fleet/MIND) 的记忆系统迁到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）上的原生插件。

目标不是"照搬"，而是把两边最好的部分合成一个：

- **MIND**：按时间分层的渐进式披露（turn → 日 → 周/月），让模型知道历史里有什么
- **Aik358/dsh-auto-memory**：原文全存 + 目录索引 + 按需下钻 + 宿主触发的自动捕获
- **两边都没有**：工作区身份追踪（文件夹改名/移动后记忆自动跟随）

> 状态：设计阶段。实现前先过独立子代理的对抗性审查。

设计文档：[docs/DESIGN.md](docs/DESIGN.md)

## 一句话

> 原文全存，摘要只做带地址的索引；模型先看时间轴和当前认知，再按需下钻到原文。
