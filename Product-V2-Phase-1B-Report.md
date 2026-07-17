# Product V2 Phase 1B Report

> 三坑绮橱 · 内容域契约补齐 + 首页高保真 Mock Feed

---

## 1. Git 分支与 Commit 列表

| # | SHA | Message | Files |
|---|-----|---------|-------|
| 1 | d5a7235 | Phase 1B: Complete content domain models | 7 files, +243 |
| 2 | 67de627 | Phase 1B: Mock Feed data layer | 1 file, +253 |
| 3 | 224875c | Phase 1B: Rewrite home page as content discovery feed | 2 files, +779/-389 |

**分支**: `feature/v2-phase1b-content-home` (基于 `spike/phase-0` 的 d5a7235)

---

## 2. 新增和修改文件

### 新增

| 文件 | 说明 |
|------|------|
| `domain/content/product-variant.uts` | ProductVariant 实体 + StockStatus |
| `domain/content/release-event.uts` | ReleaseEvent 实体 + EventType + EventStatus |
| `domain/content/source-record.uts` | SourceRecord 实体 + ReviewStatus |
| `domain/content/feed-item.uts` | FeedItem 展示协议 + FeedType |
| `domain/content/user-brand-relation.uts` | UserBrandRelation（独立于 Brand） |
| `domain/content/mock-feed-repo.uts` | Mock Feed 数据层 |
| `stores/home-feed-store.uts` | 首页 Feed Store |

### 修改

| 文件 | 说明 |
|------|------|
| `domain/content/brand.uts` | `isFollowed` 标记 `@deprecated` |
| `domain/content/index.uts` | 新增 5 个导出 |
| `pages/home/index.uvue` | 完全重写：Dashboard → 内容发现 Feed |

### 保留未变

- `pages/dev/feed-spike.uvue` — 技术验证页保留
- `stores/home-store.uts` — 旧 Dashboard Store，已无引用（dead code）

---

## 3. 四个新增模型实现情况

### 3.1 ProductVariant

- 文件: `domain/content/product-variant.uts`
- 字段: id, productId, name, colorName, sizeName, skuCode, price (分), stockStatus, imageUrl
- StockStatus: IN_STOCK / LOW_STOCK / OUT_OF_STOCK / PRE_ORDER
- 附带 StockStatusLabels + STOCK_STATUS_COLORS

### 3.2 ReleaseEvent

- 文件: `domain/content/release-event.uts`
- 字段: id, productId, brandId, eventType, title, description, startAt, endAt, depositAmount, finalPaymentAmount, status, sourceId
- EventType (7 种): preview / reservation / deposit / final_payment / release / restock / price_drop
- EventStatus (4 种): upcoming / active / ended / cancelled
- 附带 EventTypeLabels + EventStatusLabels + EVENT_TYPE_COLORS
- EVENT_TYPE_EMOJI 存在但首页未使用（功能图标改用文字标签）

### 3.3 SourceRecord

- 文件: `domain/content/source-record.uts`
- 字段: id, sourceType, sourceName, sourceUrl, originalId, fetchedAt, publishedAt, reviewStatus, confidence, rawSnapshotRef
- SourceType: taobao / weibo / xiaohongshu / official / user_submit / ai_extract
- ReviewStatus: pending / approved / rejected / corrected
- 不包含账号密码、Cookie 或抓取密钥

### 3.4 FeedItem

- 文件: `domain/content/feed-item.uts`
- 字段: id, feedType, entityId, title, subtitle, coverUrl, secondaryCoverUrl, brandId, brandName, price, originalPrice, badgeText, eventStartAt, eventEndAt, liked, saved, sourceLabel, rankingScore, category, createdAt
- FeedType (6 种): product / release_event / brand_post / outfit / editorial / ai_recommendation
- 纯展示协议，不是数据库实体

### 3.5 UserBrandRelation（额外）

- 文件: `domain/content/user-brand-relation.uts`
- 字段: userId, brandId, followed, followedAt, notifyNewRelease, createdAt, updatedAt
- Brand.isFollowed 已标记 `@deprecated`

---

