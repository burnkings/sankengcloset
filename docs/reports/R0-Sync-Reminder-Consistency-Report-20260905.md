# R0-同步与提醒一致性修复 — Feature Report（2026-09-05）

基线：main@20c1c69。改动范围：前端 sankengcloset（11 文件 +270/−121 + 新增契约脚本 1），后端零改动。
验证：真实 mp-weixin 编译（HBuilderX CLI, ready in 69980ms）+ 产物级断言 + `npm run check` 全绿。

## 一、问题清单 → 修复对照

| # | 问题（现状缺陷） | 修复 |
|---|---|---|
| 1 | `flushLocalOperations` 里 `if (!config.mockOnline) return 0`：RuntimeConfig.mockOnline 恒为 false（remote 固化模式），**remote 队列永不 flush**，离线入队的操作永远无法重放 | remote flush 仅以「已登录」为前提；删除整段 mock 伪成功分支（setTimeout+清空队列）；新增 `uni.getNetworkType` 网络门禁（'none' 安静返回 0 保留队列，恢复联网由 App.uvue onNetworkStatusChange → syncNow 重放）；预清扫（7 天 TTL / legacy max_retry）保留 |
| 2 | reminder-store create/update/delete/markDone/markUndone 全部「先入队**再**直写远端」：直写成功但队列入队在前 → 修复 #1 后重放会**重复建实体** | 五个动作全部收敛到 `services/sync/write-back.uts` 的 syncWriteBack（远端优先、失败才入队；成功返回 '' 不入队）。write-back 本体改为 `async`（原实现声明返回 string 实际返回 Promise，类型/语义均不正） |
| 3 | 重放无幂等收敛：create 重放失败一律 return 0 → 重试 3 次即存档；无“已存在=成功”语义 | 新增 `replayErrorResult` 统一分类（详见 §三）；后端幂等由「客户端稳定 id 落库 + 409 冲突」与「wishlist user+productId 唯一约束」保证（存量后端能力，非伪造） |
| 4 | repo/store 合并只在非空时覆盖 → note/remindDate/remindTime/productId/relatedReleaseId/wardrobeBindings **无法清空**（空字符串/空数组被跳过）；另 isAllDay 未传即被无条件重置 false | ReminderUpdateData 全字段 `string|null`/`boolean|null`/`string[]|null`：null=未提供（跳过）、''/[]=显式清空；repo.update 改 `!= null` 逐字段合并；store.updateItem 删除双份手工合并，以 repo 为唯一合并源（`_state.items = repo.getAll()`） |
| 5 | 删除订单不处理其自动提醒 → PENDING 孤儿提醒继续提醒不存在的订单；取消订单已有结束路径 | `purchase-store.deletePurchase` 捕获目标订单后调用 reminder-store 新增 `removePurchaseLinkedReminders`（级联软删该订单 BALANCE/ARRIVAL 提醒并统一写回，远端 DELETE 404=幂等成功）；取消订单维持 updatePurchase → syncPurchaseReminders 结束路径 |
| 6 | 远程账号（真 token）下 update/delete 以本地 repo 为准，而远端 fetch 从不落 repo → 远端拉取的条目离线不可编辑/删除（级联删除同此阻塞） | reminder/purchase store 的远端 fetch 把「远端快照 ∪ 本地待重放 create/upsert 实体、剔除待重放 delete 实体」persist 进 repo 缓存（对齐 content-library refreshRemoteBrands 的“远端 ∪ 本地待同步”模式），保证离线可编辑并正确入队；purchase-repo 补 persist 导出 |

## 二、文件变更

- services/sync/local-sync-queue.uts：网络门禁、replayErrorResult 分类、flushRemote 401 中止一致性、flushLocalOperations 去 mockOnline/去 mock 分支、去 retryCount 自增
- services/sync/write-back.uts：async 远端优先重写（成功 '' / 失败入队）
- services/platform/api-client.uts：导出 `apiErrorStatus(error)`（HTTP 状态码 / 网络层 0）
- domain/reminder.uts：ReminderUpdateData 可空化（清空语义）
- domain/repositories/reminder-repo.uts：update 改 `!= null` 合并
- domain/repositories/purchase-repo.uts：新增 persist 导出
- stores/reminder-store.uts：五动作走 syncWriteBack、updateItem 单合并源、fetch 快照合并、removePurchaseLinkedReminders
- stores/purchase-store.uts：fetch 快照合并、deletePurchase 级联
- scripts/check-r0-sync-consistency.js（新增）：R0 可执行契约（源码模式 C1–C9 全量 + 编译产物模式）
- scripts/check-v24-remote-runtime.js：只增断言（write-back/local-sync-queue/两 store/api-client 新符号），并把过期的 pages/budget needles 对齐当前真实页面 API（旧断言在基线 HEAD 即红，git worktree 取证）
- scripts/check.js：接入 R0 契约步骤
- scripts/check-source-gates.js：pages.json 解析改 JSONC 感知（基线即红：pages.json 含注释、JSON.parse 必败），未删任何原有断言

## 三、重放错误分类（replayErrorResult，客户端真实语义）

