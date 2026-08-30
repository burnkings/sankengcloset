# Phase 1.1-C Favorite → Release → Reminder Implementation Report

日期：2026-08-19 23:20
基线：Phase 1.1-A PASS / Phase 1.1-B PASS / Phase 1.1-C Architecture Audit READY
结论：**PASS**

---

## 1. 修改前断点（审计确认）

| # | 断点 | 修复 |
|---|---|---|
| B1 | refreshFavorites 只保留 detail.item，detail.currentRelease（ReleaseEvent）被丢弃 | refreshFavorites 同时保留 favoriteReleases |
| B2 | addWishlistRemote 不传 releaseId（后端支持）；refreshRemoteFavorites 不读 releaseId | 收藏写读 releaseId 全链路透传 |
| B3 | Reminder 无 productId / relatedReleaseId，与商品/发售零关联 | Reminder Domain/Repo/Store + 后端 schema 增量 |
| B4 | relatedWishId 语义过时（旧 /me/wishes 体系） | 保留兼容，新链路用 productId 主锚，不删旧字段 |
| B5 | 多批次无法锚定（getProduct 只返回最新一条） | getProduct 支持可选 releaseId 参数优先定位批次 |

## 2. 实际修改

### 后端（sankengcloset_service，5 文件，零 migration）

| 文件 | 修改 |
|---|---|
| src/routes/user-data.ts | reminderSchema 增加 productId / relatedReleaseId（zod 可选字段，user_assets jsonb 透传） |
| src/routes/content.ts | GET /api/v1/products/:id 解析可选 ?releaseId= 查询参数 |
| src/repositories/contracts.ts | getProduct 签名增加 releaseId?: string |
| src/repositories/postgres.ts | getProduct SQL：LATERAL 按 `(releaseId<>'' and r.id=releaseId) desc, created_at desc` 优先匹配用户批次，缺失回退最新 |
| src/repositories/memory.ts | getProduct 签名同步（内存模式 currentRelease 恒 null，测试不变） |

### 前端（sankengcloset，8 文件）

| 文件 | 修改 |
|---|---|
| domain/reminder.uts | Reminder/ReminderUpdateData + productId + relatedReleaseId（保留 relatedPurchaseId/relatedWishId） |
| domain/repositories/reminder-repo.uts | loadAll/update 透传 productId/relatedReleaseId（旧数据缺省空串兼容） |
| stores/reminder-store.uts | mapRemoteReminder/updateItem 透传；新增 createProductReminder()（去重）+ remindersForProduct() |
| stores/content-library-store.uts | FavoriteEntry + releaseId；read/write/toggleFavorite/refreshRemoteFavorites 透传；refreshFavorites 保留 favoriteReleases；新增 favoriteReleaseOf() |
| services/user-data/user-data-service.uts | addWishlistRemote(productId, title, status, releaseId='') 提交 releaseId |
| services/content/product-service.uts | fetchProductDetail(id, releaseId='') 拼接 ?releaseId= |
| pages/favorites/index.uvue | 收藏卡新增发售状态行 + 一键开启提醒（favoriteReleaseText/reminderActionText/onEnableReminder/reminderDateFor） |
| pages/product/detail.uvue | toggleSaved 收藏时提交 currentRelease.id 作为 releaseId |

## 3. Favorite releaseId

- **写**：detail.uvue 收藏 → toggleFavorite(entityId, title, currentRelease.id) → addWishlistRemote(..., releaseId) → POST /api/v1/wishlist 携带 releaseId → wishlist_items.release_id 落库（后端已支持，零改动）
- **离线入队**：upsert payload 含 releaseId，syncNow 重放不丢
- **读**：refreshRemoteFavorites 两处读取 raw['releaseId'] → FavoriteEntry.releaseId；本地 storage 持久化
- 首页/搜索收藏不传 releaseId（Feed 无批次主键）→ 收藏页 fallback currentRelease，符合规则 3

## 4. Reminder productId

- Reminder Domain/Repo/Store/后端 schema 全链路新增 productId
- createProductReminder 写入 productId；收藏页 remindersForProduct(productId) 查询提醒状态
- 旧 Reminder 无 productId → 空串，正常显示/触发

## 5. Reminder relatedReleaseId

- 一键提醒创建时写入 release.id（用户关注批次锚）
- 去重键含 relatedReleaseId：同 productId + relatedReleaseId + type 不重复创建
- 旧 Reminder 无 relatedReleaseId → 空串，兼容

## 6. currentRelease fallback

规则实现（用户第三节 1-4）：
1. FavoriteEntry.releaseId 非空 → fetchProductDetail(productId, releaseId) 后端优先匹配该批次
2. releaseId 对应 Release 存在 → currentRelease = 该批次
3. releaseId 不存在/历史空 → SQL 回退最新一条 currentRelease
4. 回退不写回本地 releaseId（refreshFavorites 不修改 entry.releaseId，不覆盖用户原始批次锚）

## 7. 一键提醒

- 入口：收藏卡「🔔 开启提醒」
- 条件：存在有效 ReleaseEvent 且提醒时间非空才创建；无发售信息/无提醒时间 → showFeedback 提示，不创建
- 类型：WAIT_PRICE → BALANCE（尾款）；其余 → RELEASE
- 提醒时间规则（用户第六节）：WAIT_PRICE → balanceDueAt；first_release/rerelease/spot → startAt；reservation/lottery → endAt；兜底 balanceDueAt→endAt→startAt；全空返回空串不伪造
- 创建后走 addItem 统一链路：本地 repo + 离线入队 + 远程 /me/reminders + scheduleReminderNotification

