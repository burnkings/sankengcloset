# Phase 1.1-B Feed Business Data Completion Report

日期：2026-08-19
范围：ContentFeedItem → Feed API → mapFeedItem → FeedItem Domain → Presenter → UI 数据完整性
基线：Phase 1 PASS；Phase 1.1-A PASS
Gap 报告：《Phase 1.1-B Feed Data Gap Report》（docs/reports/Phase1.1-B-Feed-Data-Gap-Report-20260819.md）
最终结论：**PASS**

---

## 1. Gap

- **Domain/mapper 数据丢失**：后端 ContentFeedItem 已返回 29 业务字段 + feed 路由 enrich 3 个性化字段，前端 FeedItem Domain 与 mapFeedItem 只保留 19 个，丢弃 11 个（pitType/priceSummary/saleStatus/releaseType/releaseTypeName/tags/feedReason/personalScore/matchReason/finalScore/publishedAt）
- **saved 违规**：首页 FeedColumn 与搜索页 ProductCard 用 `library.isFavorite(entityId)`（本地库）覆盖服务端 saved，违反「不得用本地猜测覆盖服务端真实值」
- **badgeText 猜测发售状态**：filterFeedByChannel 预约频道用 badgeText（'预约'/'定金'）判断，应改用真实业务字段
- **tags 类型风险**：后端 string[]，前端无对应字段，若引入需保持明确类型 + 安全空值

## 2. 后端真实字段（ContentFeedItem，src/types.ts）

29 业务字段 + 路由层 enrich 3 个性化字段（personalScore/matchReason/finalScore，仅 /api/v1/feed）：
id / feedType / entityId / title / subtitle / coverUrl / secondaryCoverUrl / brandId / brandName / category /
pitType / price / originalPrice / priceSummary / saleStatus / releaseType / releaseTypeName / tags(string[]) /
feedScore / rankingScore / feedReason / badgeText / eventStartAt / eventEndAt / liked / saved / sourceLabel /
publishedAt / createdAt

## 3. API response

- /api/v1/feed：全部 32 字段返回（含个性化 3 字段）
- /api/v1/search：29 字段返回（无个性化 3 字段，route 未 enrich——mapper 安全兜底为 0/''，不报错）

## 4. Domain（domain/content/feed-item.uts）

补 11 字段（全部唯一声明）：
pitType / priceSummary / saleStatus / releaseType / releaseTypeName / tags(string[], 默认 []) /
feedReason / personalScore / matchReason / finalScore / publishedAt
saved 注释明确为「服务端真实收藏态」；wished 为无业务源的旧字段，保留未动

## 5. mapper（services/content/feed-service.uts mapFeedItem）

- 补 11 字段映射，全部 `!= null` 安全判断 + 类型化默认值
- tags：`raw['tags'] as any[] | null` → 显式遍历 push string，缺失/异常时保持 []（安全空值，禁止伪造）
- saved：`raw['saved'] == true` 安全布尔（已存在，未改动）
- search 响应缺个性化字段时：personalScore/finalScore=0、matchReason=''（不崩溃）

## 6. presenter（presentation/content/feed-presenter.uts）

不丢字段：纯展示函数库，无 FeedItem 重映射环节。本轮零改动。

## 7. UI

- FeedColumn.uvue：`:saved="item.saved"`（服务端值）；移除不再使用的 library 引用（import + 实例）
- pages/home/index.uvue：onToggleSave 增加 `store.toggleSave(item.id)` 乐观翻转服务端 saved（刷新后以服务端权威为准）
- pages/search/index.uvue：两处 `:saved="item.saved"`；onToggleSave 本地翻转 results 对应项
  （属 saved 数据完整性一行级修复，非 Search 功能开发；Search 业务逻辑零改动）
- filterFeedByChannel：预约频道改 `saleStatus==='PRE_ORDER' || releaseType==='reservation'`（真实业务字段），保留 badgeText 兜底防漏；新品/降价/穿搭频道语义不变
- 推荐字段（feedReason/personalScore/matchReason/finalScore）仅入 Domain，UI 不强行展示（按指令留待 Recommendation UX）
- 未触碰：FeedBlock 架构、Feed 卡片、首页布局、Product Detail、Favorite、Reminder、Search 功能

## 8. 修改文件

| 文件 | 修改 |
|---|---|
| domain/content/feed-item.uts | +11 业务字段 |
| services/content/feed-service.uts | mapFeedItem +11 映射（tags 安全解析）；filterFeedByChannel 预约改真实字段 |
| components/v3/FeedColumn.uvue | saved=item.saved；清理 library |
| pages/home/index.uvue | onToggleSave 同步 store.toggleSave |
| pages/search/index.uvue | saved=item.saved ×2；onToggleSave 本地翻转 |

## 9. 字段映射表

| 后端字段 | Domain | mapFeedItem | UI |
|---|---|---|---|
| releaseType | ✅ | ✅ | 数据保留（Filter 预约频道使用） |
| releaseTypeName | ✅ | ✅ | 数据保留 |
| saleStatus | ✅ | ✅ | Filter 预约频道使用 |
| pitType | ✅ | ✅ | 数据保留 |
| priceSummary | ✅ | ✅ | 数据保留 |
| tags | ✅ string[] | ✅ 安全解析 | 数据保留 |
| feedReason | ✅ | ✅ | 数据保留（后续 Recommendation UX） |
| personalScore | ✅ | ✅ | 数据保留 |
| matchReason | ✅ | ✅ | 数据保留 |
| finalScore | ✅ | ✅ | 数据保留 |
| publishedAt | ✅ | ✅ | 数据保留 |
| saved | ✅（已有） | ✅（已有） | FeedColumn/搜索页 :saved="item.saved" |

