# Phase 1.1 Gap Report — Decision & Release Completion

日期：2026-08-19
范围：Favorite → Release → Reminder → Product Detail → Feed → Search（基础词库）
基线：Phase 1 Final Verification PASS（172 passed / 1 skipped；生产 API E2E 8/8）

---

## A. Favorite → Reminder 当前状态

- 数据源已统一：`content-library-store` → 后端 `/api/v1/wishlist`（wishlist_items 表）。
  FavoriteEntry = { productId, itemId, title, status }，支持离线入队 + 登录回填 + 多端合并。
- 收藏页已展示：商品卡（badgeText + eventEndAt 截止）+ 待购状态行
  （WISH/WANT/WAIT_RELEASE/WAIT_PRICE/PURCHASED，PATCH /api/v1/wishlist/:id）。
- Reminder 体系已存在且完整：`reminder-store`（本地 repo + /me/reminders 远程 CRUD + 入队 +
  本地通知调度 scheduleReminderNotification），类型含 RELEASE（上新发售）/ WISH（蹲新品）等，
  Reminder 已有 relatedWishId / relatedPurchaseId 关联字段，编辑页支持 URL 参数预填。
- **缺失**：
  1. Favorite 页不显示 Reminder 状态（该商品是否已开提醒）。
  2. Favorite 页无「一键开启提醒」入口。
  3. Reminder 与商品（productId）无关联字段——现有 relatedWishId 关联的是旧 WishItem，不是收藏条目。
- 禁止第二套 Reminder：本轮复用 reminder-store，仅给 Reminder 增加最小 productId 关联字段
  （本地 repo 与 /me/reminders jsonb payload 均透传，无需后端 migration）。

## B. Product → Release 当前状态

- 后端 `getProduct`（GET /api/v1/products/:id）只返回 product 本体（mapProduct），
  **不含任何 product_releases 数据**。
- 前端 `product-service.mapRemoteProduct` 用 `statusLabel(status)` 把 sale_status 硬编码成
  badgeText（PRE_ORDER→预售、UPCOMING→预告、SOLD_OUT→售罄、ON_SALE→现货）——即
  「UI 文案推导发售状态」，且无法表达 定金/尾款/再贩/抽选/首发。
- `pages/product/detail.uvue`：currentStage 由 badgeText 推导，stages 硬编码
  ['图透','定金','尾款','现货']；createReminder 用 badgeText 推导 type；createPurchase 用
  eventEndAt 当 deadline。
- 后端数据已具备：`product_releases` 表（release_type: first_release/rerelease/reservation/spot/
  lottery/unknown；sale_status；lifecycle_status；start_at/end_at/balance_due_at/ship_at；
  deposit/balance/full price；is_rerelease）。listFeed 已取最新 release 行；listCalendar 已按月聚合。
- **缺失**：Product Detail 没有 Product → Release Events → Current Release State 的完整数据通道。

## C. Feed mapper 当前状态

- 后端 ContentFeedItem 业务字段完备：releaseType / releaseTypeName / saleStatus / pitType /
  priceSummary / tags / feedReason / personalScore / matchReason / finalScore / publishedAt。
- 前端 `mapFeedItem`（feed-service.uts）只映射 19 个字段，
  **丢弃**：releaseType、releaseTypeName、saleStatus、pitType、priceSummary、tags、feedReason、
  personalScore、matchReason、finalScore、publishedAt。
- FeedItem Domain（domain/content/feed-item.uts）缺上述字段定义；
  `wished` 字段存在但后端返回的是 `saved`，从未被映射。
- **缺失**：Domain 最小类型补充 + mapper 字段补全。

## D. Search 当前状态

- 后端 `/api/v1/search`：参数化 ILIKE（display_name / canonical_name / brand_name）+
  `resolveAliasCategory`（洛丽塔/Lolita→LOLITA、汉服/HANFU→HANFU、JK/制服→JK）+
  category/saleStatus/releaseStatus/brandId/minPrice/maxPrice 过滤 + saved 收藏态。
- 前端 search-store → search-service（复用 mapFeedItem）→ 双列瀑布流页面，含最近搜索 + 编辑推荐。
- **缺失**：三坑搜索词库基础能力（Normalize → Canonical Term → Search）。现有别名仅覆盖 3 个大类，
  无：lo裙/lo装→洛丽塔、格裙/百褶→JK、汉服形制（明制/宋制/齐胸）、品牌/系列/款式/旧称/圈内术语。
- 禁止第二套 Search：前端补最小词库，normalize 后在 Service 层传给既有后端搜索。

## E. 已存在 API（后端，全部复用）

