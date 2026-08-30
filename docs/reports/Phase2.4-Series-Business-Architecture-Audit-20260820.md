# Phase 2.4 Series 业务演进审计报告

- 日期：2026-08-20
- 阶段：Product V2 Phase 2.4（Series / 系列业务演进审计）
- 性质：只读审计（零代码 / 零数据库 / 零 API 变更）
- 执行模型：deepseekv4flash
- 结论：**PASS — 不建议现在建立 Series 实体（LATER，证据驱动）**

---

## 0. 审计方法

本报告全部结论基于以下一手证据，未引用任何旧报告：

1. 生产库（127.0.0.1:5433 sankeng-pg）只读 SQL 查询：表行数、列结构、字段分布、标题抽样
2. 后端源码（sankengcloset_service）grep 审查：popular_series 引用、styles 引用、feed/search/trends SQL、路由端点清单
3. 前端源码（sankengcloset UniApp X）grep 审查：series.uts / style.uts 引用、Brand/Discovery/Editorial/Search/Product Detail 页面结构、服务契约

---

## 1. 当前 Series 数据现状（数据库实证）

### 1.1 popular_series 列：100% 空

| 指标 | 值 |
|---|---|
| brands 总数（deleted_at is null） | 252 |
| 有非空 popular_series 的品牌数 | **0** |
| popular_series 字符串总量 | **0** |
| 写入方 | 仅 `migrations/0004_intelligence.sql` 的 `DEFAULT '{}'`，**无任何业务代码/脚本写入** |

结论：`popular_series` 是一个"只定义了列、从未被填充"的字段。它当前对产品**零贡献**。

### 1.2 唯一计算方是死代码，且语义是假系列

`src/intelligence/brand-intelligence.ts` 的 `computePopularSeries()`：

```typescript
function computePopularSeries(products: ProductRow[]): string[] {
  const freq = new Map<string, number>();
  for (const p of products) {
    const cat = p.category || '其他';   // ← 按商品 category 词频聚合，不是系列！
    freq.set(cat, (freq.get(cat) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
}
```

它输出的是"该品牌商品里出现最多的 category 词"（且 products.category 全空时只会得到 '其他'），**根本不是系列**。且 `buildBrandProfile` 在 v2.5 生产集成分支（移除 crawler 后）**无任何调用方**——grep 全 src/scripts 无命中，纯死代码。

### 1.3 相关实体数据现状（全表快照）

| 表 | 行数 | 说明 |
|---|---|---|
| brands | 252 | category 全部 = OTHER（品牌级分类数据丢失） |
| products | 3363 | pit_type 有值；**style_id / category / sub_category / style_tags / season_tags 全部为空** |
| styles | 0 | Phase 2.1 已建表（0010 已应用），零数据 |
| product_releases | 0 | Phase D5.1 结构，零数据（详情页"发售信息"恒不渲染） |
| product_variants | 0 | 零数据 |
| community_posts | 0 | Phase 2.3 结构 + API 就绪（0012 已应用），零数据 |
| aliases | 31 | **全部为 category 类型**（洛丽塔→LOLITA 等），无 brand / style 类型 |
| user_events | 0 | **无任何用户行为数据** |
| source_records | 3390 | 数据资产健全 |
| price_snapshots | 3390 | 数据资产健全 |

### 1.4 品牌商品密度（Series 数据化潜力）

- 252 品牌全部有商品；最多 48 个/品牌（琴挑、麻菟菟），平均 13.3
- 分布：1-4 商品 83 品牌 / 5-19 商品 108 品牌 / 20-49 商品 61 品牌
- 没有任何品牌达到"系列成体系"所需的数据密度（一个系列通常 3-10 款 × 多配色，需 ≥20 商品且系列名可辨）

---

## 2. 真实商品标题词汇统计（3363 个商品）

