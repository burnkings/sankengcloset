# Phase 2.2 三坑专属搜索词库 — Search Business & Architecture Audit

日期：2026-08-20
基线：Phase 1 PASS / Phase 2.1 Style Entity PASS
性质：纯审计（真实代码核对 + 业务模型设计），零代码零数据库改动
结论：**READY（Phase 2.2 可实施，范围见 §18）**

---

## 1. 当前 Search 架构（逐段真实代码核对）

### 后端
```
GET /api/v1/search?q=&category=&saleStatus=&releaseStatus=&brandId=&minPrice=&maxPrice=&cursor=&limit=
（routes/content.ts searchQuerySchema：q≤100 字符，category/saleStatus 白名单枚举）

postgres.ts searchProducts()：
  WHERE deleted_at is null AND visibility_status='published'
  AND ( display_name ILIKE %q%
        OR canonical_name ILIKE %q%
        OR b.name ILIKE %q%
        [OR p.pit_type = resolveAliasCategory(q)]   ← 命中大类别名时追加
      )
  [+ category / saleStatus / releaseStatus(EXISTS product_releases.release_type) / brandId / 价格区间]
  ORDER BY p.feed_score desc, p.id desc
  分页：feed_score+id keyset cursor；saved 按 userId 实时计算
```

### 前端
```
search/index.uvue（placeholder「搜索商品、品牌、穿搭」）
  → onSubmit：addRecent(keyword) + runSearch(keyword)   ← 原始输入直接透传
  → search-store.requestSearchPage（品牌黑名单过滤）
  → search-service.searchProducts → GET /api/v1/search?q=
```

## 2. 当前 Search Gap

| # | Gap | 证据 |
|---|---|---|
| G1 | 无词库实体：无 aliases 表、无词库文件、无 search-terms.uts（Phase 1.1 Task 4 未落地） | 全库 grep 0 命中 |
| G2 | alias 硬编码：resolveAliasCategory 代码内 if 判断，非数据驱动 | postgres.ts:368-374 |
| G3 | Style 不可搜：styles 表已建（Phase 2.1），search 未 join styles | search SQL 无 styles |
| G4 | 品牌仅精确包含：b.name ILIKE，无简称/旧称展开 | search SQL b.name |
| G5 | 无相关性排序：纯 feed_score desc，精确/前缀/包含无权重 | ORDER BY |
| G6 | 无 Unicode normalize：全角/半角不归一 | 仅 toLowerCase |
| G7 | Release 关键词不可搜：releaseStatus 只能过滤枚举，release_name 不进 ILIKE | search SQL |

## 3. 当前已有 alias（全部硬编码）

```
resolveAliasCategory(q)：lower = q.trim().toLowerCase()
  洛丽塔（includes）或 lolita（全等）→ LOLITA
  汉服（includes）或 hanfu（全等）→ HANFU
  jk（全等/includes）或 制服（includes）→ JK
  其余 → ''
```
覆盖范围：仅 3 大类坑向别名，命中时追加 `p.pit_type = alias` 过滤。**无品牌/款式/商品别名，无词库表。**

## 4. JK 搜索词分类

| 分类 | 词 | 状态 |
|---|---|---|
| A 品类词 | 格裙、制服、水手服、衬衫、西装外套、领带、领结、开衫、背心裙 | ✅ 稳定系统词 |
| B 圈内简称 | 格裙=格纹裙、jk、制=制服 | ✅ 稳定 |
| C 俗称 | 经典格裙昵称（如"海苔"类） | ⚠️ 需运营确认 |
| D 商品类型 | 格裙/半裙/衬衫/开衫/西装/领带/领结/袜子 | ✅ 稳定 |
| E 属性词 | 绀色/黑色/灰色/棕色；45cm/48cm；纯色/格纹/条纹 | ✅ 稳定（不入 alias，走 ILIKE） |
| F 品牌正式 | 兔缝缝、中牌制服部、春日制服部 | ✅ |
| G 品牌简称 | 中牌 | ✅ 稳定 |
| H 品牌旧称 | — | ⚠️ 需运营确认 |
| I Style 正式 | 具体制服名（来自 styles.canonical_name） | ✅ 数据驱动（Phase 2.1） |
| J Style 简称 | — | ⚠️ 需运营确认 |
| K Style 旧称 | — | ⚠️ 需运营确认 |

