# Phase 2 三坑款式知识库 + 商品知识关系 Architecture & Business Audit

日期：2026-08-19
基线：Phase 1.1-A/B/C 全 PASS；当前阶段从 Engineering Gap Fix 切换为 Product V2 差异化能力建设
性质：纯审计（代码扫描 / 数据模型审计 / 业务分析 / 方案设计），零代码零数据库改动

---

## 1. 当前产品数据模型总览（后端 schema 逐表核对）

| 表 | 关键列 | 现状 |
|---|---|---|
| brands | id/name/name_en/category(pit_type)/logo/description/official_url/follower_count/**heat_score/popular_series text[]/avg_price_cents/release_cycle_days** | 469 品牌，**popular_series 已隐含系列名** |
| products（48 列） | canonical_name/display_name/brand_id/shop_id/pit_type/**category(细分类目：格裙/衬衫/JSK/OP/襦裙/马面)/sub_category/style_tags[]/color_tags[]/material_tags[]/season_tags[]/scene_tags[]/element_tags[]/recommended_tags[]**/sale_status/价格 5 列/preorder_at/balance_at/release_at/external_id/cover_url/images/raw_description/feed_score/visibility | 3390 商品（LOLITA 805/JK 941/HANFU 1323/OTHER 294），**款式属性标签已齐备** |
| product_variants | product_id/name/sku/**color/size**/price_cents/stock_status，UNIQUE(product_id,color,size) | **表存在，导入链路未填充** |
| product_releases | product_id/release_name/**release_no/release_type/sale_status**/deposit/balance/full/start_at/end_at/balance_due_at/ship_at/**is_rerelease/is_sold_out**/lifecycle_status | 批次历史完整（首发/再贩/预约/抽选/现货） |
| source_records | source_type/source_name/source_url/original_id/entity_type('product'|'brand'|'event')/entity_id/published_at/human_modified | **溯源链完整，可作历史资料来源** |
| price_snapshots | product_id/release_id/price/recorded_at | 价格历史 |
| tags / product_tags | name/category(style/color/material/occasion/custom) | 标签体系存在（数据未规模化使用） |
| community_posts | author/media/image/caption/category/topic/visibility | **无 product_id —— 社区与商品零关联** |
| wishlist_items | product_id/**release_id**/status | 收藏已锚定商品+批次 |

## 2. Product 当前业务含义

**混合体，非纯粹"款式"或"商品"。** 导入链路按淘宝 item（external_id）逐条建 products 行：
- 同一款式不同颜色/链接 → 多行 products（可能同名不同 external_id，或靠 product_variants 表达但未填充）
- 同一款式多批次 → products 1:N product_releases（已承担）
- 结论：Product ≈ "款式 + 当前在售链接" 的混合体，**款式本身没有独立实体锚点**

## 3. Brand 当前业务含义

品牌实体（兔缝缝/Alice Girl/织造司…），1:N products。category 为坑向；heat_score/popular_series/release_cycle_days 为画像字段（Phase D5）。**无款式/系列子结构**。

## 4. Release 当前业务含义

product_releases = 发售批次（一期预约/二期再贩/现货掉落），已承载：
- release_no（批次序号）、release_type（first_release/rerelease/reservation/spot/lottery/unknown）
- 定金/尾款/全价、四个时间点、is_rerelease/is_sold_out、lifecycle_status
**足以承担款式级发售历史（若 Product 归并为款式后）**。

## 5. Series / Style 当前是否存在

**隐含存在，无实体：**
- brands.popular_series text[]（品牌热门系列名，如"月光曲"）—— Series 名字面存在
- products.category（细分类目）+ sub_category + style_tags/color_tags/material_tags —— Style 属性存在
- 前端 Series Domain（domain/content/series.uts）与 Product.seriesId 已定义，**但无后端数据源，恒空**
- 无 styles 表、无 series 表、无别名表

## 6. Community → Product 关联能力

**不能关联。** community_posts 仅 author/media/caption/category(JK/LOLITA/HANFU/MIXED)/topic/visibility，无 product_id/style_id。当前"圈子"为穿搭灵感 Gallery（图片+话题），与商品库完全隔离。真人返图/测评无法回挂商品。

## 7. Search 当前能力

- 后端：参数化 ILIKE（display_name/canonical_name/brand_name）+ resolveAliasCategory（仅 3 大类：洛丽塔/Lolita→LOLITA、汉服/HANFU→HANFU、JK/制服→JK）+ category/saleStatus/releaseStatus/brandId/价格过滤
- 前端：search-service → mapFeedItem，无词库（Phase 1.1 Gap Report 计划的 search-terms.uts 未落地）
- **可扩展性**：品牌可搜（brand_name ILIKE）；Style/Series/俗称/旧称不可搜（无实体、无词库）

