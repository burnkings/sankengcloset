# Phase 1.1-C Favorite → Release → Reminder Architecture Audit

日期：2026-08-19
范围：Favorite → Product → Release → Reminder 三坑待购决策闭环 · 前置业务与架构审计
基线：Phase 1.1-A PASS / Phase 1.1-B PASS（全部门禁 fresh 通过）
性质：纯审计，零代码修改，零数据库修改

---

## 1. 当前数据流（逐段真实验证）

### 1.1 Favorite 链路（已完整，但丢 release 数据）

```
商品详情页 toggleSaved
  → content-library-store.toggleFavorite(entityId, title)
  → addWishlistRemote(productId, title, status='WISH')
      POST /api/v1/wishlist {title, status, productId}   ← releaseId 未传
  → wishlist_items 表（user_id, product_id, release_id, title, status, note）
收藏页 onPageShow → library.refreshFavorites()
  → refreshRemoteFavorites()
      GET /api/v1/wishlist → 读 productId / itemId / title / status   ← releaseId 未读
  → fetchProductDetail(productId)
      GET /api/v1/products/:id → ProductDetailModel { item: FeedItem, currentRelease: ReleaseEvent }
  → favoriteProducts = [detail.item]                                    ← currentRelease 被丢弃！
收藏页 UI → ProductCard(badgeText/eventEndAt) + 待购状态行
```

### 1.2 Release 链路（后端完整，详情页已通）

```
GET /api/v1/products/:id
  → postgres.getProduct SQL：LEFT JOIN LATERAL 最新一条 product_releases（created_at desc limit 1）
  → Product.currentRelease: ProductRelease | null（releaseName/releaseType/saleStatus/
      lifecycleStatus/isRerelease/depositCents/balanceCents/fullPriceCents/
      startAt/endAt/balanceDueAt/shipAt）
  → product-service.mapCurrentRelease → ReleaseEvent（复用 Domain，非第二套模型）
  → detail.uvue：statusTag/stages/createReminder/createPurchase 全部基于 currentRelease 真实字段
```

### 1.3 Reminder 链路（与 Product/Release 完全脱钩）

```
detail.uvue createReminder
  → navigateTo /pages/reminder/edit?title=&type=&date=&note=     ← 无 productId / releaseId
  → reminder/edit 表单（relatedPurchaseId/relatedWishId 两个 ref 恒为空串）
  → reminder-store.addItem(Reminder)
  → 本地 repo（reminder_items storage）+ createAssetRemote('reminders')
  → user_assets 表（asset_type='reminder'，payload_json 透传）
  → 本地通知 scheduleReminderNotification(title, content, remindDate, remindTime, key)
```

---

## 2. 当前数据模型

### 2.1 Reminder Domain（domain/reminder.uts:119-148）

```
id / title / type(ARRIVAL|BALANCE|RELEASE|OUTFIT|PHOTO|ORGANIZE|WISH|CHECKIN)
remindDate(YYYY-MM-DD) / remindTime(HH:mm) / isAllDay
relatedPurchaseId: string   ← 订单锚（syncPurchaseReminders 自动维护）
relatedWishId: string       ← 旧心愿单锚（仅 syncPurchaseReminders 顺带写 purchase.wishId）
note / status(PENDING|DONE|MISSED) / isDeleted / createdAt / updatedAt / wardrobeBindings
```

**无 productId、无 releaseId / relatedReleaseId。**

### 2.2 后端 Reminder 契约（src/routes/user-data.ts:64-74 reminderSchema）

```
title / type(enum ARRIVAL|BALANCE|RELEASE|CUSTOM) / remindDate / remindTime
relatedPurchaseId / relatedWishId（idSchema.or('')）/ note / status(enum PENDING|DONE|MISSED)
```

存储 = user_assets.payload_json（jsonb，schema-free）→ **新增字段零 migration**。

### 2.3 FavoriteEntry（stores/content-library-store.uts:44-49）

