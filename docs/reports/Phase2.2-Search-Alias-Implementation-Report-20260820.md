# Phase 2.2-A Search Alias Implementation — Implementation Report

日期：2026-08-20
基线：Phase 1 / 2.1 PASS，Phase 2.2 Business Audit PASS（docs/reports/Phase2.2-Search-Alias-Business-Audit-20260820.md）
结论：**PASS**（含缩写词边界缺陷修复，2026-08-20 第二轮完成）

---

## 1. 修改前 Search

```
用户输入 → 前端原样透传 → GET /api/v1/search?q=
  → postgres.ts searchProducts：
      WHERE deleted_at is null AND visibility_status='published'
        AND (display_name ILIKE %q% OR canonical_name ILIKE %q% OR b.name ILIKE %q%
             [OR p.pit_type = resolveAliasCategory(q)])   ← 硬编码 3 大类别名
      ORDER BY p.feed_score desc, p.id desc
  → 无 normalize、无词库、无 Style 搜索、无相关性排序
```

## 2. 修改后 Search

```
用户输入 → 前端原样透传 → GET /api/v1/search?q=
  → normalizeSearchTerm：trim → Unicode NFKC（全角→半角）→ 小写 → 多空格折叠
  → resolveSearchAliases（SQL，status=active 粗筛候选）
  → resolveSearchTerms（JS 精筛，单一语义来源）：
      category 命中 → p.pit_type = ANY(...)
      brand 命中 → p.brand_id = ANY(...)
      style 命中 → p.style_id = ANY(...)
  → 文本 ILIKE（display_name / canonical_name / brand.name / styles.canonical_name）
  → 相关性排序：entity(6) > exact(5) > category/prefix(4) > contains(3) > feed_score
  → v2 rank keyset 游标（v1 无 rank 游标 → 400 提示重新加载）
```

## 3. aliases schema（migration 0011）

```sql
aliases (
  id             text PRIMARY KEY,          -- 确定性 id：alias_<type>_<term>
  term           text NOT NULL,             -- 规范化别名词（NFKC + 小写）
  canonical_term text NOT NULL,             -- category→pit_type；brand/style→实体 id
  alias_type     text NOT NULL CHECK (alias_type IN ('category','brand','style')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','review')),
  confidence     integer NOT NULL DEFAULT 100 CHECK (confidence BETWEEN 0 AND 100),
  source         text NOT NULL DEFAULT 'seed',
  created_at / updated_at / deleted_at timestamptz
)
-- 索引（仅实际查询热点，3 个）：
--   aliases_term_type_unique  (term, alias_type) WHERE deleted_at IS NULL   ← seed 幂等键
--   aliases_lookup_idx        (term) WHERE status='active' AND deleted_at IS NULL
--   aliases_canonical_idx     (canonical_term, alias_type) WHERE status='active' AND deleted_at IS NULL
```

## 4. migration

- 文件：`migrations/0011_search_aliases.sql`（纯增量，IF NOT EXISTS，可重复执行）
- **生产库真实执行**（127.0.0.1:5433 docker postgres，2026-08-20 00:58）：
  - 前置备份：`docker exec sankeng-pg_postgres_1 pg_dump -F c` → /tmp/sankeng-pre-0011.dump（2,387,140 字节）
  - `node --env-file=.env.production --import tsx scripts/migrate.ts` → **Applied migrations/0011_search_aliases.sql**
  - 验证：`\d aliases` 表 + 3 索引 + 3 CHECK 约束全就位；schema_migrations 已记录 0011（共 14 条）
  - products 3363 条数据不受影响（本次无列变更）

## 5. seed

- 文件：`scripts/seed-search-aliases.ts` + package.json `seed:aliases` 脚本
- 幂等：确定性 id（alias_<type>_<term>）+ `ON CONFLICT (term, alias_type) WHERE deleted_at IS NULL DO UPDATE`
- 词库单一事实源：`src/lib/search-alias-words.ts`
  - CATEGORY_ALIASES 31 条（LOLITA 12 / HANFU 11 / JK 8，严格取自审计 §4-6「✅ 稳定」词；歧义词如衬衫/半裙不入）
  - BRAND_ALIAS_TERMS 1 条（中牌→中牌制服部，seed 时按品牌名解析 id，实体缺席自动跳过）
  - STYLE_ALIAS_TERMS 空表（俗称待运营确认，schema 已支持）