## 8. JK 业务模型

```
品牌（兔缝缝/中牌/春日制服部…）
  └─ 系列/制服名（"海苔"、"池沼"）
       └─ 款式 = 格裙（格纹 × 配色）
            └─ 商品链接（色组级：绀/黑/灰，尺码 S/M/L/XL）
                 └─ 发售批次（首发→再贩→绝版；复刻=经典款再版）
圈内俗称：格纹昵称（"海苔"等），旧称/别名常见
```

## 9. Lolita 业务模型

```
品牌（Alice Girl/花筵/婴梵塔/星辰猫…）
  └─ 系列（联名系列："星辰猫 × 月光曲"）
       └─ 款式 = 裙型(JSK/OP/SK) × 柄图（草莓柄/月光曲柄）
            └─ 商品链接（颜色=柄色/绀色系，尺码）
                 └─ 发售批次（首发→定金→尾款→再贩；联名/复刻/绝版）
圈内俗称：柄名/花名即款名；联名品牌归属复杂（A×B 双品牌）
```

## 10. 汉服业务模型

```
品牌（织造司/十三余/重回汉唐…）
  └─ 系列（明制/宋制/唐制形制系列）
       └─ 款式 = 形制 × 款式（马面裙/襦裙/圆领袍/齐胸）
            └─ 商品链接（颜色 × 尺码，面料差异）
                 └─ 发售批次（现货为主，限量/绝版）
圈内俗称：马面=百褶裙等；形制术语即款名
```

## 11. Product 与 Style 是否应该拆分

**应该。** 依据：
1. 三坑真实语义中"款式"是用户认知锚点（"我收藏的是月光曲 JSK 绀色"），认款/问答/经典款/俗称全部挂在款式层
2. 当前同款式多链接会重复进 Feed/搜索/收藏（external_id 粒度），去重与历史归并需要款式实体
3. product_releases 已按批次组织，若 Product 归并为款式，批次历史自然变成"款式历史"
4. 前端已定义 Product.seriesId 与 Series Domain —— 模型演进方向已预留
拆分粒度 = 方案 B（Brand→Style→Product→Release），Series 暂不建实体。

## 12. A/B/C 三种架构对比

| 维度 | A. Product=Style | B. Brand→Style→Product→Release | C. Brand→Series→Style→Product→Release |
|---|---|---|---|
| 用户价值 | 低（多链接重复、无法认款） | 高（认款/历史/多色归并） | 最高（系列浏览/联名故事） |
| 数据准确性 | 差 | 好 | 最好 |
| 维护成本 | 最低（零改动） | 中（归并算法+人工审核） | 高（series 归属复杂，联名跨界） |
| 搜索能力 | 弱 | 好（款式名/俗称） | 最强 |
| Feed 能力 | 现有 | 款式级去重聚合 | 系列聚合+专题 |
| Release 历史 | product_releases 承担 | 款式下多批次 ✅ | 同 B+系列 |
| 社区关联 | community.product_id | community.style_id（或 product_id） | 同 B |
| 后续 AI 能力 | 弱 | 款式识别/问答锚点 ✅ | 最强 |
| 开发复杂度 | 0 | 中（1 新表+归并+迁移） | 高（2 新实体） |

## 13. 推荐架构

**方案 B 为 Phase 2 MVP 目标；方案 C 的 Series 作为 Phase 2.4 演进层（不建表，先用 brands.popular_series + style.series_name 过渡）。**

理由：
- 用户价值/复杂度比最优；三坑核心痛点（认款、俗称搜索、多色归并、发售历史）方案 B 全部覆盖
- 方案 C 的系列归属在联名场景（Lolita A×B）是运营重灾区，MVP 引入必拖垮维护
- YAGNI 硬规则：Series/Collection/Designer/Material/Pattern/Colorway 全部不建

## 14. 最小实体模型（MVP）

```
Brand（已有） 1 ── N Style（新增） 1 ── N Product（已有，挂 style_id）1 ── N Release（已有）
                                              │
                                              └── N Variant（已有表，补数据）
Community Post（已有，加 product_id? / style_id? 可选）
Alias 词库（新增：style_id → 俗称/旧称/别名）
```

**新增最小集：styles 表 + products.style_id + aliases（可并入 styles 或独立轻表）+ community_posts.product_id。**

**明确不建**：series 表、designer/material/pattern/colorway/edition/collaboration 表、知识图谱中间表、图数据库。

