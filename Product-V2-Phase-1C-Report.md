# Product V2 Phase 1C Report

> 三坑绮橱 · 首页视觉验收、状态完善与端侧硬化

---

## 1. Git

**分支**: `feature/v2-phase1b-content-home`
**Branch base**: `spike/phase-0` (93a6b25)
**HEAD**: `392fd6f`
**Merge-base**: `93a6b25`

### Commit 列表

| # | SHA | Message | Files |
|---|-----|---------|-------|
| 1 | 4ad634b | Phase 1C: Sync Design Language v2.2 and remove legacy home code | +2/-2 (mv+delete) |
| 2 | ef246b1 | Phase 1C: Separate content presentation metadata from domain | +8/-7 |
| 3 | 392fd6f | Phase 1C: Harden feed states, images and pagination | +2/-2 |
| 4 | (next) | Phase 1C: Add manual device QA checklist | +1 |
| 5 | (next) | Phase 1C: Verification report | +1 |

---

## 2. 删除的旧 Dashboard 代码

| 文件 | 行数 | 状态 |
|------|------|------|
| `stores/home-store.uts` | 70 | **已删除** |
| `DESIGN-LANGUAGE-V2.md` (根目录) | 225→410 | **已移动** 至 `docs/design/` |

旧 Dashboard 概念在首页源码中的残留检查:

| 概念 | 首页源码残留 |
|------|-------------|
| fetchDashboard | 0 |
| 本月消费 | 0 |
| 衣物总数 | 0 |
| 快捷入口 | 0 |
| 今日提醒统计 | 0 |
| 种草计划统计 | 0 |

---

## 3. Domain/Presentation 拆分结果

### 3.1 新增 Presentation 层

**`presentation/content/feed-presenter.uts`** (137 行)

导出内容:
- `FeedTypeLabels` / `getFeedTypeLabel()` / `getFeedTypeColor()`
- `EventTypeLabels` / `getEventTypeLabel()` / `getEventTypeColor()`
- `EventStatusLabels`
- `ProductStatusLabels` / `getProductStatusColor()`
- `StockStatusLabels` / `getStockStatusColor()`
- `SourceTypeLabels` / `ReviewStatusLabels`
- `PostTypeLabels`
- `getBadgeColor()` — 角标颜色（新品/预售/降价/联名/限定/动态）
- `getCategoryPlaceholderBg()` — 分类占位图背景
- `getCategoryAccent()` — 分类主色

所有颜色引用 theme tokens，不硬编码 hex。

### 3.2 Domain 层清理

| 文件 | 移除项 | 保留项 |
|------|--------|--------|
| `feed-item.uts` | FeedTypeLabels, FEED_TYPE_COLORS | 6 个 FEED_* 常量, FeedItem class |
| `release-event.uts` | EventTypeLabels, EVENT_TYPE_COLORS, **EVENT_TYPE_EMOJI(deleted)**, EventStatusLabels | 7 个 EVENT_* 类型常量, 4 个状态常量, ReleaseEvent class |
| `source-record.uts` | SourceTypeLabels, ReviewStatusLabels | SOURCE_* 常量, REVIEW_* 常量, SourceRecord class |
| `product-variant.uts` | StockStatusLabels, STOCK_STATUS_COLORS | STOCK_* 常量 (新增), ProductVariant class |
| `product.uts` | ProductStatusLabels, PRODUCT_STATUS_COLORS | PRODUCT_* 常量, Product class, PriceSnapshot class |
| `content-post.uts` | PostTypeLabels | POST_* 常量, ContentPost class |
| `brand.uts` | (无变更) | Brand class (isFollowed @deprecated) |
| `outfit.uts` | (无变更) | Outfit class |

**Domain 中硬编码颜色**: 0
**Domain 中 EVENT_TYPE_EMOJI**: 已删除

---

## 4. FeedType Mock 数量与频道覆盖

### 4.1 每种 FeedType 的 Mock 数量

| FeedType | 数据源 | 数量/页 | 5页总计 |
|----------|--------|---------|---------|
| product | PRODUCTS (20 种) | 10 | 50 |
| release_event | RELEASE_EVENTS (7 种) | 4 | 20 |
| brand_post | BRAND_POSTS (4 种) | 4 | 20 |
| outfit | OUTFITS (5 种) | 2 | 10 |
| editorial | 无 Mock | 0 | 0 |
| ai_recommendation | 无 Mock | 0 | 0 |

### 4.2 每个频道的内容数量 (首屏 20 条)

| 频道 | 过滤条件 | 预期数量 |
|------|---------|---------|
| 推荐 | 全部 | 20 |
| 新品 | badgeText === '新品' | 2 |
| 预约 | event + (预约\|定金) | 1-2 |
| 降价 | badgeText === '降价' | 1-2 |
| 穿搭 | feedType === outfit | 2 |
| JK | category === 'JK' | ~5-6 |
| Lolita | category === 'LOLITA' | ~7-8 |
| 汉服 | category === 'HANFU' | ~4-5 |

editorial 和 ai_recommendation 无 Mock 数据时，使用 fallback 卡型显示 feedType 标签，不伪装成商品。

---

## 5. Mock ID 唯一性

```
100 条生成: 100/100 unique, 0 duplicates
ID 格式: feed-{sourceId}-{globalIdx}
globalIdx 0~99 唯一，sourceId 循环但 idx 不重复
```

**结果: PASS**

---

## 6. 图片来源与比例