```
productId / itemId（= wishlist_items.id, wli_xxx）/ title / status(WISH|WANT|WATCHING|WAIT_RELEASE|WAIT_PRICE|PURCHASED)
```

**无 releaseId。**

### 2.4 后端 WishlistItem（src/types.ts:307-318 + postgres.ts:1073-1086 mapWishlist）

```
id(wli_xxx) / userId / title / status / productId / releaseId / note / payloadJson / createdAt / updatedAt
```

**releaseId 已存在：DB 列（0008_user_interaction.sql:54 ALTER TABLE ADD release_id）+ schema 已接受（addWishlistSchema releaseId）+ mapWishlist 已返回。前端从未使用。**

---

## 3. Favorite → Product 关系

- ✅ 已打通：FavoriteEntry.productId → fetchProductDetail(productId) → ProductDetailModel
- ✅ 收藏页能展示：标题/品牌/价格/封面/badgeText/截止时间（eventEndAt）/待购状态
- ❌ 收藏页拿到的是 `detail.item`（FeedItem），**detail.currentRelease（ReleaseEvent 完整对象）被丢弃**
  —— refreshFavorites() 只 push `detail.item` 到 favoriteProducts，currentRelease 未保留（content-library-store.uts:521-523）
- ❌ FavoriteEntry 无 releaseId：addWishlistRemote 不传、refreshRemoteFavorites 不读（user-data-service.uts:147-151 只发 {title,status,productId}；content-library-store.uts:447-456 只读 productId/itemId/title/status）

---

## 4. Product → Release 关系

- ✅ 后端：products 1 ── N product_releases；getProduct 返回最新一条 currentRelease（LATERAL created_at desc limit 1，postgres.ts:768-772）
- ✅ 前端：mapCurrentRelease → ReleaseEvent（release-event.uts:45-53 含 releaseType/saleStatus/lifecycleStatus/isRerelease/fullPrice/balanceDueAt/shipAt）
- ❌ **无 Release 列表 API**：一个商品多个批次时，只有"最新一条"，无法表达"一期预约 + 二期再贩"并存
- ❌ FeedItem 不含 releaseId（Phase 1.1-B 只补了 releaseType 等衍生字段，无批次主键）

---

## 5. Reminder 当前关系

| 关系 | 字段 | 现状 |
|---|---|---|
| Reminder → Purchase | relatedPurchaseId | ✅ 有效（syncPurchaseReminders 维护 BALANCE/ARRIVAL，订单取消自动 DONE） |
| Reminder → WishItem（旧） | relatedWishId | ⚠️ 语义过时（指向 /me/wishes 资产 wish_xxx，现收藏体系是 /api/v1/wishlist wli_xxx） |
| Reminder → Product | 无 | ❌ 完全缺失 |
| Reminder → ReleaseEvent | 无 | ❌ 完全缺失 |
| Reminder → WishlistItem | 无 | ❌ 完全缺失 |

本地通知调度（utils/notify.uts:41-67）：仅 title/content/remindDate/remindTime/key 触发，payload 无深链目标 —— 通知点开无落点（只能进提醒列表）。

---

## 6. 现有断点（Gap 清单）

| # | 断点 | 位置 | 影响 |
|---|---|---|---|
| B1 | 收藏页丢弃 currentRelease | content-library-store.refreshFavorites 只保留 detail.item | 收藏页无法回答"该商品当前最值得提醒的具体发售事件是什么" |
| B2 | 收藏不存/不传 releaseId | addWishlistRemote 无 releaseId 参数；refreshRemoteFavorites 不读 | wishlist_items.release_id 列空置，收藏条目与批次脱钩 |
| B3 | Reminder 与商品/发售零关联 | Reminder Domain 无 productId/relatedReleaseId；detail.createReminder URL 不传；reminder/edit 不接收 | 从商品开的提醒无法溯源回商品/批次 |
| B4 | relatedWishId 语义过时 | 指向旧 wish 资产 | 与现收藏体系不互通，弱引用 |
| B5 | 多批次无法区分 | getProduct 只返回最新一条；无 release 列表 API | 一期/二期提醒无法锚定具体批次 |
| B6 | 本地通知无深链 | notify.uts payload 只有 key | 通知点开无商品落点 |