- **生产库真实执行 2 次**（幂等验证）：
  - 第 1 次：31 upserted, 1 skipped（中牌制服部品牌不存在）
  - 第 2 次：31 upserted, 1 skipped（全部 ON CONFLICT UPDATE）
  - 库内验证：total=31, distinct(term,alias_type)=31 → **无重复数据**；alias_type 全为 category（brand 因实体缺席合规跳过）

## 6. normalize

`src/lib/search-terms.ts normalizeSearchTerm()`：
```
trim → Unicode NFKC（ＪＫ→JK、ＬＯＬＩＴＡ→lolita）→ toLowerCase → 多空格折叠
```
- 前端保持零改动（trim 透传原有行为）
- 词库 term 一律以规范化形式存储（seed 前再次 normalize）

## 7. alias resolution

`src/lib/search-terms.ts resolveSearchTerms(normalized, aliasRows)`：
- 匹配策略：term 精确相等优先（exact→0），confidence 高优先，再按 aliasType 分组去重
- 缩写词边界修复（2026-08-20 第二轮，详见 §15 风险修复）：
  - `isShortAsciiAbbr()`：/^[a-z0-9]{1,3}$/ 判定纯 ASCII 短缩写（op/sk/jk/lo/bt/kc/bnt）
  - `matchesAliasTerm()`：缩写词用词边界正则 `(^|[^a-z0-9])term($|[^a-z0-9])`；中文/长词维持 includes
  - 效果："drop" 中 op 无词边界 → 不命中；"lo裙" 中 lo 位于串首 → 命中；"jk制服" 中 jk 串首 → 命中
- 无 alias 命中 → 返回空分组，调用方继续原始文本搜索，**不失败**

## 8. category search

- 原硬编码 `resolveAliasCategory()`（postgres.ts:368-374 if/else）**已删除**，由 aliases 表数据驱动
- 代码零业务 alias if/else：31 条分类词全部入库，未来加词 = seed 数据，不改代码

## 9. brand search

- 正式名：`b.name ILIKE %q%`（保留）
- 简称/旧称：brand alias（term → brands.id）命中后 `p.brand_id = ANY(...)` + 实体优先 rank 6
- seed 首批 1 条（中牌），品牌不存在时自动跳过（alias 永不指向幽灵实体）

## 10. style search

- styles 表 LEFT JOIN（Phase 2.1 实体）：`st.canonical_name ILIKE %q%` → Style 正式名可搜
- style alias（term → styles.id）：俗称待运营确认（词表空，schema 已支持）
- Style 数据模型零改动

## 11. ranking

```sql
rank = case
  when brand_id/style_id 命中实体          then 6   -- exact entity match
  when display/canonical/brand/style = q   then 5   -- exact text match
  when pit_type 命中 category alias        then 4   -- category
  when display/canonical/brand/style LIKE q% then 4  -- prefix
  else 3                                            -- contains
end
ORDER BY rank desc, p.feed_score desc, p.id desc
```
- 无关键词（分类浏览）保持原 feed_score 排序，不污染
- v2 游标：rank + feed_score + id 三层 keyset；v1 无 rank 游标 → 400「游标无效，请重新加载」（向后兼容提示）

## 12. 测试

`tests/content/search-alias.test.ts`（纯内存 MemoryRepository，零生产库触碰）—— **24 项全过**：
1. lo裙 → LOLITA ✅  2. Lolita/LOLITA/洛丽塔 → LOLITA ✅  3. 格裙 → JK ✅
4. 汉服/马面裙/圆领袍 → HANFU ✅  5. Brand alias（星猫→星辰猫）✅  6. Style alias（月光→sty_moonlight）✅
7. 正式 Brand 名 ✅  8. 正式 Style 名 ✅  9. Product 搜索 ✅  10. 无 alias 普通搜索 ✅
11. 空字符串 ✅  12. 大小写 ✅  13. Unicode NFKC（ＪＫ）✅  14. exact>prefix>contains 排序 ✅
15. alias 不存在回退文本 ✅  16. seed 幂等（词表无重复键）✅
+ v2 分页游标 ✅ + v1 游标 400 提示 ✅ + 恶意输入 0 命中 ✅
+ **英文子串误匹配回归（新增）**：drop/shop/stop/open/logo/slot/skirt/jkl/btc/kcx/bntv 不返回 LOLITA/JK ✅
+ **缩写词边界单元（新增）**：lo裙/lo/jk制服/op 命中；drop/stop/logo 不命中 ✅