| 卡型 | 比例 | paddingBottom | 来源 |
|------|------|---------------|------|
| Product 双列 | 3:4 | 133.33% | 类别色块占位 (jkColors.bg / lolitaColors.bg / hanfuColors.bg) |
| ReleaseEvent 单列 | 16:9 | 56.25% | 类别色块占位 |
| Outfit 沉浸 | 4:5 | 125% | 类别色块占位 |
| BrandPost 单列 | 16:9 | 56.25% | 类别色块占位 |
| Fallback 单列 | 16:9 | 56.25% | 类别色块占位 |

- 无远程图片依赖
- 无外链图片
- 无 Emoji 占位
- 占位区域有明确宽高比，不会塌陷
- Mock 阶段色块即为最终视觉

---

## 7. 加载/失败/空状态实现

| 状态 | 触发条件 | UI 表现 |
|------|---------|---------|
| 初次加载 | `state === 'loading'` | AppLoading 组件 |
| 加载成功 | `state === 'loaded'` | Feed 正常渲染 |
| 加载失败 | `state === 'error'` | 标题"加载失败" + 错误信息 + "点击重试"按钮 |
| 点击重试 | `@tap="onRetry"` | 调用 store.retry() → 重新 loadFirstPage() |
| 空频道 | `isEmpty === true` | "暂无内容" + "切换其他频道看看" |
| 分页加载中 | `isLoadingMore === true` | 底部 "加载中..." |
| 分页到底 | `hasMore === false` | 底部 "已显示全部内容" |
| 图片加载失败 | Mock 阶段无远程图 | 色块占位本身即为 fallback |
| 收藏切换 | `toggleLike/toggleSave` | 数据层切换，UI 响应 |
| 频道切换 | `setChannel(ch)` | computed 自动重算，无需重新加载 |
| 快速重复触底 | loadMore 防重入 | `isLoadingMore \|\| state !== 'loaded'` 守卫 |

调试常量（不在 UI 暴露）:
- `DEBUG_FORCE_ERROR = false`
- `DEBUG_FORCE_EMPTY = false`
- `DEBUG_EMPTY_CHANNEL = ''`

---

## 8. 分页防重机制

```
loadMore() {
  if (isLoadingMore.value || !hasMore.value || state.value !== 'loaded') return
  isLoadingMore.value = true
  // ... 加载 ...
  isLoadingMore.value = false
}
```

- 三重守卫: isLoadingMore + hasMore + state
- loadMore 中 try/finally 保证 isLoadingMore 重置
- 100 条后 hasMore = false，不再触发
- 频道切换不重置 allItems（computed 过滤）

---

## 9. mp-weixin 编译结果

```
HBuilderX: 5.21.2026071110-alpha
模式: VDOM模式 (mp-weixin)
Style isolation: 2.0
页面数: 14
编译耗时: ~28s
结果: SUCCESS

patch-vendor.py: [PATCH] defineStore (+ globalThis fallback) [OK]
require 路径: 18 ok, 0 missing
home-store.uts: DELETED (不在构建产物中)
presentation/content/feed-presenter.js: 编译产物存在
```

---

## 10. Android/iOS/Harmony 未验证项

| 平台 | 状态 |
|------|------|
| mp-weixin | ✅ 编译通过 |
| Android (Vapor) | ❌ 未验证（无 Android 环境） |
| iOS | ❌ 未验证（无 Xcode 环境） |
| Harmony | ❌ 未验证（无 HarmonyOS SDK） |

**不得声称真机性能已通过。**

---

## 11. 人工 QA 待办

详见: `docs/reports/Product-V2-Phase-1C-Manual-QA.md`

包含:
- A. 微信小程序 8 项验收
- B. Android App 6 项验收
- C. 建议设备覆盖
- D. 测试数据说明与调试入口

**所有项目均为待执行，不标记为已通过。**

---

## 12. 已知问题

| # | 问题 | 影响 | 缓解 |
|---|------|------|------|
| 1 | editorial/ai_recommendation 无 Mock 数据 | fallback 卡永远不触发 | Phase 2 补充 Mock 或标记"暂无推荐内容" |
| 2 | 旧报告文件保留 EVENT_TYPE_EMOJI 引用 | 仅历史文档，不影响代码 | 不修改历史报告 |
| 3 | domain/content/ 部分文件不在构建产物中 | release-event/source-record/product-variant/product/content-post 未被首页引用 | Phase 2 详情页会引入 |
| 4 | `product-variant.uts` 新增 STOCK_* 常量名与旧 STOCK_STATUS_* 不同 | 旧代码若引用 StockStatusLabels 需迁移到 presenter | 已在 presenter 中提供等价函数 |
| 5 | 频道切换不重置 hasMore | 若已加载 100 条，切换频道后空频道也会显示"已显示全部" | 可接受，Phase 2 改进 |

---

## 13. 是否建议进入 Phase 2A

**建议: 是**

理由:
- Domain/Presentation 分离完成
- 首页 Feed 完整实现（加载/失败/空/分页/频道切换）
- Design Language v2.2 生效且唯一
- 旧 Dashboard 代码已清除
- mp-weixin 编译通过
- Mock 数据覆盖三坑 + 多种 feedType
- 人工 QA 清单已生成

Phase 2A 建议内容:
- 商品详情页 (ProductDetail.uvue)
- 发现页骨架
- 真实图片 AppImage 集成

---

*报告生成: 2026-07-15*
*编译环境: HBuilderX 5.21.2026071110-alpha / Linux*
*分支: feature/v2-phase1b-content-home*
