# Phase 1 Core Loop Gap Report

日期：2026-08-19
基线：4ef9eb3c630cbf6f9a43c340cc2b077afb860682（origin/main）
范围：Feed / Search / Product Detail / Favorite / Release / Reminder / Brand / Discover 收敛

---

## A. 当前真实实现（现状关系图）

```
后端 API（sankengcloset_service，全部真实实现）
├── /api/v1/feed            GET   ✓ 商品流（feed_score 排序 + cursor 分页 + saved 标记）
├── /api/v1/search           GET   ✓ 商品/品牌搜索（ILIKE + 坑向别名）
├── /api/v1/products/:id     GET   ✓ 商品详情（含 images/shopUrl/priceCents）
├── /api/v1/wishlist         POST/GET/PATCH/DELETE ✓ 收藏决策池
│     status 枚举: WISH/WANT/WATCHING/WAIT_RELEASE/WAIT_PRICE/PURCHASED
│     PATCH 仅更新 status；条目含 productId/releaseId/note
├── /api/v1/calendar         GET   ✓ 发售日历（product_releases 表真实事件）★前端未接入
├── /api/v1/events           GET/POST ✓ 发售事件（★前端未接入）
├── /api/v1/brands/follow    POST/DELETE + /brands/followed ✓ 品牌关注
├── /api/v1/trends           GET   ✓ 趋势摘要（★前端 discover 未用此 API）
├── /api/v1/me/* 资产 CRUD   ✓ wardrobe / purchases / reminders / wishes / notifications
└── /api/v1/community/posts  CRUD ✓ 穿搭灵感 Gallery

前端页面
├── 首页 Feed（商品流+频道）→ product/detail ✓ 收藏 ✓
├── 搜索 → product/detail ✓ 收藏 ✓
├── 商品详情：收藏 / 设置提醒 / 记入购买 / 发售进度 / 官方渠道 / 衣橱兼容 ✓
│     注意：发售进度由 badgeText 推导（图透→定金→尾款→现货），非真实 release 数据
├── 收藏页：商品 / 穿搭 / 品牌 / 合集 四 tab
│     商品 = content-library-store → /api/v1/wishlist（仅收藏/取消，无状态流转）
│     合集 = 空占位（"以后可以按场景整理"）
├── 发现页：搜索 / 精选专题 / 品牌目录 / 发售日历 / 趋势话题
│     专题=feed 过滤 FEED_EDITORIAL（后端不产→空）
│     日历=feed 过滤 FEED_RELEASE_EVENT（后端不产→空）★P0
│     话题=feed 过滤 FEED_AI_RECOMMENDATION/OUTFIT（后端不产→空）
├── 品牌目录 brand/index + brand/detail（关注/屏蔽/商品列表→详情）✓
├── 提醒 reminder/index + edit（RELEASE/BALANCE/ARRIVAL/WISH/OUTFIT 等 8 类型 + 本地通知）✓
├── 购买 purchase/*（列表/详情/编辑/导入 + /me/purchases 同步）✓
├── 衣橱 wardrobe/*（/me/wardrobe 同步）✓
└── 圈子 community（穿搭 Gallery + 我的发布）✓
```

## B. 已完成（真实业务闭环）

1. Feed → Product Detail：商品卡点击 → 详情页（entityId）✓
2. Search → Product Detail：搜索结果 → 详情页 ✓
3. Product Detail → Favorite：详情页收藏（content-library → /api/v1/wishlist）✓
4. Product Detail → Purchase：记入购买 → purchase/edit ✓
5. Product Detail → Reminder：设置提醒 → reminder/edit（RELEASE/BALANCE 类型）✓
6. Brand → Product：品牌详情商品列表 → 详情页 ✓
7. Brand → Favorite：品牌关注（/api/v1/brands/follow）✓
8. Discover 日历事件 → Reminder：onAddReleaseReminder → reminder/edit?type=RELEASE ✓（但日历本身无数据）
9. Favorite → 后端持久化：收藏/取消全链路（含离线队列重放）✓

## C. 半完成

1. 商品详情"发售进度"：badgeText 推导 5 阶段 UI，无真实 release event 数据（eventStartAt/eventEndAt 有值但未展示截止时间）
2. 收藏页"商品"：有收藏/取消，后端 status 字段（WANT/WAIT_RELEASE/WAIT_PRICE/PURCHASED）完全未用，前端永远是 WISH
3. Feed release_event 类型：前端 FeedItem/ReleaseCard 结构完整，但后端 Feed 不产该类型（结构性就绪，数据缺失）
4. Wishlist 双通道：/api/v1/wishlist（wishlist_items 表，favorites 页用）与 /me/wishes（user_assets kind=wish，wishlist-store 用）并存——两套收藏模型，未统一

## D. 断裂（P0）

| # | 链路 | 断裂点 | 证据 |
|---|------|--------|------|
| D1 | Discover 发售日历 | 日历从 feedStore.allItems 过滤 FEED_RELEASE_EVENT，后端 Feed 只产 feedType:'product' → 日历永远空白；后端 /api/v1/calendar 已实现但前端 0 处调用 | postgres.ts listFeed 仅 product；grep calendar 仅 discover 页内 computed |
| D2 | Feed Release → Reminder | ReleaseCard @remind/@view 全部 emit('tap') → 跳商品详情，提醒按钮无独立链路 | FeedBlock.uvue L4 |
| D3 | Favorite 决策状态机 | 后端 wishlist_items 支持 6 状态 + releaseId，前端 addWishlistRemote 硬编码 status:'WISH'，收藏页无状态流转 UI，无法表达 想买/等待开售/已预约/等待尾款 | user-data-service L144；favorites 页无 status 交互 |