- 成功 → 移除
- create/upsert/import × 409（同 id 已存在）→ **幂等成功**，移除（后端 /me/* 资产按客户端 id 落库；重放 POST 收敛为已存在，绝不重复）
- delete × 404（已不存在）→ **幂等成功**，移除
- 网络层(0) / 429 / ≥500 → 瞬时失败：保留队列标记 SYNC_FAILED，下次 flush 再试；**不消耗 retryCount**（旧版每次失败 +1、3 次即存档——离线启动 3 次 app 就会误淘汰可恢复操作；上限改由 7 天 TTL 预清扫兜底）
- 其余 4xx → 不可重试：立即 `dropOperation(reason='http_<status>')` 存档降级（可 drain 恢复），不无限重试
- 401（Authorized 已内部单飞刷新并重试一次后仍 401）→ 抛出中止整次冲刷：flushRemote 先持久化「已成功移除、本 op+未处理 op 保留」，队列原样保留待重新登录

## 四、数据流（修复后）

离线创建：repo.add(生成稳定 id) → _state 追加 → syncWriteBack：无 token/失败 → enqueue(payload=完整实体含 id)
恢复联网：onNetworkStatusChange/onAppShow/登录成功 → syncNow → flushLocalOperations（token? 网络? 预清扫）→ flushRemote 逐条 replayOperation（Authorized CRUD，401 单飞刷新内置）→ 分类结果 移除/保留/存档/中止 → writeIds 持久化队列
重复 flush：flush 幂等（队列已空 return 0）；同 id create 重放 409=成功；fetch 快照合并防覆盖/防复活
订单删除：deletePurchase → repo.softDelete → removePurchaseLinkedReminders(逐条 deleteItem→write-back delete) → purchase delete write-back

## 五、后端 API 契约清单（需求 3 条款：后端暂不支持 clientMutationId 时须明确列出）

结论：**不需要新增 clientMutationId 字段**。后端存量能力已覆盖客户端所需幂等收敛（本次零后端改动）：

| 契约 | 现状 | 客户端用法 |
|---|---|---|
| A. POST /api/v1/me/{reminders,purchases,wardrobe,wishes}：createSchema 接受客户端 `id`；同 id 再 POST → 409 conflict | ✅ 存量（user-data.ts registerAssetRoutes：requestedId=body.id，已存在抛 conflict） | create 重放 body 携带稳定 id；409 → 幂等成功 |
| B. PATCH /api/v1/me/:kind/:id：partial schema，空串合法字段（note/remindTime/productId/relatedReleaseId 等）可写空 | ✅ 存量 | update payload=同步后完整实体；'' 即清空 |
| C. DELETE /api/v1/me/:kind/:id：不存在 → 404 | ✅ 存量 | 404 → 幂等成功 |
| D. POST /api/v1/wishlist：user+productId 唯一（ON CONFLICT DO NOTHING / 查重返回既有） | ✅ 存量（postgres.ts addWishlist） | favorite 重放重复 POST 返回既有条目 |
| E. POST /api/v1/brands/follow：ON CONFLICT DO NOTHING | ✅ 存量 | 重复 follow 幂等 |
| F. Idempotency-Key 头（app.ts 全局 hook，userId:key，10 分钟窗口） | ✅ 存量（内存 Map） | 不做跨日回放幂等主键（窗口短、重启即失）——客户端 id 落库已是更强收敛；如需可后续接入 |

**已知后端限制（非阻塞，需后端确认/放开的演进项）**：
1. PATCH remindDate 有 `z.string().min(1)`，**无法显式清空日期**；本地 repo 已支持清空语义，远端 PATCH 空日期会 400 → 存档（reason http_400，可 drain 恢复）。当前 UI/业务流不会产生该输入（编辑页日期必填、syncPurchaseReminders 仅在 deadline/arrivalDate 非空时写提醒）。若产品需要“删除提醒日期”，需后端放开 remindDate 可空（PATCH 语义）。
2. isAllDay/wardrobeBindings 不在后端 reminderSchema（local-only 富化字段）：远端 fetch 会按缺省还原为空——已属既有行为（云端无此二字段），R0 未引入新差异。

## 六、测试与门禁结果（全部实测）

1. `node scripts/check-r0-sync-consistency.js`（源码模式）→ 源码 C1–C9 全 PASS（先于实现编写，基线 RED 19 项）
2. `node scripts/check-r0-sync-consistency.js unpackage/dist/dev/mp-weixin`（产物模式）→ PASS（编译产物真实含 409/404/401/≥500/http_/SYNC_FAILED/无 mockOnline/无 retryCount 自增/token+网络门禁/级联函数/null 清空语义/async write-back；mp-weixin 编译产物 mtime=2026-09-05 02:02:57 本次编译）
3. `npm run check` → 全部 check 通过（runtime contract 含新 R0 步骤 / android static / source gates / compiled require checks）
4. `python3 scripts/patch-vendor.py` → 产物 V3 结构校验 OK
5. 覆盖场景映射：离线创建（C2）、恢复联网（C1，App.uvue 网络监听→syncNow 链路为既有代码，未改）、重复 flush（C3+409 幂等）、401 刷新（C4，Authorized 单飞刷新为既有 + 刷新失败中止保留）、5xx 重试（C5）、不可重试 4xx（C6）、删除幂等（C7，delete×404）、清空语义（C8）、孤儿提醒（C9）

## 七、范围边界（约束遵守）

- 未新增/修改业务页面、未动五 Tab（pages.json 无变更）
- 未引入 Mock 成功路径；queue 的 mock 伪成功分支为**删除**而非新增
- 后端零改动；未在客户端用随机延迟/清空队列伪造成功
- 未删除 check-v24 既有断言（budget 三条为“对齐真实页面 API”的更新，基线即红已取证）

## 八、遗留与建议

1. wardrobe/wishlist store 的远端 fetch 尚未做 repo 快照合并（reminder/purchase 已做）——同类远程账号离线编辑缺口，建议后续 Feature 统一处理
2. 被 4xx 存档的操作可从 v21_sync_dropped drain 恢复，UI 层无入口（既有，未扩）
3. 5xx 重试无退避策略（沿用启动/联网/前台 flush 时机，已在分类注释标注）
