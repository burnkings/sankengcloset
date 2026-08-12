# Phase 0 — 只读盘点报告（Design System V3 基线）

- 日期：2026-08-12
- 分支：`agent/design-system-v3-docs-cleanup-20260812`
- 基线：`agent/upload-current-fix-20260806` @ `5458f14`（本地 = 远端 origin 最新 HEAD，创建前已 `git fetch --prune` 核对）
- 工作区：干净（无未提交改动）
- 性质：纯只读盘点，未修改任何文件

## 1. Git 状态

| 项 | 值 |
|---|---|
| 基线分支本地 HEAD | `5458f14 fix: 订单导入闭环 — 金额单位统一为分 + 保存防重复 + Mock 不伪造 OCR` |
| 基线分支远端 HEAD | `5458f14`（与本地一致） |
| 目标分支 | `agent/design-system-v3-docs-cleanup-20260812`（新创建，指向 5458f14） |
| git status | clean |

## 2. pages.json 路由（27 个页面）

一级 Tab（5 个，APP 与 MP-WEIXIN 条件编译双份 tabBar，内容一致）：
`首页 pages/home/index`、`发现 pages/discover/index`、`收藏 pages/favorites/index`、`圈子 pages/community/index`、`我的 pages/profile/index`

| 分组 | 页面 |
|---|---|
| 首页/发现/收藏/圈子/我的 | home/index, discover/index, favorites/index, community/index, community/mine, profile/index |
| 通知/搜索 | notification/index, search/index |
| 分享/内容 | share/create, editorial/detail |
| 商品 | product/detail |
| 衣橱 | wardrobe/index, wardrobe/edit |
| 预算 | budget/index |
| 购买 | purchase/index, purchase/detail, purchase/edit, purchase/import |
| 心愿 | wishlist/index, wishlist/detail, wishlist/edit |
| 提醒 | reminder/index, reminder/edit |
| 偏好 | preferences/index, preferences/appearance, preferences/notification |
| 关于 | about/index, about/legal |

- 已注册页面全部有对应 .uvue 文件；无注册了但缺文件的页面。
- **`pages/dev/` 5 个页面全部未注册**：device-diagnostics.uvue (378行)、feed-spike.uvue (376行)、page-playground.uvue (314行)、ui-playground.uvue (395行)、v2-visual-lab.uvue (216行)，共 1679 行，均被 git 跟踪。
- `pages/ai/` 目录已不存在（仅旧文档与 unpackage 缓存残留提及）。

## 3. 目录与引用关系

### 3.1 theme/（19 文件）

