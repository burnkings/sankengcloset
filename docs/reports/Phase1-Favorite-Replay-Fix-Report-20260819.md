# Phase 1 Final Verification Risk #3 — Favorite Replay Fix Report

日期：2026-08-19 23:40
范围：Risk #3 最小修复验证 —— content-library-store.updateFavoriteStatus 离线入队 action='update' 重放状态丢失
结论：**PASS（缺陷已修复，本轮 fresh 验证确认，零新代码修改）**

---

## 1. 根因

content-library-store.uts `updateFavoriteStatus()`（417-430 行）在离线/未登录场景入队：
- 已登录 + itemId → PATCH 失败后入队 `{entityType:'favorite', entityId: itemId, action:'update', payload:{productId, status}}`
- 未登录 / itemId 空 → 入队 `{entityType:'favorite', entityId: productId, action:'update', payload:{productId, status}}`

原 replayFavorite() 无 update 分支：非 delete 一律 POST 创建且 status 硬编码 'WISH' → WANT/WAIT_RELEASE/WAIT_PRICE/PURCHASED 重放后丢失 + 可能重复创建条目。

## 2. 修改文件

**唯一文件：** `services/sync/local-sync-queue.uts`
**唯一函数：** `replayFavorite()`（新增 update 分支，+32 行）
该修复已于 Phase 1（2026-08-19 17:29 会话《Phase 1 Favorite Offline Replay Fix》+ git 9b1a321 复查轮）落地工作区，当前未 commit。

## 3. 修改逻辑（local-sync-queue.uts:172-201）

```
if (op.action == 'update') {
  status = payload.status（缺失返回 0 保留队列）
  items = listWishlistRemote()
  场景 1：items 中存在 id == op.entityId（wishlist itemId）
          → PATCH /api/v1/wishlist/:entityId {status} → return 1
  场景 2：targetProduct = payload.productId || op.entityId
          存在 productId == targetProduct 的条目
          → PATCH /api/v1/wishlist/:itemId {status} → return 1
  服务端无对应条目 → return 0（保留队列重试，绝不 POST）
}
```

## 4. update 重放流程

```
离线：updateFavoriteStatus → 本地乐观更新 + enqueue(update)
恢复：syncNow → replayOperation → replayFavorite(action='update')
  ├─ entityId 是 itemId → 直接 PATCH（场景 1，行 179-185）
  ├─ entityId 是 productId → listWishlistRemote 定位 → PATCH（场景 2，行 187-198）
  └─ 服务端尚无条目（前置 upsert 未重放）→ return 0 保留队列，下一轮命中
```

## 5. 状态透传证明

- 行 175：`const status = body['status'] != null ? body['status'] as string : ''` —— 原始状态透传
- 行 182/194：PATCH payload 仅 `{ status }` —— 无硬编码，WANT/WAIT_RELEASE/WAIT_PRICE/PURCHASED 原样提交
- 后端 updateWishlistSchema 校验 VALID_WISH_STATUSES（WISH/WANT/WATCHING/WAIT_RELEASE/WAIT_PRICE/PURCHASED）→ 四种状态均合法
- 编译产物（fresh）：services/sync/local-sync-queue.js 含 listWishlistRemote×2（双场景定位）+ wishlist/×3（PATCH/DELETE/POST）

## 6. 去重证明

- update 分支**零 apiPost 调用**：只有 apiPatchAuthorized（行 182/194）
- 服务端无对应条目 → return 0 保留队列重试（行 199-200），由前置 upsert 重放后命中，不会自行 POST 建重复条目
- 幂等：同一 update 重复重放 = 重复 PATCH 同 status，无副作用

## 7. delete / create 回归

- delete 分支（行 155-171）独立保留：按 productId 查服务端条目 → DELETE（不存在视为已删除 return 1）—— 零改动
- 非 update/delete 的 create/upsert（行 202-207）fallthrough 到原 POST 逻辑（status 'WISH' + productId）—— 零改动
- 其余实体重放（reminder/wardrobe/purchase…）replayOperation 分发逻辑未触碰

## 8. 全部验证结果（fresh 执行）

| 场景 | 结果 | 证明 |
|---|---|---|
| 1. update + wishlist item id → PATCH | ✅ | 行 179-185 场景 1 直接 PATCH |
| 2. update + product id → 定位后 PATCH | ✅ | 行 187-198 场景 2 listWishlistRemote 定位 |
| 3. status=WANT 透传 | ✅ | 行 175 status 透传，无硬编码 |
| 4. status=WAIT_RELEASE 透传 | ✅ | 同上 |
| 5. status=WAIT_PRICE 透传 | ✅ | 同上 |
| 6. status=PURCHASED 透传 | ✅ | 同上 |
| 7. 不再 POST 创建重复条目 | ✅ | update 分支零 apiPost；无条目 return 0 |
| 8. delete 原有行为不受影响 | ✅ | delete 分支独立，未触碰 |
| 9. 普通创建原有行为不受影响 | ✅ | fallthrough POST 分支未触碰 |

门禁（fresh，本轮执行）：
- npm run check → [PASS] 全部 check 通过
- npm run check:source → [PASS]
- npm run check:android → [PASS]（12 项）
- npm run check:mp-weixin → [OK]
- 编译产物验证：unpackage/dist/dev/mp-weixin/services/sync/local-sync-queue.js 含 replayFavorite（2 处）、listWishlistRemote（2 处）、wishlist/ 路径（3 处）—— update 分支已编入产物

测试说明：前端无 test script（门禁 = check 系列），local-sync-queue 无既有单元测试；按"不为此大范围改架构"原则，未引入测试框架，以代码路径逐行证明 + 门禁 + 编译产物替代。Phase 1 修复当时的生产 API E2E 已 8/8 PASS（四种状态透传 + 双场景定位 + 无重复创建 + DB 零残留）。

## 9. git diff（replayFavorite update 分支，+32 行）

```
@@ replayFavorite(op: SyncOperation) @@
+    if (op.action == 'update') {
+      // 状态更新重放：只 PATCH，绝不 POST 创建，避免重复 wishlist 条目
+      const body = payload != '' ? JSON.parse(payload) as UTSJSONObject : {} as UTSJSONObject
+      const status = body['status'] != null ? body['status'] as string : ''
+      if (status == '') return 0
+      const items = await listWishlistRemote()
+      // 场景 1：entityId 即 wishlist itemId（已登录直更失败入队）→ 直接 PATCH 该条目
+      for (...) if (raw['id'] == op.entityId) {
+        await apiPatchAuthorized('/api/v1/wishlist/' + encodeQuery(op.entityId), { status })
+        return 1
+      }
+      // 场景 2：entityId 为 productId（未登录入队）→ 按商品定位服务端条目后 PATCH
+      const targetProduct = body['productId'] ?? op.entityId
+      if (targetProduct != '') for (...) if (raw['productId'] == targetProduct) {
+        const itemId = raw['id']; if (itemId == '') return 0
+        await apiPatchAuthorized('/api/v1/wishlist/' + encodeQuery(itemId), { status })
+        return 1
+      }
+      // 服务端尚无对应条目：保留队列重试（前置 upsert 重放后即可命中；不 POST 创建）
+      return 0
+    }
```

---

## 结论

**PASS。** 该数据一致性缺陷的修复代码已在工作区（services/sync/local-sync-queue.uts replayFavorite update 分支，未 commit），与本次要求逐项一致；本轮 fresh 验证（4 门禁 + 编译产物）全部通过，无新代码修改、无范围扩大。

停止。不进入 Phase 2，不 commit。
