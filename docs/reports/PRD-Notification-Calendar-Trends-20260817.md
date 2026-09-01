# PRD: 通知 / 发售日历 / 趋势 — 完整前后端（2026-08-17）

> 状态：Design Freeze
> 模型分工：DeepSeek V4 Flash（规划+主力开发）→ 质量门禁 → Feature Report
> 原则：以代码为证（本 PRD 全部现状均经源码/DB/生产 API 实查）；YAGNI + KISS；不越产品边界

---

## 一、现状（代码证明）

### 1. 趋势
- 后端 `GET /api/v1/trends?period=7d|30d|90d` **已完整实现**（content.ts → postgres.ts getTrendSummary）：brandTrends（品牌新品数/再贩数/均价/涨跌%）+ productTrends（商品价格变化/状态变化）。
- 生产验证：`curl https://api.sankengcloset.icu/api/v1/trends?period=30d` 返回真实数据（brandTrends 有 252 品牌聚合）。
- 前端：**未消费**。发现页"趋势话题"板块过滤 `FEED_AI_RECOMMENDATION/FEED_OUTFIT`（后端 feed 只返回 product）→ 永远空。

### 2. 发售日历
- 后端：**无日历 API**。注意：`GET /api/v1/events` 是**用户行为事件**（个性化埋点），不是发售日历。
- 数据表：`product_releases` = **0 行**、`sale_events` = **0 行**、products 的 preorder/balance 时间字段全部 NULL、sale_status 3363 全 ON_SALE。
- 前端：发现页"发售日历"板块过滤 `FEED_RELEASE_EVENT` → 空；"完整日历"按钮无目标页面。

### 3. 通知
- 后端：`/api/v1/me/notifications` CRUD **已存在**（user_assets 表 asset_type='notification'，schema: type/title/body/actionTarget/read）。
- 前端：notification-center-store 用 `mockNotifications()` 硬编码 4 条假通知，已读存本地 storage。
- 生产库：users=0（无真实用户数据，App 处于 Mock 内测会话）。

---

## 二、设计（Design Freeze）

### 模块 A：趋势 — 前端接通（后端零改动）

**A1. 新 service** `services/content/trend-service.uts`
- `fetchTrends(period: string): Promise<TrendBundle>` — GET /api/v1/trends?period=
- `TrendBundle { brandTrends: TrendBrand[]; productTrends: TrendProduct[] }`

**A2. 发现页"趋势话题"板块改造**
- 数据源：trends API（默认 30d）
- 展示：品牌趋势 Top N（品牌名 + 新品数/价格涨跌%），商品趋势 Top N（商品名 + 涨跌金额/百分比 + 状态变化标记）
- 交互：品牌 → 搜索该品牌商品；商品 → 商品详情
- 空态：PageState 兜底
- 不做：独立趋势页（YAGNI，发现页板块即完整消费点）

### 模块 B：发售日历 — 后端新建 API + 前端板块 + 完整日历页

**B1. 后端 `GET /api/v1/calendar?month=YYYY-MM&limit=50`**
- 数据源：`product_releases`（deleted_at is null 且有 start_at）+ `sale_events`（有 start_at）UNION 聚合，按 start_at 升序
- 返回字段：`{ id, title, brandName, brandId, category, eventType, startAt, endAt, priceCents, depositCents, balanceCents, productId, status }`
  - title：release_name 非空用 release_name，否则商品 display_name
  - eventType：release_type（first_release/rerelease/reservation/spot/lottery）或 sale_events.event_type
  - status：sale_status / lifecycle
- 无数据 → 空数组（前端空态）。**数据填充属爬虫/导入域，不在本 Feature**（当前 DB 0 行，功能链路完整交付）
- 位置：新文件 `src/routes/calendar.ts` + contracts.ts `listCalendar` + postgres.ts 实现 + memory.ts 兼容实现 + types.ts `CalendarEvent`

**B2. 前端**
- 新 service `services/content/calendar-service.uts`：`fetchCalendar(month): Promise<CalendarEvent[]>` + `currentMonthKey()`
- 发现页"发售日历"板块：接通 API（当月，Top 5），保留现有行样式；空态不显示板块标题下内容或显示空态文案
- 新页面 `pages/discover/calendar.uvue`（完整日历页）：
  - 顶部月份切换（‹ 2026年8月 ›）
  - 按日分组 ListGroup：日期块（日/月）+ 事件行（title/brand/tag）
  - 事件点击：productId 存在 → 商品详情；否则搜索品牌
  - 空态：PageState"当月暂无发售安排"
- pages.json 注册 + 发现页"完整日历"按钮跳转