## 5. Lolita 搜索词分类

| 分类 | 词 | 状态 |
|---|---|---|
| A 品类词 | Lolita、洛丽塔、lo裙、洋装、花嫁、甜系、哥特、cla | ✅ 稳定系统词 |
| B 圈内简称 | lo=洛丽塔；JSK=无袖背心裙；OP=有袖连衣裙；SK=半裙；KC=发箍；BNT/BT=衬裙 | ✅ 稳定 |
| C 俗称 | 柄图昵称（草莓柄、月光曲柄等） | ⚠️ 需运营确认 |
| D 商品类型 | JSK/OP/SK/KC/BNT/衬衫/鞋/包 | ✅ 稳定 |
| E 属性词 | 甜系/哥特/古典/cla；蕾丝/缎带/柄图 | ✅ 稳定 |
| F 品牌正式 | Alice Girl、花筵、婴梵塔、星辰猫、仲夏物语 | ✅ |
| G 品牌简称 | — | ⚠️ 需运营确认 |
| H 品牌旧称 | — | ⚠️ 需运营确认 |
| I Style 正式 | 联名系列名（星辰猫 × 月光曲 JSK） | ✅ 数据驱动 |
| J/K | — | ⚠️ 需运营确认 |

## 6. 汉服搜索词分类

| 分类 | 词 | 状态 |
|---|---|---|
| A 品类词 | 汉服、汉元素、马面、襦裙、齐胸、圆领袍、明制、宋制、唐制 | ✅ 稳定系统词 |
| B 圈内简称 | 马面=马面裙 | ✅ 稳定 |
| C 俗称 | 形制俗名 | ⚠️ 需运营确认 |
| D 商品类型 | 马面裙/对襟/齐胸襦裙/圆领袍/褙子/斗篷/比甲 | ✅ 稳定 |
| E 属性词 | 明制/宋制/唐制/晋制；织金/绣花/仿妆花 | ✅ 稳定 |
| F 品牌正式 | 织造司、十三余、重回汉唐、花朝记 | ✅ |
| G/H | — | ⚠️ 需运营确认 |
| I Style 正式 | 形制+款式（明制马面裙） | ✅ 数据驱动 |
| J/K | — | ⚠️ 需运营确认 |

## 7. Brand Alias

- 现状：仅 `b.name ILIKE %q%`（正式名包含匹配），无简称/旧称
- 需求：品牌简称（中牌）、旧称、英文名（name_en 已有列可搜）、圈内称呼
- 归属：**独立 alias 实体（type='brand'）**，数据驱动（品牌数量增长快，运营可维护）

## 8. Style Alias

- 现状：Phase 2.1 已建 styles.canonical_name，**搜索未接入**
- 需求：style 简称/圈内俗称（"月光曲"→ 月光曲 JSK 款式）
- 归属：**独立 alias 实体（type='style'，canonical 指向 styles.id）**，原因见 §4 报告
- 搜索接入：search SQL LEFT JOIN styles（canonical_name ILIKE）或 alias 展开后按 style_id 过滤

## 9. Product Alias

- 现状：display_name/canonical_name ILIKE 已覆盖商品名搜索
- 需求：商品级别名/旧称（单商品特称）——**本阶段不建议**（商品 3363 且持续导入，别名维护成本高；款式级 alias 已覆盖绝大多数"认款"场景）
- 结论：Product alias 留待需要时再评估，YAGNI

## 10. Alias 数据模型方案对比

| 维度 | A 前端硬编码 | B 后端 alias 表 | C 配置文件+本地词库 | D 混合（推荐） |
|---|---|---|---|---|
| 性能 | 最优（零请求） | 好（一次查询） | 最优 | 最优（系统词零请求） |
| 维护成本 | 差（改词发版） | 好（运营可改） | 中（发版） | 好 |
| 更新速度 | 慢 | 快（改库即生效） | 慢 | 快（业务词） |
| 离线能力 | 最好 | 差（无网络无词库） | 最好 | 中（系统词可离线） |
| 一致性 | 差（多端漂移） | 好（单一事实源） | 中 | 好 |
| UTS 复杂度 | 低 | 中（映射） | 低 | 低-中 |