| 词汇 | 命中数 | 占比 | 语义判断 |
|---|---|---|---|
| 套装 | 1110 | 33% | **商品形态词**（JK 上衣+裙套装），非系列 |
| 制服 | 802 | 24% | **商品类型词**（JK 制服），非系列 |
| 系列 | **32** | **0.95%** | 唯一真正的"系列"字样 |
| 礼服 | 28 | 0.8% | 品类词 |
| 再贩 | 8 | 0.2% | 发售状态词 |
| 纪念 | 4 | 0.1% | — |
| 联名 | 2 | 0.06% | 联名企划极少 |
| 限定 | 2 | 0.06% | — |
| 主题 / 经典 / 企划 / 周年 | ≤2 | ~0 | 企划、周年 = 0 |

**标题中明确带"系列"字样的商品仅 32/3363 ≈ 1%。**

### 2.1 真系列样本（标题原文）

- 「K.Q.F马戏团系列·Queen黑红」/「K.Q.F马戏团系列·FUNFAIR糖果色」— 咩耶原创，**真系列，同系列多商品**
- 「熊熊板巧系列 小物合集」— Alice girl，系列名在标题中
- 「马卡龙系列 小物合集」— 双生小熊
- 「风铃草系列 jsk衬衫sk…」/「蓟草之冠系列 皇冠胸针」— NDC玻璃纸之夜
- 「修女系列 …黑白JK制服套装」— 喵仙生
- 「红楼梦绢人系列」— 琴挑（汉服）
- 「天使系列名字待定意向金」— 梦境魔匣

### 2.2 但 99% 的"款式名"不带"系列"字样（Style 的天然素材）

- **Alice girl**：十字姬 / 咖啡屋 / 甜点屋 / 女儿国国王 / 熊熊板巧 / 傲娇小姐 / 维多利亚公爵 / 古早波点 / Doll感 —— 裸款式名，无"系列"字样
- **琴挑原创汉服**：款式名用【】标记 + 朝代前缀 —— 「琴挑晋制【石榴花神】…」「琴挑五代【花月夜】…」「琴挑南北朝【素娥】…」
- **葵子JK**：【水色纪】【杏花时】【摄氏度】【雾瑾】【浅浅】+ 「暗羽系列」

结论：三坑商品标题存在**高度结构化、可提取的款式名**（【】标记或固定位置），这些是 **Style 实体（Phase 2.1 已建、零数据）的填充素材**，不是 Series 的。

---

## 3. 代码现状（前后端实证）

### 3.1 后端

| 检查项 | 结果 |
|---|---|
| feed/search/trends SQL 引用 popular_series | **无**（grep postgres.ts 零命中） |
| search 的 styles 关联 | `LEFT JOIN styles st ON st.id = p.style_id` + alias 解析 styleIds 分支**存在**，但 aliases 无 style 类型 + styles 空 → **永不触发** |
| GET /api/v1/styles/:id、/styles/:id/products | 端点存在，styles 空 → **恒 404** |
| GET /api/v1/brands（列表/详情） | **后端不存在**（只有 follow/unfollow/followed） |
| community API（Phase 2.3） | 完整（list/like/create，product_id 关联），0 数据 |
| computePopularSeries | 死代码，无调用方 |

### 3.2 前端

| 检查项 | 结果 |
|---|---|
| domain/content/series.uts | **纯占位**——只被 `domain/content/index.uts` barrel export，业务代码零引用 |
| style.uts | 被 style-service + product/detail 的"同款式"模块引用（styleId 为空时不渲染） |
| Product 详情页 | 四模块：发售信息（release 0 行→不渲染）/ 同款式（styleId 空→不渲染）/ 真实买家（community 0 行→不渲染）/ 商品说明。**无 Series 展示位** |
| Discovery 页 | 精选专题/品牌目录/趋势话题 = 从 home-feed 按 `FEED_EDITORIAL` / `FEED_BRAND_POST` / `FEED_AI_RECOMMENDATION` / `FEED_OUTFIT` 过滤——**后端 feed 只产 `feedType:'product'`，这些过滤全部落空 → 专题/品牌/话题全空态**；发售日历走 calendar API（0 数据） |
| Editorial 页 | Hero + 按 category 过滤的商品列表（本质是分类商品页） |
| Brand 详情页 | 品牌头（名称/关注/屏蔽）+ 商品双列瀑布流。**无 Series 入口** |
| Search | `q + cursor`，服务端全文 + 31 条 category 别名 |