---

## 7. 三坑业务场景分析（首发/定金/尾款/再贩/抽选/现货）

| 真实业务 | release_type | 用户要提醒的关键时刻 | 批次字段 |
|---|---|---|---|
| 首发 | first_release | 开售时间 | start_at |
| 定金 | reservation | 定金截止 | end_at |
| 尾款 | （尾款期由 sale_status/lifecycle 表达） | 尾款截止 | balance_due_at |
| 再贩 | rerelease | 再贩开售 | start_at |
| 抽选 | lottery | 抽选登记截止 | end_at |
| 现货 | spot | 上架/掉落时间 | start_at |

结论：**每个批次都有明确、可自动推导的提醒时间点**（start_at/end_at/balance_due_at），且"等待开售(WAIT_RELEASE)/等待尾款(WAIT_PRICE)"收藏状态与批次时间天然对应 —— 这是 Reminder 绑定 Release 的业务依据。

---

## 8. Product / Release / Wishlist / Reminder ER 关系（目标态）

```
users 1 ── N wishlist_items (product_id, release_id, status, title, note)
            wishlist_items.release_id ──→ product_releases.id（逻辑引用，无 FK）
products 1 ── N product_releases (release_type, sale_status, lifecycle_status,
                                  start_at, end_at, balance_due_at, ship_at,
                                  deposit_price_cents, balance_price_cents, full_price_cents)
users 1 ── N user_assets (asset_type='reminder',
                          payload_json: {productId?, relatedReleaseId?, relatedPurchaseId?, relatedWishId?})
users 1 ── N user_assets (asset_type='purchase', payload_json: {wishId?})
```

Reminder 三种锚并存：
- 订单锚 relatedPurchaseId（已存在，BALANCE/ARRIVAL）
- 商品锚 productId（新增）
- 批次锚 relatedReleaseId（新增，可空）

---

## 9. 推荐最终模型

### 9.1 Reminder 扩展（payload 增量，零 migration）

```
productId: string = ''            // 商品锚（详情跳转、收藏页溯源）
relatedReleaseId: string = ''     // 批次锚（product_releases.id，可空；多批次时精确锚定）
relatedPurchaseId: string = ''    // 已有，不动
relatedWishId: string = ''        // 已有，保留旧语义兼容（不改变含义）
```

### 9.2 FavoriteEntry 扩展

```
releaseId: string = ''            // 服务端 wishlist_items.release_id 透传
```

### 9.3 关键决策：绑定粒度选 D 的轻量版（WishlistItem + ReleaseEvent 锚，但不强制）

| 方案 | 结论 | 理由 |
|---|---|---|
| A. Reminder→Product | ✗ 单独不够 | 多批次无法区分；WAIT_RELEASE 与 WAIT_PRICE 两个提醒绑同一商品会混淆 |
| B. Reminder→ReleaseEvent | ✗ 单独不够 | release 可能软删；无列表 API 时无法选择批次；收藏页入口天然有 wishlist 上下文 |
| C. Reminder→WishlistItem | ✗ 单独不够 | wishlist item 只是薄引用（title/status/productId/releaseId），绑定它等于间接绑定，且收藏可被删除 |
| **D. WishlistItem + ReleaseEvent（轻量版）** | ✅ 推荐 | Reminder 存 productId（主锚）+ relatedReleaseId（批次锚，可空）；收藏页以 FavoriteEntry 为入口，取 currentRelease 推导时间与批次 |

---

## 10. 是否需要新增字段