**全量后端测试**：`npm test` → **19 files / 203 passed / 1 skipped**（integration 自动 skip，TEST_DATABASE_URL 未配置，符合生产库保护约束）

## 13. 门禁

| 门禁 | 结果 |
|---|---|
| npm run check | [PASS] 全部 check 通过（唯一 WARN 为既有「待运营补充」发布门禁项） |
| npm run check:source | [PASS] |
| npm run check:android | [PASS] |
| npm run check:mp-weixin | [OK] |
| 真实 mp-weixin 编译 | **compiled successfully（ready in 25910ms，30 页面）** |

## 14. migration 验证

- 生产库 `\d aliases`：表结构/索引/约束完整 ✅
- schema_migrations：0011_search_aliases.sql 已记录（14 条完整链）✅
- 前置备份 /tmp/sankeng-pre-0011.dump 保留 ✅

## 15. 风险

| 风险 | 等级 | 说明/缓解 |
|---|---|---|
| 缩写 contains 误匹配（drop 含 op）| 已修复 | 词边界正则 + 11 个英文词回归测试 + 恶意输入测试；JS 精筛为单一语义来源，SQL/粗筛仅取候选超集，双端（postgres/memory）同语义 |
| 前端门禁依赖既有编译产物 | 低 | 本轮前端零改动；真实编译 fresh 通过 |
| 品牌 alias 依赖实体存在 | 低 | seed 自动跳过（中牌制服部当前不在库）；实体入库后重跑 seed 即生效 |
| build 遗留 TS2769（AI import）| 低 | 历史遗留（Phase 1.1-C 已确认），非本轮引入；npm test 与 dist 生成不受影响 |
| 中牌制服部品牌缺席 | 信息 | 合规跳过，alias 不指向幽灵实体 |

## 16. 未实现能力

- Style 俗称 alias（词表空，schema 已支持，待运营确认）
- 品牌简称补充（仅中牌 1 条，其他待运营）
- 拼音纠错 / 分词器 / 搜索联想（明确禁止范围）
- 后台运营 UI（仅 seed 脚本 + 数据模型，符合审计结论）

## 17. 后续建议

1. 运营确认俗称/简称后，通过 seed 词表增量补充（无需发版）
2. 中牌制服部品牌入库后重跑 `npm run seed:aliases` 自动补 alias
3. 搜索点击埋点驱动的个性化排序留待未来（当前确定性排序已满足）

---

## 修改文件清单

```
sankengcloset_service/migrations/0011_search_aliases.sql     新增（aliases 表 + 3 索引）
sankengcloset_service/src/lib/search-terms.ts                新增（normalize/escape/词边界匹配/resolve）
sankengcloset_service/src/lib/search-alias-words.ts          新增（词库单一事实源 31+1 条）
sankengcloset_service/scripts/seed-search-aliases.ts         新增（幂等 seed）
sankengcloset_service/tests/content/search-alias.test.ts     新增（24 测试，含缩写回归）
sankengcloset_service/src/repositories/contracts.ts          修改（resolveSearchAliases 接口）
sankengcloset_service/src/repositories/postgres.ts           修改（搜索链重构 + 排序 + v2 游标）
sankengcloset_service/src/repositories/memory.ts             修改（同语义内存实现 + seed 注入）
sankengcloset_service/package.json                           修改（seed:aliases 脚本）
```

工作树说明：仓库存在大量历史遗留未 commit 修改（跨 Phase 1.1-C / 2.1 / Directus 清理等），按惯例未提交，等待用户指示。

---

**最终结论：PASS**

报告：docs/reports/Phase2.2-Search-Alias-Implementation-Report-20260820.md

停止。不进入 Phase 2.3，等待产品指令。