### 3.3 关键推论

1. **当前没有任何代码路径消费 popular_series**——建不建 Series 实体，都不影响现有行为；
2. **前端 Discovery 专题/品牌/话题三块是空态**，这不是缺 Series，是 feed 不产这些 feedType + 无 /api/v1/brands 端点；
3. **Phase 2.1 的 styles 结构与 API 全就绪，缺的是数据**；
4. **用户行为证据为零**（user_events 空表），无法证明"用户会按系列搜索"。

---

## 4. 用户场景分析

### 4.1 三坑用户实际找商品的路径（基于标题结构与行业常识，无用户行为数据佐证）

| 路径 | 例子 | 现有覆盖 |
|---|---|---|
| 品牌 → 商品 | "兔缝缝 格裙" | ✅ 品牌名全文 + 品牌关注 |
| 品牌 → 款式 | "Alice girl 十字姬" | ⚠️ 全文搜索可命中标题；款式别名未建 |
| 品类/坑向 | "洛丽塔 JSK" | ✅ 31 条 category 别名 |
| 风格/元素 | "哥特 暗黑" | ⚠️ 全文命中标题；element_tags 未填充 |
| **品牌 → 系列** | "咩耶 马戏团系列" | ⚠️ 全文命中标题（32 条），无聚合视图 |
| **系列 → 全系列浏览** | "看马戏团系列全部配色" | ❌ 无（需 Series 或 Style 聚合） |

### 4.2 什么时候用户真的以"系列"为单位

仅在两种情况成立：
1. **品牌官方命名系列且系列内多款式/多配色需要横向比较**（如 K.Q.F 马戏团系列 = Queen 黑红 + FUNFAIR 糖果色，用户想"看全系列再决定"）；
2. **系列有主题叙事/收藏属性**（限定联名、周年纪念）——当前数据联名 2 条、周年 0 条，近乎不存在。

当前数据中，带"系列"字样的 32 条标题分散在约 20 个品牌里，每个品牌可提取的真系列通常只有 1-3 个、每个系列 1-5 个商品——**远未达到需要 Series 实体聚合的规模**。

### 4.3 用户行为证据

`user_events` 表 0 行：无任何真实搜索/浏览/收藏事件可证明"用户按系列搜索"。这是"不建 Series"决策的最硬证据。

---

## 5. Series 与 Style 的业务边界

### 5.1 定义

| 维度 | Style（款式） | Series（系列） |
|---|---|---|
| 层级 | 品牌下第二层 | 品牌下第二层（与 Style 平行或更高） |
| 本质 | **单个款式**：同款多色/多尺码/多批次/再贩 | **企划级命名集合**：跨款式、有主题叙事 |
| 粒度 | 一个 JSK + 它的所有颜色/再贩 = 1 Style | "马戏团企划" = Queen + FUNFAIR + 周边 = 1 Series |
| 用户意图 | 想买这个款 | 想看全系列 / 按主题发现 |
| 数据稳定性 | 高（款式名长期不变） | 中（企划有生命周期） |
| 当前数据 | 标题可提取（【】标记/裸款式名），**已建表未填充** | 标题"系列"字样仅 32 条，**无表** |

### 5.2 两条链路何时成立

**Brand → Series → Style → Product → Release**

仅当品牌显式以企划/系列组织商品时成立（证据：标题含"系列"字样且系列内 ≥2 个可识别款式，如 K.Q.F 马戏团系列）。当前 3363 商品中可辨识此类 ≤32 条。

**Brand → Style → Product → Release**

默认链路，覆盖 99% 商品。琴挑【石榴花神】、Alice girl 十字姬、葵子【水色纪】全部走这条。

### 5.3 反例（不许叫 Series 的东西）

- "制服"/"套装"（802/1110 条）＝ 商品形态/品类，**不是系列**；
- "异域风系列"/"甜系"＝ 风格标签，应进 style_tags，**不是系列**；
- 淘宝运营自定义分类（品牌店的多级类目）＝ 后台分类，**不是系列**；
- "经典款群组"＝ 多个独立 Style 的运营聚合，**不是 Series 实体**。