| 位置 | 字段 | 是否新增 | 说明 |
|---|---|---|---|
| 后端 reminderSchema（user-data.ts） | productId / relatedReleaseId（可选） | 是（zod schema，非 DB） | user_assets jsonb schema-free，直接透传 |
| 后端 wishlist | releaseId | **否** | 列 + schema + map 已全部存在（0008:54 / types.ts:313 / postgres.ts:1080） |
| 前端 Reminder Domain | productId / relatedReleaseId | 是（本地 storage 自由扩展） | reminder-repo loadAll 补读 |
| 前端 FavoriteEntry | releaseId | 是（本地 storage + 远程读写） | 写：addWishlistRemote 透传；读：refreshRemoteFavorites 读取 |
| 前端 user-data-service | addWishlistRemote 参数 | 是（函数签名加可选参） | 后端已支持，纯透传 |

**结论：后端零 DB 变更、零 migration；纯 zod schema + 前端增量字段。**

---

## 11. 是否需要 migration

**不需要。**
- wishlist_items.release_id：0008_user_interaction.sql:54 已加（生产已应用，schema_migrations 已记录）
- Reminder 存储：user_assets.payload_json（jsonb）schema-free，任何字段直接存取
- 无新表、无新索引、无约束变更

---

## 12. 最小修改文件清单（预估，本阶段不实施）

```
后端（sankengcloset_service）
  1. src/routes/user-data.ts        reminderSchema 增加 productId/relatedReleaseId（zod 可选字段）
  2. src/types.ts                   ReminderAssetPayload 类型注释（如存在对应接口）——视实现而定

前端（sankengcloset）
  3. domain/reminder.uts            Reminder/ReminderUpdateData +productId +relatedReleaseId
  4. domain/repositories/reminder-repo.uts   loadAll/saveAll 透传新字段
  5. stores/reminder-store.uts      mapRemoteReminder 透传；新增 createProductReminder()
                                   （productId+releaseId+时间推导）与 remindersForProduct()
  6. stores/content-library-store.uts        FavoriteEntry +releaseId；addWishlistRemote 传 releaseId；
                                   refreshRemoteFavorites 读 releaseId；refreshFavorites 保留 currentRelease
  7. services/user-data/user-data-service.uts  addWishlistRemote(productId, title, status, releaseId='')
  8. pages/favorites/index.uvue     收藏卡补 Reminder 状态 + 一键开启提醒入口（复用 reminder-store，不建第二套）
  9. utils/notify.uts               payload 增加深链 target（可选，通知点开跳商品）

禁止：新表/migration、新 Store/Service/Domain、Release 列表 API（多批次选择 UI 留后续阶段）、
      Product Detail 重构、Favorite 体系重构、第二套 Reminder。
```

---

## 13. API 修改建议

| API | 修改 | 性质 |
|---|---|---|
| POST /api/v1/me/reminders | reminderSchema 接受 productId/relatedReleaseId | zod 增量，兼容旧 payload |
| PATCH /api/v1/me/reminders/:id | 同上（partial schema 自动继承） | 同上 |
| POST /api/v1/wishlist | **零改动**（releaseId 已接受） | 仅前端补传 |
| GET /api/v1/wishlist | **零改动**（releaseId 已返回） | 仅前端补读 |
| GET /api/v1/products/:id | **零改动**（currentRelease 已有） | — |
| GET /api/v1/feed | **零改动** | — |

---

## 14. Store 修改建议

- **reminder-store**：新增 `createProductReminder(productId, relatedReleaseId, type, date, title, note)` —— 统一走 addItem 的本地 repo + 远程 + 入队 + 调度链路，避免页面直连 Service（架构约束 Page→Store→Service→Domain）；新增 `remindersForProduct(productId)` 供收藏页查询状态
- **content-library-store**：FavoriteEntry 增 releaseId；refreshFavorites 除 favoriteProducts 外保留 currentRelease（如 favoriteReleaseById map），供收藏页"一键提醒"推导时间
- 禁止新建 Store

---

## 15. UI 修改建议（最小，不重设计）

