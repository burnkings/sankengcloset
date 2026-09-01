# Phase 1.1-A Product Release Data Channel Report

日期：2026-08-19
范围：product_releases → Backend Product API → Product Service → ProductDetailModel → Product Detail
基线：Phase 1 Final Verification PASS；Phase 1.1 Gap Report 结论有效
最终结论：PASS

---

## 1. 修改前数据流

```
product_releases 表（数据存在：release_type/sale_status/lifecycle_status/时间/定金/尾款/全价/is_rerelease）
  └─ listFeed 已取最新 release 行（feed 可用）
  └─ getProduct 不返回 release ❌ 断点
GET /api/v1/products/:id → mapProduct（纯商品本体，无 release 字段）
  → product-service.mapRemoteProduct
      ├─ badgeText = statusLabel(status)  ← UI 文案推导发售状态（PRE_ORDER→预售/UPCOMING→预告/...）
      ├─ eventEndAt 恒为 ''
  → detail.uvue
      ├─ statusTag 显示 badgeText（猜测状态）
      ├─ stages = ['图透','定金','尾款','现货'] 硬编码（与真实批次无关）
      ├─ currentStage 由 badgeText 推导（猜测）
      ├─ createReminder type 由 badgeText==='尾款' 判断（猜测）
      └─ createPurchase amount/deadline 用商品价格/eventEndAt（无批次数据）
```

## 2. 修改后数据流

```
product_releases 表
  └─ getProduct：LATERAL JOIN 取最新未删除 release 行 → Product.currentRelease（ProductRelease DTO）
GET /api/v1/products/:id → { ...product, currentRelease: { releaseName, releaseType, saleStatus,
  lifecycleStatus, isRerelease, depositCents, balanceCents, fullPriceCents, startAt, endAt,
  balanceDueAt, shipAt } | null }
  → product-service.mapRemoteProduct
      ├─ mapCurrentRelease() → ReleaseEvent（复用 Domain，非第二套模型）
      ├─ item.eventEndAt = currentRelease.endAt（有批次时）
      └─ ProductDetailModel.currentRelease: ReleaseEvent | null
  → detail.uvue
      ├─ statusTag = deriveReleaseStatusText(currentRelease)（真实状态）
      ├─ 「发售信息」卡片：批次名/发售时间/定金/尾款/全价（有数据才显示）
      ├─ createReminder type = releaseStatusText==='尾款' ? BALANCE : RELEASE；date = balanceDueAt > endAt > eventEndAt
      └─ createPurchase amount = fullPrice > 0 ? fullPrice : price；deadline = balanceDueAt > endAt > eventEndAt
```

## 3. Backend 修改（sankengcloset_service，上轮中断会话已实施，本轮验证闭合）

| 文件 | 修改 |
|---|---|
| src/types.ts | Product 增加 `currentRelease: ProductRelease \| null`；新增 `ProductRelease` 接口（releaseName/releaseType/saleStatus/lifecycleStatus/isRerelease/depositCents/balanceCents/fullPriceCents/startAt/endAt/balanceDueAt/shipAt） |
| src/repositories/postgres.ts | `getProduct`：LATERAL JOIN `product_releases`（deleted_at is null，按 created_at desc limit 1）→ 组装 currentRelease；`mapProduct` 补 `currentRelease: null`（列表场景不使用） |
| src/repositories/memory.ts | fixtures 补 `currentRelease: null`；`getProduct` 返回 `currentRelease: null`（内存无 release 数据源） |

- 未增加 migration、未重设计 product_releases、未复制 listFeed 的 release 查询（getProduct 独立 LATERAL JOIN，无 helper 可复用——listFeed 用子查询且仅取 5 个字段，getProduct 需完整批次字段，语义不同）
- 验证：`npx tsc --noEmit` 本轮改动区域零错误（剩余 pre-existing 错误均在 AI 导入区域，与本轮无关）

## 4. Frontend 修改（sankengcloset）