## 4. Mock 数据组成统计

| 类型 | 条目数 | 说明 |
|------|--------|------|
| 品牌 | 10 | JK×3, Lolita×4, Hanfu×3 |
| 商品 Product | 20 | 覆盖格裙/衬衫/JSK/头饰/马面裙/鞋/包等 |
| 发售事件 ReleaseEvent | 7 | 含 preview/reservation/deposit/final_payment/release/restock/price_drop |
| 品牌动态 BrandPost | 4 | 新品预告/设计手稿/联名/限定 |
| 穿搭 Outfit | 5 | JK/Lolita/Hanfu 各有覆盖 |

**分布** (每页 20 条，按类型轮转):
- Product: 50% (10 条/页)
- ReleaseEvent: 20% (4 条/页)
- BrandPost: 20% (4 条/页)
- Outfit: 10% (2 条/页)

**分页**: 首屏 20 条，上拉加载更多，最多 5 页 100 条

**图片**: 全部使用类别色块占位（JK 粉 / Lolita 紫 / Hanfu 金），无外链依赖

---

## 5. 首页模块结构

```
┌─────────────────────────────────┐
│ Navbar: 三坑绮橱 | 搜索 · 通知   │  ← AppNavbar, fixed
├─────────────────────────────────┤
│ 频道栏 (scroll-view horizontal)  │  ← list-item type="channelBar"
│ [推荐] [新品] [预约] [降价]       │
│ [穿搭] [JK] [Lolita] [汉服]     │
├─────────────────────────────────┤
│ 焦点专题 (可选, accent left-bar)  │  ← list-item type="focus"
│ 第一条 release_event             │
├─────────────────────────────────┤
│ 主 Feed (list-view)             │
│ ┌─────────┬─────────┐          │  ← list-item type="pair"
│ │ 商品卡  │ 商品卡  │ 3:4图    │     Product: 双列 3:4
│ └─────────┴─────────┘          │
│ ┌──────────────────────┐       │  ← list-item type="single"
│ │ 发售事件卡 16:9       │       │     Event: 单列横图+类型+时间
│ └──────────────────────┘       │
│ ┌──────────────────────┐       │  ← list-item type="single"
│ │ 穿搭沉浸卡 1:1        │       │     Outfit: 单列大图+overlay
│ └──────────────────────┘       │
│ ┌──────────────────────┐       │  ← list-item type="single"
│ │ 品牌动态卡 16:9       │       │     Post: 单列横图
│ └──────────────────────┘       │
│ ...                             │
│ ┌──────────────────────┐       │
│ │ 加载更多 / 已显示全部  │       │  ← list-item type="footer"
│ └──────────────────────┘       │
└─────────────────────────────────┘
```

---

## 6. Vapor / list-view 使用位置

| 位置 | 组件 | 说明 |
|------|------|------|
| 首页 Feed | `list-view` + `list-item` | 主 Feed 流，type 区分 pair/single/channelBar/focus/footer |
| 频道栏 | `scroll-view scroll-x` | 频道横滑 |
| feed-spike | `list-view` + `list-item` | 技术验证页保留 |

- manifest.json `vapor: true` 保持不变
- list-item 使用 `:type` 区分行布局（pair/single/channelBar/focus/footer）
- App 平台 list-view 自动编译为 recycle list
- mp-weixin 自动编译为 scroll-view（已验证 wxml 输出）

---

## 7. 微信编译结果

```
HBuilderX: 5.21.2026071110-alpha
模式: VDOM模式 (mp-weixin)
Style isolation: 2.0
页面数: 14
编译耗时: ~27s
结果: ✅ SUCCESS

patch-vendor.py: [PATCH] defineStore (+ globalThis fallback) [OK]
require 路径: 全部正确（home → home-feed-store → mock-feed-repo → feed-item）
home/index.wxml: 确认包含新 Feed 结构（频道栏 + list-view + 事件卡/商品卡/穿搭卡）
home/index.js: 30KB，引用 stores/home-feed-store + domain/content/feed-item
```