- 收藏页商品卡（favorites/index.uvue）：
  - 已有：商品卡 + 待购状态行（WISH→PURCHASED）
  - 新增（一行入口，复用 AppIcon/AppDialog 风格）：若 currentRelease 存在 → 显示"发售状态 + 一键开启提醒"；未开提醒显示"🔔 开启提醒"，已开显示"已设提醒"
  - 提醒时间推导：type=BALANCE（WAIT_PRICE）→ balanceDueAt；type=RELEASE → endAt；兜底 currentRelease.endAt
- 不重做 Feed 卡片、不重做首页、不新增页面

---

## 16. 本地通知修改建议

- scheduleReminderNotification 保持纯时间触发（既有能力，不动核心）
- 可选：payload 增 `target: '/pages/product/detail?id=xxx'`，通知点开可跳商品详情（依赖平台支持，标准基座能力有限，标注为增强项）
- 应用内兜底已存在：notification-center-store + generateNotifications（actionTarget 目前指向 /pages/reminder/index，商品锚落地后可改 /pages/product/detail?id=）

---

## 17. 数据兼容方案

- 存量 Reminder：payload 无 productId/relatedReleaseId → 默认空串，功能不受影响（旧提醒照常触发）
- 存量 FavoriteEntry：无 releaseId → 空串，收藏页提醒入口按 currentRelease 兜底（不强依赖条目 releaseId）
- relatedWishId 旧数据：语义不变、不迁移、不清理（避免破坏 syncPurchaseReminders 的 purchase.wishId 链路）
- wishlist_items.release_id 存量空值：不回溯（无历史批次引用可追溯），新收藏开始写入

---

## 18. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| currentRelease = 最新一条，非用户关注的那条（多批次时一键提醒可能锚错批次） | 中 | relatedReleaseId 空时明确标注"当前最新批次"；多批次选择 UI 属后续阶段（Release 列表 API） |
| 取消收藏后 RELEASE 提醒成孤儿 | 中 | 本阶段若不做级联清理，标注为未完成项；后续在 toggleFavorite 删除分支挂 cleanupRemindersForProduct |
| relatedWishId 语义过时（wish_xxx vs wli_xxx） | 低 | 保留兼容，不改变含义；新链路不依赖它 |
| 本地通知被杀后不可靠（标准基座） | 已知 | 既有限制，非本轮引入；应用内通知中心兜底 |
| 后端 reminderSchema 是 z.enum type 白名单（ARRIVAL|BALANCE|RELEASE|CUSTOM） | 低 | RELEASE 类型已存在，无需扩展枚举 |

---

## 19. 验收标准（本阶段实施时的门禁）

1. 收藏页每张卡显示 Reminder 状态（未开/已开）
2. "一键开启提醒"创建含 productId + relatedReleaseId 的 RELEASE/BALANCE 提醒（时间来自 currentRelease 真实字段，非 badgeText 猜测）
3. /me/reminders 返回含 productId/relatedReleaseId；重启/多端拉取不丢
4. 收藏条目 releaseId 写读闭环：addWishlistRemote 透传 → GET /api/v1/wishlist 读回 → FavoriteEntry.releaseId
5. 无 release 数据时收藏页正常（不报错、不显示伪造状态）
6. 无 migration；后端 npm test 无回归；前端 check/check:source/check:android/check:mp-weixin 全 PASS + 真实 mp-weixin 编译成功
7. 不新增 Store/Service/Page/Domain 体系；FeedBlock 架构零改动

---

## 审计结论

**READY**

- Reminder 与 Favorite/Release 的断点已全部定位（B1-B6），修复路径明确且最小
- 后端基础设施已就绪：wishlist_items.release_id 列 + addWishlistSchema.releaseId + getProduct.currentRelease 全部存在，**零 migration**
- Reminder 存储 schema-free，前端 Domain/本地 repo 自由增量
- 推荐绑定模型：Reminder { productId 主锚 + relatedReleaseId 批次锚 } + FavoriteEntry { releaseId 透传 }，收藏页以 currentRelease 推导提醒时间
- 禁止范围确认：无新页面/新 Store/新 Service/新 Domain 体系/数据库变更

等待指令进入实施阶段（Phase 1.1-C Implementation）。完成后停止。