## 15. 数据关系图

```
Brand 1──N Style 1──N Product 1──N ProductRelease
                        │ 1──N ProductVariant(颜色/尺码)
                        │ 1──N PriceSnapshot
                        │ 1──N SourceRecord(溯源)
                        └──N WishlistItem(product_id, release_id)
CommunityPost ──?──> Product/Style（待加）
Style 1──N Alias(俗称/旧称)
```

## 16. 现有数据如何迁移/映射

1. **款式归并**：按 `brand_id + canonical_name`（去空格/统一大小写）聚类 → 每簇建 style 行 → products.style_id 回填。预计 3390 products 归并后款式数明显小于商品数（同款多链接/多批次归一）
2. **款式属性继承**：style.category/sub_category/style_tags 取簇内置信度最高的 product 行
3. **俗称/别名**：从 title/raw_description 挖掘（"海苔"式昵称）+ 人工审核（沿用 review 体系 human_modified）
4. **变体补数据**：product_variants 按商品链接级导入（颜色/尺码），作为款式→商品差异层
5. **社区回挂**：新帖可选挂 product_id/style_id；存量帖子不动
6. 归并过程保留 external_id/source_records 溯源，可逆可审

## 17. 搜索如何接入

- 扩展后端 search：q 命中 alias 表 → 展开为该 style 下全部 product（俗称搜索："海苔"→兔缝缝海苔格裙）
- 词库分层：坑向大类别名（现有 resolveAliasCategory 保留）→ 款式别名（aliases 表）→ 品牌/系列名 ILIKE
- 前端补最小 normalize（Phase 1.1 Task 4 的 search-terms 落地，仅服务端已覆盖则前端透传）
- 搜索结果款式去重（同款式多商品只展示最高 feed_score 一条 + 变体入口）

## 18. Feed 如何接入

- 款式级聚合：同 style 多 product 在 Feed 去重（保留 feed_score 最高 + 批次最新）
- Feed 项可带 styleId；点击进入款式聚合视图（后续 Phase 2.1 UI）
- 现有 md5(p.id) 打散排序不受影响

## 19. Product Detail 如何接入

- detail 保持商品级（价格/变体/当前批次），增加"同款式其他颜色/批次"区块（styleId 查询）
- statusTag/stages/reminder 继续用 currentRelease（Phase 1.1-A/C 链路零改动）
- 款式页（新页面，Phase 2.1）聚合：款式信息 + 全部商品/颜色/批次历史/别名

## 20. Community 如何接入

- community_posts 加 product_id（nullable，纯增量）
- 发帖可选"关联商品"（从收藏/搜索选）；帖子卡显示商品锚
- Feed 反哺：商品页/款式页展示"同好返图"（listCommunityPostsByProduct）
- 禁止评论/私信/关注流（用户产品边界）

## 21. AI 如何预留

数据适合度评估（不实现）：
- **款式识别**：style 实体 + cover_url/images + style_tags = 图像分类/检索锚点 ✅
- **款式问答/认款**：aliases + raw_description + releases 历史 = RAG 检索基础 ✅
- **经典款识别**：release 次数 + is_rerelease + 收藏/关注热度 = 规则可判定 ✅
- **智能收藏归类**：wishlist_items → style 聚合 ✅
- **历史发售查询**：product_releases 完整时间线 ✅
预留方式：仅数据层（style_id 关联 + aliases 表），不引入任何 AI 基础设施。

## 22. VIP 是否应该涉及

**不涉及。** 款式知识库是内容能力，与 VIP 无业务耦合；用户产品边界明确禁止 VIP 扩张。若未来知识库成付费点，也应在 Phase 2 全部功能稳定后另行评估。

## 23. 精选专题是否应该依赖该数据

**应该（作为消费方）。** 专题（Editorial）可基于款式维度组织："经典款再贩日历"、"联名系列盘点"、"汉服形制入门"——依赖 Style + Release 历史，但专题页本身不参与建模。

## 24. 品牌目录如何依赖该数据

**应该。** 品牌页/品牌详情：Brand → Style 列表（替代当前按商品散列）；brands.popular_series 可作为系列过渡展示。品牌关注（brand_followers）零改动。

## 25. 趋势如何依赖该数据

**应该。** 趋势引擎升级为款式级聚合：款式热度 = 款式下商品 feed_score/收藏/关注/价格变化聚合；"热门款式/再贩款式/降价款式"榜单从 style 维度出。现有 trend-engine 的 product 维度保留为子层。

## 26. 开发阶段划分

