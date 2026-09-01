# 三坑绮橱 — 功能点全景与未补全清单（2026-08-17 调研）

> 数据来源：远程 main @ `074185e`（2026-08-17 03:17 "feat: 功能补全与视觉统一"）+ 本地 `agent/v3-audit-fixes-20260813` 分支代码审计 + sankengcloset_service 远程 main @ `60ad9b9`
> 说明：以代码为准（禁止猜测原则），所有「空态/占位」均来自源码注释或 SQL 实查。

---

## 一、已实现功能全景

### 1. 一级导航（5 Tab）
| Tab | 页面 | 状态 |
|---|---|---|
| 首页 | pages/home/index | ✅ 已接 API |
| 发现 | pages/discover/index | ⚠️ 框架在，数据源为空（见未补全 #1） |
| 收藏 | pages/favorites/index | ✅ 已接 API |
| 圈子 | pages/community/index + mine | ✅ 已接 API |
| 我的 | pages/profile/index | ✅ 已接 API |

### 2. 内容链路（Feed → 发现搜索 → 收藏 → 决策）
| 功能 | 页面 | 数据源 | 状态 |
|---|---|---|---|
| 混合 Feed（推荐/新品/预约/降价/穿搭 5 频道） | home/index | GET /api/v1/feed?channel= | ✅ 已接（商品类） |
| 个性化打分（feed_score×0.7 + 个人分×0.3） | — | 后端 enrichWithPersonalScore | ✅ |
| 商品搜索（关键词/坑向/发售状态/价格/品牌） | search/index | GET /api/v1/search | ✅ 已接 |
| 商品详情（收藏/提醒/外跳/搭配度） | product/detail | GET /api/v1/products/:id | ✅ 已接 |
| 收藏/愿望单（商品收藏、状态流转、转购买记录） | favorites, wishlist/* | /api/v1/wishlist CRUD | ✅ 已接 |
| 品牌关注/取关 | discover, favorites | /api/v1/brands/follow ± | ✅ 已接 |
| 编辑专题（editorial） | editorial/detail | ❌ 无 API | ⚠️ **空态占位** |
| 发售日历（events） | discover | GET /api/v1/events 后端有 | ⚠️ **前端未调用** |
| 趋势话题（trends） | discover | GET /api/v1/trends 后端有 | ⚠️ **前端未调用** |
| 穿搭内容（outfit） | home 穿搭频道 | 后端 SQL `false` | ⚠️ **永久空** |
| 品牌目录 | discover | 过滤 FEED_BRAND_POST | ⚠️ **空态** |

### 3. 管理功能（用户资产，全部已接 /api/v1/me/* CRUD）
| 功能 | 页面 | Schema 要点 |
|---|---|---|
| 衣橱（JK/LOLITA/HANFU/OTHER、穿着状态、季节、图片、标签） | wardrobe/index + edit | wardrobeSchema |
| 订单（三坑定金/尾款：整数分、定金/已付/尾款日/到货日/状态机） | purchase/index + detail + edit + import | purchaseSchema |
| 提醒（到货/尾款/发售/自定义，绑订单或心愿） | reminder/index + edit | reminderSchema |
| 心愿单（优先级、状态机 WISH→PURCHASED、AI 导入/发现来源） | wishlist/index + detail + edit | wishSchema |
| 预算（月限额 + 提醒阈值） | budget/index | /api/v1/me/budget |
| 通知中心（4 分类） | notification/index | ❌ **本地 Mock** |
| 内容偏好（坑向/关注品牌/价格段） | preferences/index | /api/v1/me/preferences |
| 外观（跟随系统/浅色/深色三态） | preferences/appearance | 本地 |
| 通知偏好（总开关+4 分类） | preferences/notification | 本地 |
| 关于/协议 | about/* | 本地（含占位文本） |

### 4. 社区/圈子（轻社区）
| 功能 | 页面 | 状态 |
|---|---|---|
| 帖子流（坑向/话题筛选、分页） | community/index | ✅ GET /api/v1/community/posts |
| 发布穿搭（选图上传→发布） | share/create | ✅ uploads:prepare + PUT content + POST posts |
| 点赞 | community | ✅ PUT posts/:id/like |
| 我的帖子/本地草稿 | community/mine | ✅ GET /me/community/posts |
| 删除帖子 | community/mine | ✅ DELETE posts/:id |

### 5. AI 能力（场景化嵌入）
| 能力 | 状态 |
|---|---|
| 订单截图 OCR/多模态预填（尾款一键入库） | ⚠️ **Mock adapter**，未接真实模型；后端 /api/v1/ai/import-tasks 已就绪 |
| 衣橱搭配度/三坑浓度 | ✅ 兼容第一版（product/detail 搭配度模块） |
| 文案生成、商品图片识别 | ❌ 未做（低频，OCR 闭环后） |

### 6. 系统层
| 项 | 状态 |
|---|---|
| 本地优先 + 离线同步队列 | ✅ local-sync-queue + /api/v1/sync/* |
| 会话（Mock 内测 / 微信登录代码保留） | ⚠️ **当前 Mock 会话**，微信 OAuth 未启用 |
| 上传/媒体（订单截图、穿搭图） | ✅ /api/v1/uploads + /api/v1/media |
| 审核（产品可见性 review） | ✅ /api/v1/review/*（运营后台向） |
| 深色模式 | ✅ V3 全量 computed 化 |

---

## 二、未补全 / 缺口清单（调研重点）

### #1 运营内容体系（专题/品牌目录/发售日历/趋势）——最大缺口
**根因：后端 `/api/v1/feed` 只返回 `feedType: 'product'`（postgres.ts:335/451 实查），前端发现页 4 个板块全部按类型过滤，结果全空。**

| 板块 | 前端过滤条件 | 当前实际 | 需要补的 |
|---|---|---|---|
| 精选专题 | feedType === FEED_EDITORIAL | 空 | editorial 数据模型 + 后端产出 + 专题详情 API |
| 品牌目录 | feedType === FEED_BRAND_POST | 空 | 品牌内容/品牌卡数据 + 目录 API（现在只有品牌名，DB brands=252） |
| 发售日历 | feedType === FEED_RELEASE_EVENT | 空 | 后端 events API 接通（存在但前端未调用）+ 完整日历页 |
| 趋势话题 | FEED_AI_RECOMMENDATION / FEED_OUTFIT | 空 | trends API 接通 + 话题聚合 |

**专题详情页（editorial/detail.uvue）实况**：`filteredItems.value = []`，源码注释原文：
> "Filter products by category — 后续将接入远程 API 获取专题商品 / 当前阶段先展示空态，由 PageState 兜底"

### #2 穿搭频道与穿搭内容
- 后端 `outfit` 频道 SQL 直接 `false`（postgres.ts listFeed），前端穿搭 Tab 永远空。
- 穿搭内容类型（FEED_OUTFIT）前端已有卡片渲染，缺后端产出与频道查询。

### #3 通知系统（本地 Mock → 服务端推送）
- 前端通知中心用 `mockNotifications()` 本地生成（notification-center-store.uts:17），页面明确提示"当前通知由本地 Mock 生成…系统推送将在服务端接入后启用"。
- 后端 /api/v1/me/notifications CRUD 已存在但前端未用作数据源。
- 未接：推送通道（微信订阅消息？）、事件→通知生成器（尾款日/到货日/发售日触发）。

### #4 登录鉴权（Mock 会话 → 真实微信登录）
- 当前 `SESSION_MODE_MOCK`，界面持续显示"Mock 内测 · 数据保存在本机"。
- 正式微信登录代码保留（/api/v1/sessions/wechat），**WECHAT_APP_ID/SECRET 已在 .env.production 配置但 OAuth 未启用**。

### #5 AI 订单识别（Mock adapter → 真实模型）
- ai-import-service.uts 是"可替换的 Mock Adapter"（mock_safe 草稿：品牌/价格/尺码留空，必须用户确认）。
- 后端 import-tasks 全套 API 已就绪，缺真实多模态模型接入。
- 产品方向明确：OCR 闭环完成前不优先投入搭配度/文案等。

### #6 法律文本占位
- about/legal-content.uts:198-200：运营主体/联系方式/生效日期为 `[占位]`，需工商主体信息（昆山个体工商户）填充。

### #7 后端已有 API、前端未消费的端点（接线缺口）
| 端点 | 说明 |
|---|---|
| GET /api/v1/events | 发售日历数据（前端发现页没用） |
| GET /api/v1/trends | 趋势聚合（前端没用） |
| GET /api/v1/me/notifications | 通知 CRUD（前端用 Mock） |
| POST /api/v1/ai/import-tasks* | AI 导入（前端用 Mock adapter） |
| POST /api/v1/sessions/wechat | 微信登录（未启用） |
| GET /api/v1/review/* | 审核（运营后台向，App 不消费） |
| GET /api/v1/me/community/posts | 已用 ✓ |

### #8 静态门禁已列、但需真机/云打包验证的
- 微信小程序真机预览交互（开发者工具未装）
- Android release APK 打包 + 真机启动（云打包需用户本地，24h 额度）
- 320–430px 多宽度浅/深色截图
- 首页 30/100 条滚动与加载更多、深浅色即时切换

---

## 三、数据模型现状（DB 表）
brands(252, 全 TAOBAO)、products(3363, 全 published)、product_variants、product_images、product_releases、price_snapshots、sale_events、tags、brand_crawl_policies、user_events、brand_followers + 用户资产表（wardrobe/purchase/reminder/wish/notification 经 /me/* JSON 存储）。
**无 editorial/专题表、无穿搭(outfit)内容表、无通知推送事件表。**

## 四、产品边界提醒（调研时勿越界）
- 不做：支付/购物车/站内交易、重型社区/群聊/直播、AI 聊天机器人主入口。
- 不做：恢复 Dashboard/首页统计区/快捷入口/坑向分类占位。
- 经营资质：昆山个体工商户（软件开发+互联网数据服务+广告设计/代理/发布），不卖货不咨询。

---

## 五、建议调研优先级（供报告参考）
1. **P0（核心链路缺口）**：#1 运营内容（专题/日历/品牌/趋势）+ #2 穿搭频道 —— 首页/发现页两大 Tab 空壳，直接影响产品观感
2. **P1（信任与闭环）**：#3 通知真实化、#5 AI OCR 接真实模型（产品方向第一优先级能力）
3. **P2（上线前必需）**：#4 微信登录启用、#6 法律文本填充、#8 真机/云打包验证
4. **P3（接线优化）**：#7 后端已有 API 的前端消费（events/trends 白开发了）