**14 个页面全部编译通过**:
1. pages/home/index ✅ (新 Feed)
2. pages/wardrobe/index
3. pages/purchase/index
4. pages/purchase/detail
5. pages/purchase/edit
6. pages/profile/index
7. pages/wishlist/index
8. pages/wishlist/detail
9. pages/wishlist/edit
10. pages/reminder/index
11. pages/reminder/edit
12. pages/dev/ui-playground
13. pages/dev/page-playground
14. pages/dev/feed-spike ✅ (保留)

---

## 8. Android / iOS / Harmony 未验证项

**服务器环境**: Linux 4G/2核/40G，无 Android SDK / Xcode / HarmonyOS SDK

| 平台 | 状态 | 说明 |
|------|------|------|
| mp-weixin | ✅ 编译通过 | 14 页，vendor.js 已 patch |
| Android | ❌ 未验证 | 无 Android 环境 |
| iOS | ❌ 未验证 | 无 iOS/Xcode 环境 |
| Harmony | ❌ 未验证 | 无 HarmonyOS SDK |

**不得声称真机性能已通过**。list-view 在 App 平台的 recycle list 行为需真机验证。

---

## 9. 已知 UTS 风险

| 风险 | 说明 | 缓解 |
|------|------|------|
| FeedRow 对象复杂度 | FeedRow 包含 FeedItem 引用，list-item 内深层响应式 | 模板使用直接属性访问（row.single!.title），避免 computed 嵌套 |
| null 安全操作符 | `row.single!` 在 item 为 null 时会崩溃 | v-if 保证非 null 才渲染 |
| computed + any 返回 | 所有 computed 样式返回 `any`，UTS 类型安全降低 | 集中在 script 顶部定义，便于后续审查 |
| defineStore 全局注入 | patch-vendor.py 依赖 globalThis 注入 | 已验证 vendor.js patch 正确 |
| list-view mp-weixin 转译 | mp-weixin 自动转 scroll-view，非原生回收 | Phase 1B 可接受，真机性能待验证 |
| home-store.uts dead code | 旧 Dashboard Store 仍存在但无引用 | 不影响编译，后续清理 |

---

## 10. 设计语言合规检查

| 要求 | 状态 | 说明 |
|------|------|------|
| 暖白背景 | ✅ | neutralLight.bg (#FAFAFA) |
| 深棕正文 | ✅ | neutralLight.text (#1A1A1A) |
| 品牌粉仅作强调 | ✅ | 仅用于频道选中、价格、角标 |
| 禁止大面积纯粉 Hero | ✅ | 已移除旧 Dashboard 品牌色 Hero |
| 禁止 Emoji 功能图标 | ✅ | 搜索/通知使用文字标签 |
| 禁止厚重阴影 | ✅ | 使用 shadow.sm/shadow.card |
| 图片是视觉主体 | ✅ | 商品 3:4 / 事件 16:9 / 穿搭 1:1 |
| 卡片圆角统一 | ✅ | semanticRadius.card (24rpx) |
| 文字层级清楚 | ✅ | fontSize.sm/title/base/price 分层 |
| 保留留白 | ✅ | semanticSpacing.pageHorizontal (32rpx) |
| 不做消费统计页 | ✅ | 无消费金额/衣物数量/提醒统计 |

---

## 11. 下一阶段建议

### Phase 2A: 商品详情页
- ProductDetail.uvue
- 展示 Product + ProductVariant
- 关联 ReleaseEvent 时间线
- 图片轮播（3:4 原图）

### Phase 2B: 发现页
- 第二个 Tab "发现"
- 更精细的分类筛选
- 搜索功能实现

### Phase 2C: 真实数据接入
- 替换 MockFeedRepo 为 Repository 接口
- SourceRecord 审核流程
- 接入真实图片 CDN

### 技术债
- 清理 `stores/home-store.uts` (dead code)
- EVENT_TYPE_EMOJI 在首页未使用，可考虑移除
- list-view 在 mp-weixin 上的 scroll-view 转译性能测试

---

*报告生成: 2026-07-15*
*编译环境: HBuilderX 5.21.2026071110-alpha / Linux*
*分支: feature/v2-phase1b-content-home*