```
Phase 2.1  Style 实体落地：styles 表 + products.style_id + 归并脚本 + 后端 Style API
          （detail 同款式区块；款式聚合页；门禁：归并准确率抽查）
Phase 2.2  别名/词库：aliases 表 + 挖掘脚本 + 人工审核 + 搜索扩展（俗称搜索）
Phase 2.3  Community 商品关联：community_posts.product_id + 发帖选品 + 返图区块
Phase 2.4  系列演进（可选）：Series 概念层（复用 popular_series 数据，不建新表）
Phase 2.5  趋势/专题款式化：trend-engine 款式聚合 + Editorial 款式专题
```
每阶段独立验收（4 门禁 + 真实 mp-weixin 编译 + 后端 test 无回归）。

## 27. 第一阶段最小可实现范围

**Phase 2.1（Style 实体落地）**：
- 后端：styles 表（migration）+ products.style_id + 归并脚本（brand_id+canonical_name 聚类）+ GET /api/v1/styles/:id + GET /api/v1/products?styleId=
- 前端：ProductDetailModel + styleId；detail 页"同款式其他颜色/批次"区块；款式聚合页（最小）
- 验收：归并率（3390 商品 → N 款式）、同款式多链接在 Feed/搜索去重、门禁全 PASS

## 28. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 款式归并误合并（同名不同款） | 高 | canonical_name+品牌双键聚类 + 置信度阈值 + 人工审核（复用 review_status） |
| 联名品牌归属（Lolita A×B） | 中 | style 主品牌 + 联名方文本字段（不建多对多） |
| 别名挖掘误伤（俗名撞名） | 中 | 审核流 + 仅 style 级别名，不进 product 级 |
| 社区关联滥用（广告帖挂商品） | 低 | 关联走收藏选品 + 可见性控制 |
| 现有 Feed/搜索行为回归 | 中 | 归并后保留 product 级 API 兼容；去重只在新聚合层生效 |

## 29. 不应该做的事情

1. 不建 Series/Collection/Designer/Material/Pattern/Colorway/Edition/Collaboration 独立实体
2. 不做知识图谱/图数据库/复杂关系中间表
3. 不实现任何 AI（识别/问答/推荐）——仅数据预留
4. 不引入 VIP 依赖
5. 不做社区社交化（评论/私信/关注流）
6. 不重做 Feed/首页/搜索 UI
7. 不删旧字段/旧 API（兼容优先）
8. 不为归并写死规则（必须可审可逆）

## 30. 最终推荐

**方案 B（Brand → Style → Product → Release）+ aliases 轻词库 + community.product_id 增量**，分 5 阶段实施，第一阶段只做 Style 实体落地（Phase 2.1）。

---

## 三个核心问题回答

**问题 1：三坑绮橱现在是否已经具备建立款式知识库的数据基础？**

**部分具备（数据层 YES，实体层 NO）。**
- 已具备：3390 商品带 canonical_name/category 细分类目/style_tags/color_tags；product_releases 完整批次历史；product_variants 颜色尺码表；brands.popular_series 系列名；source_records 溯源链；price_snapshots 价格历史
- 不具备：款式实体（styles 表）、别名词库、community_posts 商品关联、product_variants 数据填充、前端词库
- 结论：**数据可支撑，实体缺 3 项最小增量**（styles + aliases + community.product_id）

**问题 2：如果现在开始做，最少需要增加什么？**

1. `styles` 表（id/name/brand_id/pit_type/category/sub_category/style_tags/aliases/classic_flags）— 1 个 migration
2. `products.style_id` 列（归并回填）— 同一 migration
3. 归并脚本（brand_id + canonical_name 聚类，可审可逆）
4. `community_posts.product_id` nullable 列 — 同一 migration 或独立
5. 后端 Style API 3 个端点（GET /styles/:id、GET /products?styleId=、GET /styles/:id/products）
6. 前端：ProductDetailModel.styleId + detail 同款式区块（最小）

**问题 3：哪些东西现在绝对不应该增加？**

1. Series 独立表/实体（用 popular_series + style 字段过渡）
2. Designer/Material/Pattern/Colorway/Edition/Collaboration 任何独立实体
3. 知识图谱/图数据库/关系中间表
4. 任何 AI 实现（识别/问答/推荐系统）
5. VIP 任何关联
6. 社区社交功能（评论/私信/关注流）
7. 新的独立搜索架构/新 Store/新页面体系（复用现有）

---

## 结论

**READY**

报告：docs/reports/Phase2-Style-Knowledge-Architecture-Audit-20260819.md

禁止修改代码/数据库/commit。等指令进入 Phase 2.1 实施。