| 文件 | 修改 |
|---|---|
| domain/content/release-event.uts | ReleaseEvent 扩展批次字段：releaseType/saleStatus/lifecycleStatus/isRerelease/fullPrice/balanceDueAt/shipAt（复用模型，非新建） |
| presentation/content/feed-presenter.uts | 新增 `deriveReleaseStatusText(release: ReleaseEvent \| null): string` 纯函数 |
| services/content/product-service.uts | ProductDetailModel 增加 `currentRelease: ReleaseEvent \| null`；新增 `mapCurrentRelease()` 映射；item.eventEndAt 取批次 endAt |
| pages/product/detail.uvue | statusTag/发售信息卡/createReminder/createPurchase 全部改用 currentRelease；删除 stages/currentStage/步骤条硬编码 |

## 5. Release Domain 复用情况

- 未创建 ProductRelease / ReleaseEvent 两套前端模型
- 后端 `ProductRelease` 是 API DTO（仅详情展示字段）；前端一律映射到已有 `ReleaseEvent` Domain
- ReleaseEvent 仅扩展 7 个最小字段（reuse + extend，不是 duplicate）
- 后端字段 → ReleaseEvent 映射：releaseName→title、releaseType→eventType+releaseType、saleStatus→saleStatus、lifecycleStatus→status+lifecycleStatus、depositCents→depositAmount、balanceCents→finalPaymentAmount、fullPriceCents→fullPrice、isRerelease→isRerelease、startAt/endAt/balanceDueAt/shipAt 原样

## 6. currentRelease 数据结构

```
Product.currentRelease: ProductRelease | null（后端）→ ReleaseEvent | null（前端）
  id / productId / brandId
  title          = releaseName（批次名，如「一期首发」）
  eventType      = releaseType（first_release/rerelease/reservation/spot/lottery/unknown）
  releaseType    = 同上（保留原值）
  saleStatus     = UPCOMING/ON_SALE/PRE_ORDER/SOLD_OUT/ENDED
  lifecycleStatus = upcoming/active/ended/sold_out/unknown；status = lifecycleStatus
  isRerelease    = boolean
  depositAmount  = 定金（分）；finalPaymentAmount = 尾款（分）；fullPrice = 全价（分）
  startAt / endAt / balanceDueAt / shipAt（ISO 8601）
```

## 7. Product Detail 修改

- statusTag：`deriveReleaseStatusText(currentRelease)`（无批次 → 「官方信息」，不伪造）
- 「发售进度」步骤条（硬编码 ['图透','定金','尾款','现货'] + badgeText 推导）→ 删除
- 「发售信息」卡片（仅 currentRelease 非空显示）：
  - 批次名、发售时间（startAt ~ endAt）、定金、尾款、全价——每个字段独立 v-if，无数据不渲染、不显示 0
- createReminder：type = releaseStatusText==='尾款' ? 'BALANCE' : 'RELEASE'；date 优先级 balanceDueAt → endAt → eventEndAt
- createPurchase：amount 优先级 fullPrice → price；deadline 同 reminder
- Reminder 模型本阶段零改动（按指令，productId 关联留待下阶段判断 Product vs ReleaseEvent）

## 8. 无 Release 行为

- 后端：currentRelease = null（LATERAL JOIN 无行）
- 前端：ProductDetailModel.currentRelease = null；statusTag 显示「官方信息」；「发售信息」区块整块不渲染；createReminder/createPurchase 回退商品自身数据（price/eventEndAt=''）
- 测试：tests/content/product-release.test.ts（memory）3 用例全部通过——getProduct 契约稳定、无 release 商品 currentRelease=null、不存在的商品返回 null

## 9. 首发验证

- deriveReleaseStatusText：releaseType==='first_release' → 「新品」（覆盖用户清单「新品」）
- 映射链路：getProduct SQL → ProductRelease.releaseType → mapCurrentRelease → ReleaseEvent.releaseType → 推导函数
- 数据级验证受生产库保护约束（见 16. 风险），逻辑经代码审查 + mp-weixin 编译证明