---

## 6. 十二问答案

### Q1：用户什么时候真的会以「系列」为单位找商品？
当品牌官方命名系列、系列内 ≥2 个可比较款式/配色、且用户有"看全系列再决策"意图时（如 K.Q.F 马戏团系列）。当前数据满足此条件的不超过 32 条标题、约 20 个品牌，且 **user_events 零行为证据**。默认路径仍是"品牌 + 款式名/品类"。

### Q2：三坑用户搜索的「系列」到底包括哪些东西？
必须区分五类，**不允许全部叫 Series**：

| 类型 | 当前数据 | 归类 |
|---|---|---|
| 品牌系列（官方命名） | 32 条标题（马戏团/熊熊板巧/风铃草…） | 唯一可算 Series 的 |
| 联名企划 | 2 条（联名） | 独立协作维度，数据太少单独建模 |
| 年度/周年企划 | 0 条 | 不存在 |
| 胶囊/主题系列 | 主题 2 条（多为风格词误用） | 风格标签 |
| 经典款群组 | 无法从标题辨识 | = Style 集合，运营聚合即可 |

### Q3：Series 与 Style 的业务边界（见第 5 节）
- **Brand → Series → Style → Product → Release**：品牌显式企划命名时成立（≤1% 数据）；
- **Brand → Style → Product → Release**：默认链路（99% 数据）。
- 判断规则：**同一名称下商品是"同款多色/多批次"→ Style；同一名称下是"多款式集合且有主题"→ Series。**

### Q4：Style + popular_series 是否已满足 80% 需求？
**结构上能，数据上不能。** popular_series 是 100% 空 + 假语义死代码；styles 表也是 0 行。当前系统真正缺的不是模型，是 **styles 的数据填充**。把标题款式名提取进 styles 后，"品牌 → 款式 → 商品"链路即可覆盖主要需求；Series 在其中只承担 ≤1% 的"系列聚合浏览"。

### Q5：Series 实体的新增用户价值（禁止答"方便管理"）
1. **系列图谱浏览**：进入一个系列看全部款式/配色/价格，辅助横向决策；
2. **系列发售聚合**：系列下各款式发售时间聚合展示（Reminder 场景）；
3. **系列内容聚合**：社区返图按系列归集（种草场景）。
但三者都依赖"品牌真的有系列"——当前数据密度（每系列 1-5 商品）无法支撑图谱价值，且无用户行为验证。

### Q6：Series 是否应该成为用户主动搜索对象？
**当前不。** 全文搜索已能命中 32 条"系列"标题；等 styles 填充 + user_events 出现系列词搜索记录后再评估（LATER）。届时最小成本 = 往 aliases 加 style/series 类型词条，无需实体。

### Q7：Series 是否应该进入 Feed？
**不。** Feed 是商品内容流（feed_score 排序），Series 是组织维度不是内容单元。系列上新/系列专题属于 Editorial（精选专题）职责，而 Editorial 目前本身还没有数据源。

### Q8：Series 是否应该成为 Discovery 的入口？
**不。** Discovery 的专题/品牌/话题目前**全空态**（feed 不产对应 feedType、无品牌 API），先填现有入口的数据比新增 Series 入口重要。等品牌目录与专题有真实内容后，若系列数据积累到可浏览规模，再以"品牌详情页内一个 Tab"的轻量形态进入（仍不需要独立实体）。

### Q9：Series 是否应该关联 Community？
**内容上应该（返图按系列聚合很自然），实体上不必要。** community_posts 已有 topic（字符串）字段，系列名可作为话题词。当前 community_posts 0 行，一切等社区有数据。

### Q10：Series 是否应该关联 Trend / Topic？
**不。** Trend 引擎基于品牌 + 商品价格/状态聚合，系列维度收益极小；Topic 是社区话题字符串，系列名出现在话题里即可。

### Q11：Series 是否应该进入 VIP？
**不。** VIP 商业化不制造实体——没有用户价值证据前，不为商业目的造实体（与指令默认倾向一致）。