## 8. 去重机制

createProductReminder：activeItems 中已存在 `productId == productId && relatedReleaseId == relatedReleaseId && type == type && !isDeleted` → 返回 null 不创建；页面提示「该提醒已设置过」

## 9. 通知调度

- 完全复用现有体系：reminder-store.addItem → repo.add（本地）+ enqueueLocalOperation（离线队列）+ createAssetRemote（远程）+ scheduleFor（本地通知调度）
- 未重写 notification 系统；scheduleReminderNotification 零改动

## 10. 旧数据兼容

- 历史 FavoriteEntry 无 releaseId → 空串 → fallback currentRelease，正常显示
- 历史 Reminder 无 productId/relatedReleaseId → 空串 → 正常加载/触发
- relatedWishId 保留未删；relatedPurchaseId 保留未删；syncPurchaseReminders 旧订单链路零改动

## 11. 数据库确认无需 migration

- wishlist_items.release_id：0008_user_interaction.sql 已存在（生产已应用）
- Reminder 存储 user_assets.payload_json（jsonb schema-free）：productId/relatedReleaseId 直接透传
- 后端改动仅为 zod schema + SQL 参数，无 DDL、无新表、无索引变更

## 12. 文件修改列表

前端 8 + 后端 5 = 13 文件（均在审计 §12 最小范围，无凑数文件）

## 13. check

`npm run check` → [PASS] 全部 check 通过（唯一 WARN 为既有「待运营补充」发布门禁项，非本轮引入）

## 14. source

`npm run check:source` → [PASS]

## 15. android

`npm run check:android` → [PASS]

## 16. mp-weixin

`npm run check:mp-weixin` → [OK]
真实编译：`/opt/hbuilderx/HBuilderX/cli launch mp-weixin --compile true --project /home/admin/projects/sankengcloset` → **compiled successfully（23:19，ready in 42207ms，30 页面）**
产物验证：favorites/index.js 含 favoriteReleaseText/favoriteReleaseOf/reminderDateFor/onEnableReminder/remindersForProduct/createProductReminder；releaseId 在 user-data-service.js/product-service.js/content-library-store.js；relatedReleaseId 在 reminder-store.js/reminder-repo.js/reminder.js

## 17. backend test

`npm test` → **17 files / 175 passed / 1 skipped**（23:19 fresh，后端 5 文件修改后无回归）
typecheck 9 个 error 均为 AI import 区域 pre-existing（TS2769 AiSuggestion，非本轮引入，改动行不在错误列表）

## 18. 风险

| 风险 | 等级 | 说明 |
|---|---|---|
| 多批次选择 UI 未实现 | 中 | getProduct?releaseId 已支持按批次定位，但用户只能通过详情页收藏时锚定当前批次；收藏页「一键提醒」针对该锚定批次；多批次切换 UI 留后续阶段 |
| 首页/搜索收藏无 releaseId | 低 | Feed 无批次主键，收藏页 fallback currentRelease（最新批次），符合规则 3 |
| 取消收藏不级联清理提醒 | 低 | 未实现 toggleFavorite 删除分支清理 RELEASE 提醒（本阶段未要求，列为未完成项） |
| 后端 typecheck pre-existing 9 errors | 低 | AI import 区域历史遗留，test/构建不受影响 |

## 19. 未完成项

1. 收藏取消 → 关联 RELEASE 提醒级联清理（后续阶段）
2. 多批次选择 UI（Release 列表 API + 选择器，后续阶段）
3. 本地通知深链 target（通知点开跳商品详情，依赖平台能力）
4. 后端 9 个 pre-existing typecheck error 修复（AI import 区域，独立任务）

---

## 验收对照（用户第十四节 18 项）

1. 新 Favorite 保存 releaseId ✅（写链路透传 + 入队 payload 含 releaseId）
2. refresh 后 releaseId 不丢失 ✅（refreshRemoteFavorites 读取 + 本地持久化）
3. Favorite 显示对应 Release ✅（favoriteReleases + favoriteReleaseText）
4. currentRelease 不覆盖用户 releaseId ✅（回退不写回）
5. 一键提醒创建 Reminder ✅（onEnableReminder → createProductReminder）
6. Reminder 有 productId ✅
7. Reminder 有 relatedReleaseId ✅
8. 同 Release 不重复创建 ✅（去重键 productId+relatedReleaseId+type）
9. 历史 Favorite 无 releaseId 仍可用 ✅（fallback currentRelease）
10. 历史 Reminder 无 relatedReleaseId 仍可用 ✅（空串兼容）
11. 本地通知调度接入现有系统 ✅（复用 addItem 全链路）
12. 无数据库 migration ✅
13. npm run check PASS ✅
14. check:source PASS ✅
15. check:android PASS ✅
16. check:mp-weixin PASS ✅
17. 真实 mp-weixin 编译 PASS ✅
18. 后端 npm test PASS ✅（175 passed / 1 skipped）

**最终结论：PASS**

停止。不进入 Phase 1.1-D。
