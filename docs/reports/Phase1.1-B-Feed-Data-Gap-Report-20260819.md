# Phase 1.1-B Feed Data Gap Report

日期：2026-08-19
范围：ContentFeedItem → Feed API → mapFeedItem → FeedItem Domain → Presenter → UI 数据完整性审计
基线：Phase 1 PASS；Phase 1.1-A PASS（currentRelease 通道闭合，175 passed / 全门禁 PASS / 真实编译成功）

---

## A. 后端真实返回字段（ContentFeedItem，src/types.ts）

29 个业务字段（listFeed / searchProducts 均返回）：
id / feedType / entityId / title / subtitle / coverUrl / secondaryCoverUrl / brandId / brandName /
category / pitType / price / originalPrice / priceSummary / saleStatus / releaseType / releaseTypeName /
tags(string[]) / feedScore / rankingScore / feedReason / badgeText / eventStartAt / eventEndAt /
liked / saved / sourceLabel / publishedAt / createdAt

路由层 enrichWithPersonalScore（src/routes/content.ts）追加 3 个个性化字段（仅 /api/v1/feed）：
personalScore / matchReason / finalScore

## B. API 是否已返回

| 字段 | /api/v1/feed | /api/v1/search |
|---|---|---|
| releaseType / releaseTypeName / saleStatus / pitType / priceSummary / tags / feedReason / publishedAt / saved | ✅ 返回 | ✅ 返回 |
| personalScore / matchReason / finalScore | ✅ 返回（enrich） | ❌ 不返回（search route 未 enrich） |

## C. Domain 缺哪些字段（domain/content/feed-item.uts）

缺 10 个：pitType / priceSummary / saleStatus / releaseType / releaseTypeName / tags / feedReason /
personalScore / matchReason / finalScore / publishedAt（11 个，含 publishedAt）

已存在但后端不返回：wished（旧字段，无对应业务源，保留不动）

## D. mapper 丢哪些字段（services/content/feed-service.uts mapFeedItem）

当前映射 19 个，丢弃 11 个（与 C 相同清单）：
pitType / priceSummary / saleStatus / releaseType / releaseTypeName / tags / feedReason /
personalScore / matchReason / finalScore / publishedAt

saved ✅ 已映射（`item.saved = raw['saved'] == true`，安全布尔）

## E. presenter 是否再次丢字段（presentation/content/feed-presenter.uts）

不丢。presenter 是纯展示函数库（FeedTypeLabels / getBadgeColor / deriveReleaseStatusText 等），
不做 FeedItem 重映射，仅消费字段，无字段丢失环节。

## F. UI 当前实际使用哪些字段

| 组件/页面 | 使用字段 | 问题 |
|---|---|---|
| FeedBlock.uvue（全宽卡） | feedType/title/brandName/coverUrl/eventStartAt/sourceLabel/subtitle | 无 |
| FeedColumn.uvue（双列） | feedType/coverUrl/title/subtitle/brandName/price/badgeText/eventEndAt/entityId | `:saved="library.isFavorite(item.entityId)"` 本地猜测覆盖服务端 saved ⚠️ |
| ProductCard.uvue | image/brand/title/priceText/badgeText/badgeStatus/deadlineText/saved/showSave/imageHeight | saved 由父级传入 |
| pages/home/index.uvue | feedType/entityId/title/brandName/eventStartAt/category/coverUrl；onToggleSave→library.toggleFavorite | toggle 后不更新 item.saved（若改服务端 saved 显示则需同步） |
| pages/search/index.uvue | coverUrl/brandName/title/price/badgeText/eventEndAt/entityId/category | `:saved="library.isFavorite(item.entityId)"` 同上 ⚠️ |
| feed-service.filterFeedByChannel | badgeText（新品/预约/定金/降价）、feedType、category | 预约频道用 badgeText 判断发售状态（第五节要求改真实字段）⚠️ |

## Gap 结论

1. **数据丢失**：Domain + mapper 缺 11 个后端已返回的业务字段（releaseType/saleStatus/tags/feedReason/publishedAt/personalScore 等）
2. **saved 违规**：Feed UI 用 library.isFavorite（本地）覆盖服务端 saved，违反「不得用本地猜测覆盖服务端真实值」
3. **badgeText 判断**：filterFeedByChannel 预约频道用 badgeText 猜测发售状态，应改用 saleStatus/releaseType 真实字段
4. tags 类型：后端 string[] → 前端需保持明确 string[] 类型 + 安全空值（禁止 JSON string cast）

## 最小修改方案（仅数据完整性，无 UI 重做）

```
domain/content/feed-item.uts         +11 字段（tags: string[] = []，明确类型）
services/content/feed-service.uts    mapFeedItem 补 11 字段映射（tags 安全解析）
                                     filterFeedByChannel 预约 → saleStatus==='PRE_ORDER' || releaseType==='reservation'
components/v3/FeedColumn.uvue        :saved="item.saved"（服务端值）
pages/home/index.uvue                onToggleSave 同步 store.toggleSave(item.id)（乐观翻转服务端 saved）
pages/search/index.uvue              :saved="item.saved" + onToggleSave 本地翻转 results（数据正确性一行级修复，非 Search 功能开发）

禁止：Feed 卡片重做 / 首页重做 / FeedBlock 架构改动 / 新 Store / 新 Service / 新 Domain / UI 强制展示推荐字段
```
