# 三坑绮橱文档索引

本目录存放当前开发阶段需要提交到仓库、供 Work 与 Hermes 云端执行环境读取的项目文档。

> 当前远程 main：`033892822c42e94e33225d400da4b94885fe93b3`（2026-08-13 07:55，「fix: 首页瀑布流 + 外观/提醒/搜索修复」）
> V3 全量审计修复分支：`agent/v3-audit-fixes-20260813`（含 P0 门禁修复 / 首页混合 Feed / 深色模式 computed 化 / 外观三态恢复 / 补充门禁）

## 当前生效文档

- [当前产品方向](product/PRODUCT-DIRECTION-CURRENT.md)：唯一生效的产品定位、首页 Feed 基线、Mock 内测边界与 AI 能力优先级。
- [Design System V3](design/DESIGN-SYSTEM-V3.md)：唯一生效的视觉、页面布局与交互规范（**DESIGN-LANGUAGE-V2 已删除归档，不恢复为当前规范**）。
- [Hermes UI V3 执行提示词](operations/agent-prompts/HERMES-UI-V3-EXECUTION-PROMPT.md)：按 Phase 0—Phase 6 执行全局 UI V3 改造。
- [2026-08-12 项目接管提示词](operations/agent-prompts/PROJECT-HANDOFF-2026-08-12.md)：当前产品定位、技术边界、远程仓库状态和只读接管审计要求。

## 架构与运行手册

- 架构契约：[architecture/V2.1-DATA-CONTRACT.md](architecture/V2.1-DATA-CONTRACT.md)、[architecture/V2.2-AI-IMPORT-CONTRACT.md](architecture/V2.2-AI-IMPORT-CONTRACT.md)、[architecture/V2.3-BACKEND-RUNBOOK.md](architecture/V2.3-BACKEND-RUNBOOK.md)
- 运行手册：[operations/ANDROID-BETA-RUNBOOK.md](operations/ANDROID-BETA-RUNBOOK.md)、[operations/REMOTE-RUNTIME-RUNBOOK.md](operations/REMOTE-RUNTIME-RUNBOOK.md)
- 报告：[reports/README.md](reports/README.md)（当前报告 + archive/2026-07/ 历史归档）

## 产品文档归档

- 历史产品计划（V2.0/V2.1/V2.2 交付计划、V2 原始蓝图）已归档至 `product/archive/`，仅供历史追溯，不具备当前设计决策权。
- 注：PRD-V1 与 Product Review 2.0 两份文档在仓库全部历史、所有远程分支与本地备份中均未找到，暂无法归档；若用户提供原件，应放入 `product/archive/`。

## 使用规则

1. 先以当前远程代码、提交、CI 和真实验证结果为准。
2. V3 文档与 PRODUCT-DIRECTION-CURRENT.md 是当前唯一真源；旧版产品和设计报告只可用于历史追溯，不具备当前设计决策权。
3. 不恢复 Dashboard、首页统计、快捷入口、“坑向分类”或纯衣橱管理首页。
4. 不修改 `main` 直接推送，不 force push，不提交密钥、构建产物或临时文件（开发走 agent/* 分支 + PR）。
5. 文档提交本身不代表 UI 已经完成；必须以 Hermes 的实际提交和验证回执为准。

## 目录约定

后续文档按用途放置：

- `docs/product/`：当前产品方向与产品决策；历史计划进 `archive/`。
- `docs/design/`：当前视觉与交互规范。
- `docs/architecture/`：数据、接口和架构契约。
- `docs/operations/`：运行手册、接管提示词和执行记录。
- `docs/reports/`：验证报告；历史报告进入 `archive/2026-07/`。