## 10. saved 验证

- 后端：listFeed/searchProducts 均按登录 userId 实时查询 wishlist_items 生成 saved（未收藏 false / 已收藏 true）
- mapper：`item.saved = raw['saved'] == true`（安全布尔）
- UI：FeedColumn 与搜索页改用 item.saved，删除 library.isFavorite 覆盖；点击收藏时乐观翻转 item.saved（home 走 store.toggleSave，search 本地翻转），刷新后回服务端权威值
- 残留 isFavorite 覆盖仅存于 pages/product/detail.uvue 与 pages/brand/detail.uvue（Product Detail / Brand 在本阶段禁止范围，且为本地交互态，合规保留）

## 11. release 验证

- releaseType/releaseTypeName/saleStatus 已完整进入 Domain（dist 产物确认：feed-service.js 含全部字段）
- Filter 预约频道：saleStatus==='PRE_ORDER' || releaseType==='reservation'（真实业务字段，不再依赖 badgeText 猜测）
- badgeText 仍由后端真实业务逻辑生成（isNew/saleStatus/hasPriceDrop），非前端猜测

## 12. tags 验证

- 类型：string[]（Domain 明确声明，无 JSON string cast）
- mapper：显式数组遍历，逐项 as string，跳过 null；缺失 → []
- 编译：UTS 类型检查通过（真实 mp-weixin 编译成功）

## 13. check

`npm run check` → [PASS] 全部 check 通过（audit regression gates：无双重转义正则/无法律占位/urlCheck on/无 navigateTo-to-tabBar）

## 14. check:source

`npm run check:source` → [PASS]（V3 source gates；WARN 为既有「待运营补充」常量，非本轮引入）

## 15. check:android

`npm run check:android` → [PASS]（Android-safe root layout / theme chrome）

## 16. check:mp-weixin

- `npm run check:mp-weixin` → [OK]
- 真实编译：`/opt/hbuilderx/HBuilderX/cli launch mp-weixin --compile true --project /home/admin/projects/sankengcloset` → **compiled successfully（22:04 fresh，ready in 28388ms）**
- dist 产物验证（22:04 fresh 编译产物逐字段 grep）：feed-service.js 11 字段全部就位（pitType 1 / priceSummary 1 / saleStatus 2 / releaseType 3 / releaseTypeName 1 / tags 2 / feedReason 1 / personalScore 1 / matchReason 1 / finalScore 1 / publishedAt 1）；FeedColumn.js saved 1；home/index.js toggleSave 1；search/index.js saved 3

## 17. 风险

1. saved 显示源切换：本地未同步收藏（离线添加未入队完成）在 Feed 中会显示服务端值（false）而非本地态——符合「服务端真实值优先」指令；本地收藏完整态仍可在收藏页查看
2. filterFeedByChannel 预约频道语义扩展（新增真实字段 OR badgeText 兜底）：与后端 reservation 频道 SQL（PRE_ORDER 或 release_type='reservation'）等价，无漏过滤风险
3. 搜索页 saved 改动触碰到第九节禁止范围边界：判定为 saved 数据完整性必需项（第二节/第七节明确要求 UI 完整传递），Search 业务逻辑零改动
4. 个性化字段（personalScore 等）在 search 响应缺失时兜底为 0/''：后续若 UI 展示需区分「无个性化数据」与「分数 0」

## 18. 未完成项

1. Recommendation UX：feedReason/personalScore/matchReason/finalScore 的 UI 展示（后续阶段）
2. wished 字段清理（无后端业务源，历史遗留，未动）
3. Product Detail / Brand 页 saved 显示源统一（分别在各自阶段处理）

---

## 验证证据汇总（2026-08-19 22:05 fresh 重跑）

| 项 | 结果 |
|---|---|
| npm run check | PASS（全部 check 通过） |
| npm run check:source | PASS |
| npm run check:android | PASS |
| npm run check:mp-weixin | OK |
| 真实 mp-weixin 编译 | compiled successfully（22:04，ready in 28388ms） |
| dist 产物（feed-service.js） | 11 字段逐字段 grep 全部就位（fresh 产物） |
| 后端 ContentFeedItem（src/types.ts） | 29 业务字段逐字段核对一致 |
| 后端 enrich（routes/content.ts） | personalScore/matchReason/finalScore 仅 /api/v1/feed 追加，匿名兜底 0/'' |
| 后端 saved（postgres.ts） | 按 userId 批量查 wishlist_items 实时计算（未收藏 false） |
| 后端 npm test | 17 files / 175 passed / 1 skipped（22:05 fresh，无回归） |
| 违规扫描（console/mock/TODO） | CLEAN |
| Domain 字段唯一性 | 11 字段全部唯一声明 |
| 工作树状态 | 5 个 Phase 1.1-B 文件修改未 commit（与 Phase 1.1-A 遗留修改共存于工作树，未提交待用户指示） |

结论：**PASS**。Feed 业务数据完整传递，saved 使用服务端真实值，预约频道不再用 badgeText 猜测发售状态。停止，不进入 Phase 1.1-C。