| API | 用途 |
|---|---|
| GET /api/v1/feed | 智能 Feed（channel/category/categories/cursor/limit + 个性化分数） |
| GET /api/v1/search | 商品搜索（q/类别/销售状态/发售类型/品牌/价格区间） |
| GET /api/v1/products/:id | 商品详情（**本轮扩展 currentRelease**） |
| GET /api/v1/calendar | 发售日历（product_releases + sale_events 按月聚合） |
| POST/GET/PATCH/DELETE /api/v1/wishlist | 收藏决策池（含 releaseId 列、幂等） |
| /me/*（wishes/reminders/purchases/...） | 用户资产 CRUD（jsonb payload 透传） |
| POST/GET /api/v1/events | 行为事件（VIEW_PRODUCT/SAVE_PRODUCT/CLICK_BUY...） |
| POST /api/v1/brands/follow 等 | 品牌关注 |

## F. 已存在 Store（前端，全部复用）

- content-library-store（收藏 + 品牌关注 + 圈子；本轮加 releaseId 映射）
- reminder-store（提醒；本轮加 productId 关联 + 一键开启提醒 action）
- product-detail-store（商品详情；本轮透传 currentRelease）
- home-feed-store / search-store / calendar-store / wishlist-store（旧心愿单，收藏页不使用）

## G. 已存在 Domain（前端）

- FeedItem（补 releaseType/tags/feedReason 等字段）
- ReleaseEvent（EVENT_* 常量 + 数据模型，后端 currentRelease 映射到此，禁止复制模型）
- Product（PRODUCT_* 状态常量）、Reminder（TYPE_RELEASE/WISH 等）、WishItem（旧）
- presentation/content/feed-presenter.uts（EventTypeLabels / ProductStatusLabels / Badge 颜色）

## H. 缺失项汇总

1. Reminder.productId 关联字段（Domain/Repo/Store 三处）
2. Favorite 页：Reminder 状态 + 一键开启提醒（复用 reminder-store，不建第二套）
3. 后端 getProduct 返回 currentRelease（Product → Release Events → Current Release State）
4. 前端 ProductDetailModel.currentRelease + 发售状态推导（新品/开售/定金/尾款/再贩/现货）
5. detail.uvue 停止 badgeText 文案推导（statusTag/stages/reminder/purchase 改用真实 Release）
6. FeedItem Domain 最小类型补充 + mapFeedItem 字段补全（releaseType/tags/feedReason 等）
7. 三坑搜索词库 Normalize → Canonical Term（最小基础能力，前端 Service 层）
8. favoriteProducts 的 item 需带 eventEndAt（来自 currentRelease.endAt，供收藏页显示发售时间）

## I. 最小修改方案

```
后端（sankengcloset_service）
  src/types.ts                        Product 增加 currentRelease?: ProductRelease | null
  src/repositories/postgres.ts        getProduct 增加最新 release 行子查询 → currentRelease

前端（sankengcloset）
  domain/content/feed-item.uts        FeedItem 补 saleStatus/releaseType/releaseTypeName/
                                      tags/feedReason/pitType/publishedAt/personalScore/
                                      matchReason/finalScore
  domain/reminder.uts                 Reminder/ReminderUpdateData 补 productId
  domain/repositories/reminder-repo.uts  loadAll 补 productId 映射
  services/content/feed-service.uts   mapFeedItem 补全字段映射
  services/content/product-service.uts  ProductDetailModel 补 currentRelease/statusText；
                                       currentRelease → item.eventEndAt
  services/content/search-service.uts   搜索前 normalizeSearchTerm
  domain/search/search-terms.uts      （新增）三坑搜索词库：normalize → canonical
  stores/reminder-store.uts           mapRemoteReminder 补 productId；
                                       reminderForProduct() / enableReleaseReminder()
  stores/content-library-store.uts    refreshRemoteFavorites 补 releaseId 映射（备用）
  pages/product/detail.uvue           statusTag/stages/currentStage/createReminder/
                                       createPurchase 改用 currentRelease
  pages/favorites/index.uvue          卡片区补 Reminder 状态 + 一键开启提醒

禁止：新 Reminder 体系、新 Search 架构、新 Domain 模型、FeedBlock 架构改动、Release Detail 页。
```

## 验证

- 前端：npm run check / check:source / check:android / check:mp-weixin（+ 真实 mp-weixin 编译）
- 后端：npm test（基线 172 passed / 1 skipped，不得回归）
- 生产 API E2E：/api/v1/products/:id 返回 currentRelease；wishlist 收藏态不回归
- 核心链路：Feed → Product → Favorite → Release → Reminder → Purchase