**推荐：方案 D 混合**
- 稳定系统词（分类 enum 词：lo裙/JSK/马面/格裙/制服…约 30-50 条，跨品牌通用、几乎不变）→ 前端内置常量或后端 seed（建议后端 seed 进 alias 表，前端零维护，一条通道）
- 业务实体 alias（品牌简称/旧称、Style 俗称、圈内俗称，数据增长快、需运营维护）→ 数据库 aliases 表
- 实际实现上两者共用一个 aliases 表（系统词也入表 seed），前端不做词库 → **简化为一套后端体系**

## 11. 前端 vs 后端职责

| 环节 | 归属 | 理由 |
|---|---|---|
| trim / 透传 | 前端 | 现有行为保留 |
| Unicode normalize（NFKC 全半角） | 后端 | 单一事实源 |
| lowercase | 后端 | 已实现 |
| alias resolution | 后端 | 数据驱动词库，多端一致 |
| 搜索执行 | 后端 | 现有 |
| 排序 | 后端 | 现有 |
| 展示/最近搜索 | 前端 | 现有 |

结论：**词库与解析全部后端化，前端零改动**（除可选展示层）。

## 12. Normalize 方案

```
前端：keyword.trim()（现有）
后端 resolveSearchTerms(q)：
  1. trim + toLowerCase（现有）
  2. NFKC Unicode normalize（全角→半角：ＪＫ→JK、ＬＯ→LO）— UTS/Node native normalize('NFKC')
  3. 多空格折叠（"兔缝缝  格裙" → 单空格）
  4. alias lookup：整词/包含匹配 aliases 表 → 返回 canonical 列表
```
- 不拆词（无分词器，YAGNI）；中文按整串 ILIKE 已是有效方案

## 13. Search Resolution 流程

```
用户输入
  ↓ 前端 trim 透传
GET /api/v1/search?q=
  ↓ 后端
  1. normalize（NFKC + lower + 空格折叠）
  2. alias 展开：
     - 分类词命中（lo裙→LOLITA 等）→ 追加 pit_type OR 分支（替代现有硬编码）
     - 品牌词命中（中牌→brand_id）→ 追加 brand_id OR 分支
     - 款式词命中（月光曲→style_id）→ 追加 style_id OR 分支（join styles）
  3. 原词 ILIKE（display_name/canonical_name/brand_name/style.canonical_name）
  4. 排序（§14 ranking）
  5. 返回
```

## 14. Search Ranking（推荐最小方案）

相关性分（SQL 或 JS 层加权）：
```
exact match（display_name/canonical_name = q）    权重 3
prefix match（字段 LIKE q%）                       权重 2
contains match（ILIKE %q%）                       权重 1
brand exact                                       权重 +2（实体优先级）
style exact（styles.canonical_name = q）           权重 +2
final = 相关性权重 * 1000 + feed_score（降序）
```
目标：搜"品牌+款式"→ Brand/Style 精确实体优先于大量无关商品。实现为排序表达式增量，不动现有 keyset 分页语义（可在首屏 rank 后二次排序，与 feed enrich 同模式；cursor 稳定性需评估）。

## 15. 运营维护方案

最小数据模型（本阶段不做后台系统）：
```sql
aliases (
  id text PRIMARY KEY,
  term text NOT NULL,               -- 别名词（lo裙/中牌/月光曲）
  canonical text NOT NULL,          -- 规范目标（LOLITA / brand_id / style_id / 品牌名）
  alias_type text NOT NULL,         -- category | brand | style
  category pit_type NOT NULL DEFAULT 'OTHER',  -- 坑向（运营归类）
  status text NOT NULL DEFAULT 'active',       -- active | disabled（生效/禁用）
  source text NOT NULL DEFAULT 'seed',         -- seed | operator
  confidence integer NOT NULL DEFAULT 100,
  created_at / updated_at timestamptz,
  deleted_at timestamptz
)
CREATE INDEX aliases_term_idx ON aliases (term) WHERE status='active' AND deleted_at IS NULL
```
维护方式：种子脚本（scripts/seed-search-aliases.ts 幂等 upsert）+ 未来运营管理（不建后台 UI，可直接 SQL/脚本）。