### Q12：Series 是否值得现在开发？
**LATER（证据驱动，不是 NOW）。**

| 档位 | 判断 | 依据 |
|---|---|---|
| NOW | ❌ | 数据 1%（32 条）、实体 0 基础、用户证据 0、popular_series 假语义 |
| NEXT | ⚠️ 不是 Series——是 **Style 数据填充** | 复用 0010 已建结构，标题款式名提取，让"同款式"模块亮起来 |
| LATER | ✅ Series 实体 | 触发条件：styles 填充后 user_events 出现系列词搜索 / 品牌系列数据 ≥100 可辨识系列 |
| NEVER | ✅ D 方案（多实体体系） | YAGNI 硬规则 |

---

## 7. A/B/C/D 方案比较

评分 1-5（5 = 最优）。用户价值为**当前数据规模下可实现的价值**，不是理论最大值。

| 维度 | A 不建实体（popular_series 现状 + Style） | B 最小 Series 实体 | C Series+Alias+Relation | D 完整多实体体系 |
|---|---|---|---|---|
| 用户价值 | 3（Style 填充后可达 4） | 2（无数据支撑） | 2 | 2 |
| 数据准确性 | 2（popular_series 假语义，需重定义或弃用） | 3（真系列表，但无源） | 3 | 3 |
| 搜索价值 | 3（全文+别名已覆盖 1%） | 3（多 1% 精确命中） | 4（别名增强） | 4 |
| Feed 价值 | 3（无影响，本就不该进 Feed） | 3 | 3 | 3 |
| Discovery 价值 | 2（现有入口都是空态，先修数据源） | 3（多一个入口） | 3 | 4 |
| 社区价值 | 3（topic 字符串够用） | 3 | 3 | 3 |
| 运营成本 | 5（零新增） | 3（需人工标注系列归属） | 2 | 1 |
| 数据维护成本 | 4（只维护 Style） | 3 | 2 | 1 |
| 开发复杂度 | 5（零开发） | 3（表+API+前端） | 2 | 1 |
| 长期扩展性 | 3（后续可平滑升级到 B） | 4 | 4 | 4 |
| **合计** | **33** | **30** | **29** | **26** |

### 推荐：方案 A

理由：
1. 当前数据规模（32 条"系列"标题 / 0 用户证据 / 0 社区数据）无法支撑任何 Series 实体的用户价值；
2. 方案 A 到 B 的升级路径平滑：styles 表填充后，若出现系列需求，`brands` 加 `series_names text[]`（或新表）即可，现有代码零破坏；
3. 方案 A 的正确动作是**数据填充**（Style 提取）而非"什么都不做"；
4. 方案 C/D 的别名与多实体体系在当前数据密度下是纯负债（YAGNI）。

---

## 8. 推荐方案（最终）

**方案 A：不建立 Series 实体。** 继续以 Brand → Style → Product → Release 为主链路；popular_series 列重定义或弃用；把资源投入 Style 数据填充（Phase 2.1 收尾）与 Discovery 数据源修复。

---

## 9. NOW / NEXT / LATER / NEVER

| 档位 | 内容 |
|---|---|
| **NOW** | 不开发 Series，不建表，不加 API，不加前端页面 |
| **NEXT** | ① 标题款式名提取 → 填充 styles + products.style_id（复用 0010 结构，让"同款式"模块上线）；② 修复 Discovery 空态：补 GET /api/v1/brands 或让 feed 产出 editorial/brand_post 类型；③ popular_series 列要么重定义为"品牌真实系列名提取"，要么标记弃用 |
| **LATER** | 触发条件满足后再评估最小 Series 实体（方案 B）：styles 填充后 user_events 出现系列词搜索 / 品牌系列可辨识数量 ≥100 |
| **NEVER** | 方案 D（Series/Collection/Collaboration/Theme 多实体体系）——YAGNI + KISS 硬规则 |

---

## 10. 不建 Series 时，如何继续利用 popular_series

现状盘点：列存在（0004 定义）、100% 空、零读取方、零写入方、唯一计算函数是假语义死代码。**当前它对产品零影响也零价值。**

三条出路（按推荐序）：