- `theme/index.uts` 统一导出：tokens/{colors,typography,spacing,radius,shadow,z-index,animation} + layout/{flex,grid,spacing} + use-theme
- **`theme/components/`（index/hero/card/toolbar 4 文件）未被任何代码引用** — `theme/index.uts` 不导出它；全库 grep 仅命中各文件自身 doc comment 中的示例 import。纯死代码。
- theme/* 的消费者：App.uvue、全部 20 个 components/**、全部 pages/**（含 dev 页）。

### 3.2 components/（38 文件）

- base/ 14 文件、business/ 2 文件、layout/ 4 文件、v2/ 13 文件
- **components/v2/** 全部 13 个组件均有活跃消费者**（页面引用数）：V2CapsuleFilter(6)、V2SectionHeader(6)、V2ListGroup(5)、V2StatsCard(5)、V2ListRow(4)、V2PageHeader(4)、V2ProductCard(4)、V2Segmented(4)、V2StatusChip(4)、V2FormSection(2)、V2DatePicker(1)、V2HorizontalTabs(1)、V2Switch(1)；共 23 个页面 import components/v2/*

### 3.3 stores / services / domain / presentation

- stores/ 12 文件：ai-import, budget, content-library, home-feed, notification-center, preferences, purchase, reminder, session, sync, wardrobe, wishlist
- services/ 9 文件：ai/{ai-import,purchase-import,wardrobe-compatibility}、content/{feed,product,search}、platform/api-client、sync/local-sync-queue、user-data/user-data-service
- domain/ 13 文件 + domain/ai、domain/content、domain/notification、domain/platform、domain/repositories、domain/sync 子目录
- presentation/content/feed-presenter.uts
- AI 能力挂载点（均为真实情境入口，与 V3 基线一致）：pages/home（衣橱搭配度）、pages/product/detail、pages/purchase/edit、pages/purchase/import（订单导入）；无独立 AI 一级入口。

### 3.4 scripts/（8 文件）

build-mp-weixin.ps1、check.js、check-uts-compile.js、check-v24-remote-runtime.js、check-v25-android-beta.js、gen-tabbar-icons.py、patch-vendor.py（mp-weixin 编译后 vendor 补丁，见记忆）、upload.js（上传发布）。均被 docs/ 各 runbook 文档引用。

## 4. Markdown 文件位置（26 个，排除 node_modules）

- 根目录（9）：README.md、PRODUCT-V2-BASELINE-REPORT.md、Product-V2-Gate0-Visual-Rebuild-Report.md、Product-V2-Phase-0-Technical-Spike-Report.md、Product-V2-Phase-1A/1B/1B.1/1C-Report.md、Product-V2-Responsive-Visual-System-Report.md、三坑绮橱-Product-V2-产品蓝图.md
- docs/architecture/（3）：V2.1-DATA-CONTRACT、V2.2-AI-IMPORT-CONTRACT、V2.3-BACKEND-RUNBOOK
- docs/design/（1）：DESIGN-LANGUAGE-V2.md
- docs/product/（5）：V2.0-DELIVERY-PLAN、V2.1-BACKEND-READY-PLAN、V2.2-AI-ASSISTED-IMPORT-PLAN、V2.4-REMOTE-RUNTIME-PLAN、V2.5-ANDROID-BETA-RUNBOOK
- docs/reports/（6）：DEVICE-DIAGNOSIS、DEVICE-NETWORK-AUDIT、Product-V2-Phase-1C-Manual-QA、V2.5-ANCESTRY-INTEGRITY-REPAIR、V2-STYLE-FAILURE-AUDIT、V2-VISUAL-CONSISTENCY-REPORT
- docs/ 根（2）：debug-fix-plan-2026-08-04.md、white-screen-analysis.md
- 内部计划（2，git 跟踪）：.hermes/plans/2026-07-26_020500-v2-5-production-integration.md（**.hermes/ 未被 .gitignore 覆盖**）、.hbuilderx/uni-agent/plans/1784540220562-nimble-nebula.md（.hbuilderx/ 已被忽略，此文件未跟踪）

## 5. 指定文件的实际引用核查

| 文件 | 实际引用 | 结论 |
|---|---|---|
| docs/design/DESIGN-LANGUAGE-V2.md | 仅 Product-V2-Phase-1C-Report.md:31 的历史移动记录（根目录→docs/design/）；无任何代码引用 | 无活跃引用 |
| Product-V2-Gate0-Visual-Rebuild-Report.md（根） | 全库 0 引用 | 无活跃引用 |
| Product-V2-Responsive-Visual-System-Report.md（根） | 全库 0 引用 | 无活跃引用 |
| pages/dev/v2-visual-lab.uvue | 未注册 pages.json；仅 docs/debug-fix-plan-2026-08-04.md:54 提及 | 死页面（5 个 dev 页同） |
| backend/Dockerfile | 全库 0 引用；与后端仓库（sankengcloset_service/Dockerfile）内容**不同**（npmmirror registry + npm ci vs npm install --maxsockets=2） | 前端仓库内的过期变体 |
| backend/run-docker.sh | 全库 0 引用；后端仓库无此文件；脚本路径指向 /home/admin/projects/sankengcloset/backend（本仓库），引用了不存在的 .env.production | 死脚本 |
| theme/components/hero.uts | 0 引用（仅自身 doc comment） | 死代码 |
| theme/components/card.uts | 0 引用（仅自身 doc comment） | 死代码 |
| theme/components/toolbar.uts | 0 引用（仅自身 doc comment） | 死代码 |
| components/v2/** | 13 组件全部活跃，23 页面引用 | 活跃，保留 |

## 6. 安全基线核查（硬性规则）

- .gitignore 已覆盖：unpackage/、dist/、node_modules/、.hbuilderx/、*.key/*.pem/*.keystore/*.jks、.env/.env.*
- git 跟踪中：无 .env、无 unpackage/、无 dist/、无 keystore（release.keystore 已被忽略）
- 注意：**.hermes/plans/ 下 1 个文件被跟踪且 .hermes/ 未在 .gitignore**（待后续阶段决定处理）

## 7. 阻塞项

**DESIGN-SYSTEM-V3.md 全文未提供**：仓库 worktree 无、git 全历史无、本对话未附带正文、/home/ 与 /home/admin 无、历史会话 0 命中。
按硬性规则「如果无法读取新版设计稿，停止并报告，不得自行编造另一套设计规范」，本阶段不写入 V3 设计稿。待用户提供全文后执行「一、唯一设计基线」写入 `docs/design/DESIGN-SYSTEM-V3.md` 并独立提交。