## 16. AI Search 是否应该现在做

**不应该。** 明确禁止 LLM Search / Embedding / Vector DB / RAG / 语义搜索。理由：
- 当前规模（3363 商品）确定性词库+ILIKE 已足够且可解释
- 词库数据（aliases）是未来任何 AI 方案的基础（canonical 训练/检索锚点），先建数据层
- YAGNI + 用户产品边界

## 17. 推荐方案（汇总）

1. **方案 D 混合词库**：统一后端 aliases 表（系统词 + 业务词同表，seed 填充）
2. **后端解析链**：normalize（NFKC）→ alias 展开（category/brand/style）→ 搜索
3. **Style 搜索接入**：search SQL LEFT JOIN styles（style 名可搜 + style alias 展开）
4. **Ranking 相关性权重**：exact > prefix > contains + 实体优先级
5. **前端零改动**（词库后端化）

## 18. Phase 2.2 最小开发范围

```
后端：
  1. migrations/0011_search_aliases.sql（aliases 表 + 索引）
  2. scripts/seed-search-aliases.ts（幂等种子：分类词 ~30-50 条 + 品牌简称首批 + Style 俗称空表待运营）
  3. search 解析：resolveSearchTerms（NFKC normalize + alias 展开）
  4. search SQL：alias 展开 OR + LEFT JOIN styles（style 名搜索）
  5. ranking：exact/prefix/contains 权重
  6. 测试：alias 展开 / style 搜索 / ranking / 旧行为回归

前端：零改动（或仅搜索提示文案）

禁止：AI 搜索、前端词库、后台运营系统、搜索历史云同步、拼音/纠错、Product alias
```

## 19. Phase 2.2 不应该做的事情

1. LLM / Embedding / Vector / RAG / 语义搜索
2. 前端本地词库/normalize（后端化，避免双源不一致）
3. 完整后台运营 UI（只要 seed 脚本 + 数据模型）
4. Product 级 alias（款式级已覆盖认款场景）
5. 拼音搜索 / 输入纠错 / 搜索联想
6. 搜索历史云同步 / 多端合并
7. 分词器 / 全文索引引擎（pg_trgm 已够）
8. 繁简转换 / 多语言
9. 搜索点击埋点驱动的个性化排序（未来再说）

## 20. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 俗称误归（同名不同款） | 中 | alias 走审核（status/confidence/source 字段），种子只放确定词 |
| ranking 改变破坏分页游标 | 中 | 排序表达式增量 + keyset 语义保持；首屏二次排序同 feed enrich 模式，先测 |
| alias 膨胀（运营乱加） | 低 | status=active 过滤 + seed 幂等 + 只读查询 |
| 全角/NFKC 与 ILIKE 兼容 | 低 | normalize 在 SQL 前完成，参数化安全 |
| Style join 多表性能 | 低 | 3363 行规模，索引覆盖（styles_brand_name_unique） |

---

## 三个核心问题

**Q1：现在搜索距离"真正懂三坑"还差什么？**

差 4 件事：① 词库体系（分类词/简称/俗称无数据通道，仅 3 大类别名硬编码）；② Style 不可搜（Phase 2.1 实体已建未接入 search）；③ 品牌只支持正式名包含匹配（无简称/旧称）；④ 无相关性排序（纯 feed_score，精确/前缀/包含无区分）。

**Q2：最少增加哪些能力就能明显改善用户体验？**

① aliases 表 + 种子词（分类词 30-50 条 + 品牌简称首批）——"搜 lo裙/JSK/马面"立即命中正确分类；② search 后端 alias 展开 + styles join——"搜月光曲"能出款式及同款商品；③ ranking 相关性权重——"品牌+款式"优先出实体。**前端零改动**。

**Q3：哪些搜索能力现在绝对不要做？**

AI/语义搜索（LLM/Embedding/Vector/RAG）、前端词库、后台运营系统、Product alias、拼音/纠错/联想、搜索历史云同步、分词器。

---

## 结论

**PASS**（审计完成，Phase 2.2 可实施）

报告：docs/reports/Phase2.2-Search-Alias-Business-Audit-20260820.md

禁止修改代码/数据库/commit。停止，等待产品指令进入 Phase 2.2 实施。