1. **重定义为"品牌真实系列名"（推荐）**：等 Style 提取实施时，把标题中"XX系列"（32 条）与【】款式名中的企划名一并提取，popular_series 存品牌级系列名（text[]，每品牌 0-3 个）。此时它是"品牌画像字段"（brand profile 的一部分），仅供品牌详情页展示，**不建表不建 API**；
2. **弃用**：保持空列，代码里标注 @deprecated。零成本，但保留一个误导性字段；
3. **禁止**：继续把 category 词频当系列（computePopularSeries 的死代码语义）——这是错误语义，必须避免。

---

## 11. 对 Search / Feed / Discovery / Community / Trend 的影响

| 模块 | 影响 | 说明 |
|---|---|---|
| **Search** | 无负面；有增强空间 | 全文已命中"系列"标题；styles 填充后可加 style 别名（如"十字姬"）；Series 词可直接并入 style 别名，无需实体 |
| **Feed** | 无影响 | Feed 排序（feed_score + md5 打散）不涉及系列；系列也不应进入 Feed |
| **Discovery** | 本阶段最大机会点 ≠ Series | 专题/品牌/话题三块空态源于 feed 不产 editorial/brand_post 类型 + 缺品牌 API；发售日历 0 数据源于 product_releases 空。**修复数据源优先于新增 Series 入口** |
| **Community** | 无影响 | product_id 关联已就位；系列聚合可用 topic 字符串，等社区有数据 |
| **Trend** | 无影响 | 品牌+商品聚合已够；系列维度收益极小 |

---

## 12. 下一阶段建议

**建议 Phase 2.5 = Style 数据填充（不是 Series 开发）。**

理由链：
1. Phase 2.1 已建 styles 表 + /styles/:id API + 前端"同款式"模块，全部就绪、全部空转（styles 0 行、style_id 0 填充）；
2. 标题款式名结构清晰可提取（琴挑/葵子【】标记、Alice girl 裸款式名），是确定性数据工程，不是猜测；
3. 这是"系列"需求的**前置数据资产**——没有 Style 图谱，Series 永远是无源之水；
4. 顺带修复：GET /api/v1/brands 缺失（品牌目录契约落空）、Discovery 三空态、popular_series 语义。

**Phase 2.5 建议范围（供下阶段任务书细化）：**
- 款式名提取规则（【】优先 → 品牌固定词缀剥离 → 系列词捕获）+ dry-run 审核脚本（沿用 Phase 2.1 归并 dry-run 模式）
- styles 填充 + products.style_id 绑定（幂等、可回滚、禁动生产数据前先用户授权）
- 品牌目录数据源修复（新端点或 feedType 扩展，需产品确认）
- Series 议题关闭：除非出现用户行为证据，不再立项

---

## 附：审计证据清单（可复核）

- `SELECT count(*) FROM brands WHERE popular_series <> '{}'` → 0（252 品牌全空）
- `SELECT count(*) FROM styles` → 0；`SELECT count(*) FROM products WHERE style_id IS NOT NULL` → 0
- `SELECT count(*) FROM product_releases / product_variants / community_posts / user_events` → 全部 0
- `SELECT * FROM aliases` → 31 条，alias_type 全部 = category
- 标题词汇：系列 32 / 套装 1110 / 制服 802 / 联名 2 / 企划 0 / 周年 0
- `grep -rn "popular_series" src/` → 仅 brand-intelligence.ts（死代码）
- `grep -rn "popular_series" migrations/ scripts/ seeds/` → 仅 0004 定义列
- `grep -rn "Series" 前端 domain/services/stores/pages` → 仅 series.uts barrel export（零业务引用）
- 路由清单：content.ts 无 /api/v1/brands；interaction.ts 仅 follow/unfollow/followed
- 前端 Discovery：features/brands/topics 全部 = feedStore 按 feedType 过滤，后端只产 'product'
- 生产库 schema_migrations：0001-0012 全部已应用（含 0010_styles / 0011_search_aliases / 0012_community_product）

---

*本阶段结束。未修改任何代码、未执行任何 migration、未修改任何数据库、未新增任何 API/前端页面。*