### 模块 C：通知 — 后端生成器 + 前端真实化

**C1. 后端 `POST /api/v1/me/notifications:generate`**（user-data.ts 新增，非通用 asset 路由）
- 输入：无（服务端读当前用户数据）
- 生成规则（幂等去重：同 type + 同关联 id + 同日期 → 跳过）：
  | 来源 | 条件 | 通知 type | title/body | actionTarget |
  |---|---|---|---|---|
  | reminders | status=PENDING 且 remindDate ≤ 今天+1 | ARRIVAL→system / BALANCE→price / RELEASE→release / CUSTOM→system | 提醒标题 | /pages/reminder/index |
  | purchases | 未完成且 balance_due_date ≤ 今天+3 | price（尾款） | 「订单 X 尾款即将截止」 | /pages/purchase/detail?id= |
  | purchases | 未完成且 arrival_date ≤ 今天+3 | system（到货） | 「订单 X 预计到货」 | /pages/purchase/detail?id= |
  | 关注品牌新品 | brand_followers 内 brands 的 products 7 天内 created_at | release（新品） | 「关注的品牌 X 上新」 | /pages/search/index?q=品牌 |
- 写入 user_assets（asset_type='notification'，id 用 `not_{userId}_{hash}` 保证幂等）
- 返回：生成后最新通知列表（同 GET /api/v1/me/notifications 形状）
- memory.ts 同步实现（contract 要求）

**C2. 前端 notification-center-store 真实化**
- `reload()` 策略：
  1. **本地兜底**：从本地 reminder-store/purchase-store 数据计算到期项生成本地通知（Mock 会话也可见）
  2. **云端权威**：若真实登录（access token 非空）→ `POST generate` + `GET /api/v1/me/notifications`，云端结果覆盖本地
  3. 云端失败 → 保留本地兜底，静默
- `markRead/markAllRead`：本地立即生效 + 真实登录时 PATCH 云端
- 已读存储：保留本地 storage（离线一致）+ 云端 read 字段为准（在线）
- Mock 会话下 `listNotificationsRemote` 401 → 只展示本地兜底
- 页面底部说明文案更新为真实描述

**C3. 前端 user-data-service 新增**
- `generateNotificationsRemote(): Promise<UTSJSONObject[]>` — POST /api/v1/me/notifications:generate
- `markNotificationReadRemote(id)` — PATCH /api/v1/me/notifications/:id {read:true}

---

## 三、文件变更清单

### 后端 sankengcloset_service
| 文件 | 变更 |
|---|---|
| src/types.ts | + CalendarEvent 类型 |
| src/repositories/contracts.ts | + listCalendar + generateNotifications |
| src/repositories/postgres.ts | + listCalendar 实现 + generateNotifications 实现 |
| src/repositories/memory.ts | + 兼容实现（contract 编译要求） |
| src/routes/calendar.ts | 新增日历路由 |
| src/routes/user-data.ts | + notifications:generate 路由 |
| src/app.ts（或 server 组装处） | 注册 calendar 路由 |

### 前端 sankengcloset
| 文件 | 变更 |
|---|---|
| services/content/trend-service.uts | 新增 |
| services/content/calendar-service.uts | 新增 |
| services/user-data/user-data-service.uts | + generate/markRead 通知函数 |
| stores/notification-center-store.uts | reload 真实化 + 本地兜底 |
| pages/discover/index.uvue | 日历/趋势板块接通真实 API |
| pages/discover/calendar.uvue | 新增完整日历页 |
| pages.json | 注册日历页 |
| pages/notification/index.uvue | 底部说明文案更新 |

---

## 四、验收标准
1. 后端编译通过（tsc）、PM2 重启无错；curl 验证：calendar（空数组）、trends（真实数据）、notifications:generate（未登录 401/登录生成）
2. 前端质量门禁：vue-tsc 0 errors + eslint 0 errors + prettier（按 Feature 方法论）
3. HBuilderX 编译 mp-weixin 通过
4. 发现页：日历/趋势板块有数据时展示、无数据时空态；日历页月份切换可用
5. 通知：Mock 会话显示本地兜底（来自真实 reminders/purchases 数据，非硬编码）；真实登录走云端
6. Feature Report 输出（实现内容/文件变更/数据流/测试结果）

## 五、明确不做（YAGNI/边界）
- 不做日历数据爬取/导入（属爬虫域，本 Feature 交付 API+页面，当前空态如实展示）
- 不做趋势独立详情页、不做通知推送通道（微信订阅消息等）
- 不改通知页面 UI（store 接口兼容，页面零改动除说明文案）
- 不伪造任何数据