## E. 完全缺失

1. 发售事件详情页（Release Detail）：无独立页面，release 事件与商品共用详情页
2. 收藏 → 提醒链路：收藏条目无法进入提醒链路（reminder 无 relatedWishId 传参入口；Reminder 模型有 relatedWishId 字段但收藏页不产生提醒）
3. 前端 Feed 富化字段映射：后端 feed 返回 releaseType/releaseTypeName/tags/feedReason/saleStatus，mapFeedItem 全部丢弃
4. 搜索词库数据结构/接口预留（三坑专属词库）：前端无词库数据结构

## F. 建议修改文件（P0 范围）

1. `services/content/calendar-service.uts`（新增）— 封装 GET /api/v1/calendar
2. `stores/calendar-store.uts`（新增）— 日历 store（页面→Store→Service）
3. `pages/discover/index.uvue` — 日历数据源改为 calendar-store（替换 feed 过滤）
4. `components/v3/FeedBlock.uvue` — ReleaseCard @remind 独立 emit('remind')
5. `pages/home/index.uvue` — 处理 release remind → reminder/edit
6. `services/user-data/user-data-service.uts` — addWishlistRemote 支持 status；新增 updateWishlistStatusRemote(PATCH)
7. `stores/content-library-store.uts` — FavoriteEntry 加 status/releaseId；新增 updateFavoriteStatus
8. `pages/favorites/index.uvue` — 商品收藏卡加状态流转（收藏→想买→等待开售→已购买）
9. `services/content/feed-service.uts` + `domain/content/feed-item.uts` — mapFeedItem 补 releaseType/saleStatus/eventStartAt 映射（轻量）

## G. 不应该修改的文件

1. `pages.json` / TabBar / 一级导航 — Phase 1 禁止
2. `stores/wishlist-store.uts` + `domain/repositories/wishlist-repo.uts` + `/me/wishes` — 保留为心愿单通道（wardrobe/budget 在用），不合并不删除
3. `stores/budget-store.uts` / `pages/budget/index.uvue` — Budget 禁止开发，仅出报告
4. VIP 相关（无独立文件，确认无 VIP 代码）✓
5. `services/ai/*` — AI 不开发，不重设计
6. `pages/community/*` — 重社区禁止
7. `services/platform/api-client.uts` / `config/runtime.uts` — 基础设施不动
8. 后端 `sankengcloset_service` — 后端 API 已完整支持 P0（calendar/wishlist status 已实现），无需后端改动

## H. 后端缺口

- 无（P0 范围内后端能力已齐备：calendar 真实数据、wishlist 6 状态 + PATCH、reminder 资产）
- 提示：后端 Feed 不产 release_event/editorial/outfit 类型导致 discover 专题/话题空 — 属 P1 内容运营范畴（Phase 1 不扩张 Editorial/Trend），仅日历用真实 calendar API 修复

## I. 前端缺口

1. 发售日历未接 /api/v1/calendar（D1，P0）
2. 收藏状态机未用后端 status 能力（D3，P0）
3. ReleaseCard 提醒按钮语义丢失（D2，P0）
4. mapFeedItem 丢字段（P1）
5. 商品详情发售进度非真实数据（P1）
6. 搜索词库预留结构（P1，Phase 1 只留数据结构/接口预留）
7. 收藏 → 提醒链路（P1，Reminder.relatedWishId 已存在但未接通）

## J. Domain 缺口

- `domain/content/release-event.uts` 模型完整（preview/reservation/deposit/final_payment/release/restock/price_drop + 4 状态）✓ 无需新增
- `domain/wish-item.uts` 状态机完整（WISH/WATCHING/DECIDED/PURCHASED/PAUSED/CANCELED）✓
- 收藏决策池状态以后端 WishlistStatus（WISH/WANT/WATCHING/WAIT_RELEASE/WAIT_PRICE/PURCHASED）为准，前端 FavoriteEntry 需补 status 字段（P0）
- 不新建任何 Domain 模型；不创建第二套 Favorite/Wishlist

---

## 目标状态链 vs 现有能力对照

| 目标状态 | 后端表达 | 前端现状 |
|---------|---------|---------|
| 收藏 | WISH | ✓ 已实现 |
| 想买 | WANT | ✗ 未使用（P0 修） |
| 等待开售 | WAIT_RELEASE | ✗ 未使用（P0 修） |
| 已预约 | WAIT_RELEASE + releaseId | ✗ 未使用（P0 修） |
| 等待尾款 | WAIT_PRICE（或 releaseId→final_payment） | ✗ 未使用（P0 修） |
| 已购买 | PURCHASED | ✗ 收藏侧未使用（购买页已独立闭环） |
| 已入橱 | wardrobe 资产（购买后） | ✓ 衣橱独立闭环 |

结论：后端模型完整表达目标状态链，P0 = 前端把后端 status 能力接到收藏页 + 日历真实数据 + Release→Reminder 链路。不需要新建后端 API、不需要新建 Domain。