## 10. 再贩验证

- deriveReleaseStatusText：isRerelease || releaseType==='rerelease' → 「再贩」（优先级高于首发/定金）
- 同上链路，SQL 子句 `pr.is_rerelease` 与 `release_type` 均已映射

## 11. 定金/尾款验证

- 定金：depositAmount > 0 → 「定金」（first_release 之后的优先级）
- 尾款：finalPaymentAmount > 0 且 balanceDueAt 在未来 → 「尾款」（最高优先级，尾款期展示）
- 金额展示：定金/尾款/全价独立 v-if（>0 才渲染，不显示 0）

## 12. check

`npm run check` → [PASS] 全部 check 通过（含 audit regression gates：无双重转义正则/无法律占位/urlCheck on/无 navigateTo-to-tabBar）

## 13. check:source

`npm run check:source` → [PASS]（V3 source gates：无 components/v2 refs、theme tokens 响应式、pages.json 路由与 tabbar 图标存在；WARN 为既有「待运营补充」常量，非本轮引入）

## 14. check:android

`npm run check:android` → [PASS]（remote detail service / multi-image detail / Android-safe root layout / theme chrome）

## 15. check:mp-weixin

- `npm run check:mp-weixin` → [OK]（基于重新编译产物）
- 真实 mp-weixin 编译：`/opt/hbuilderx/HBuilderX/cli launch mp-weixin --project /home/admin/projects/sankengcloset --compile true` → **compiled successfully（45.3s）**
- dist 产物验证：product-service.js 含 5 处 currentRelease；detail.js 含 11 处 currentRelease/releaseStatusText/deriveReleaseStatusText

## 16. 风险

1. 首发/再贩/定金尾款的数据级端到端验证未执行：生产库（127.0.0.1:5433）保护约束，禁止插入测试 product_releases 行污染生产数据；验证靠 SQL 审查 + 推导函数逻辑 + 编译证明。若需数据级验证，应在独立测试库执行（当前无独立测试库，integration test 因 TEST_DATABASE_URL 未配置而 skip）
2. detail.uvue 发售进度步骤条删除属 UI 结构调整：有 release 商品显示「发售信息」卡，无 release 商品该区块隐藏（不伪造）。布局风险低（同卡片样式体系）
3. ReleaseEvent 扩展字段为前端增量，旧数据无此字段时默认值兜底（releaseType='unknown'、saleStatus=''、金额 0），不会崩溃
4. deriveReleaseStatusText 中尾款期判断依赖 balanceDueAt 未来时间；若后端该字段缺失或历史数据为空，回退到 releaseType/deposit 判断，不会误报

## 17. 未完成项

1. 首发/再贩/定金尾款的数据级 E2E 验证（需独立测试库或用户授权生产只读验证）
2. Reminder.productId 关联（Phase 1.1 后续阶段按指令单独判断：绑定 Product 还是 ReleaseEvent）
3. Favorite 页 Reminder 状态与一键开启提醒（Phase 1.1-B）
4. Feed mapper 字段补全（releaseType/tags/feedReason，Phase 1.1-C）
5. 三坑搜索词库（Phase 1.1-D）

---

## 验证证据汇总

| 项 | 结果 |
|---|---|
| 后端 tsc（本轮区域） | 零错误 |
| 后端 npm test | 17 files / 175 passed / 1 skipped（新增 3 用例） |
| npm run check | PASS |
| npm run check:source | PASS |
| npm run check:android | PASS |
| npm run check:mp-weixin | OK |
| 真实 mp-weixin 编译 | compiled successfully（45.3s） |
| 违规扫描（console/mock/TODO） | CLEAN |
| 重复声明检查（detail.uvue 8 个新标识符） | 全部唯一 |

结论：**PASS**。Product → Release 数据通道已打通，UI 停止 badgeText 猜测，真实 currentRelease 驱动详情页。停止，不进入 Phase 1.1-B。
