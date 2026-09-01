# Phase 2.1 Style Entity MVP — Implementation Report

日期：2026-08-20 00:05
基线：Phase 1 / 1.1-A / 1.1-B / 1.1-C / Risk #3 全 PASS
结论：**PASS**

---

## 1. 修改前结构

- products（48 列）：id/canonical_name/display_name/brand_id/pit_type/category(细分类目)/sub_category/style_tags/color_tags/material_tags/… —— **无 style_id**
- brands：无款式相关结构（仅 popular_series text[] 隐含系列名）
- product_releases：批次表（release_no/release_type/sale_status/时间/金额），无 style 引用
- 全代码库 grep style_id/styles/styleId：**0 命中，无重复 Style 结构**
- 前端 Product Domain 有 seriesId（空置），Series Domain 已定义但无数据源

## 2. 修改后结构

```
Brand 1──N Style 1──N Product 1──N ProductRelease
              │
              └── products.style_id（nullable 外键）
```

- styles 表（新）
- products.style_id（新增 nullable 列 + 部分索引）
- 前端：StyleInfo/StyleItem Domain + style-service + ProductDetailModel.styleId + detail 页「同款式」模块

## 3. migration

**migrations/0010_styles.sql**（纯增量，幂等）：
- `CREATE TABLE IF NOT EXISTS styles` + `styles_brand_name_unique (brand_id, canonical_name) WHERE deleted_at IS NULL`
- `ALTER TABLE products ADD COLUMN IF NOT EXISTS style_id text REFERENCES styles(id)`
- `CREATE INDEX products_style_idx ON products (style_id) WHERE deleted_at IS NULL AND style_id IS NOT NULL`

**真实 migration 验证（生产库 127.0.0.1:5433，用户授权）**：
- 前置备份：pg_dump custom → /tmp/sankeng-pre-0010.dump（2.38MB）
- `node --env-file=.env.production --import tsx scripts/migrate.ts` → **Applied migrations/0010_styles.sql**
- 验证：schema_migrations 记录 0010 ✅；styles 表存在（0 行）✅；products.style_id 列存在且 nullable=YES ✅；products 3363 条不受影响 ✅

## 4. Style schema

```sql
styles (
  id             text PRIMARY KEY,           -- sty_xxx（newId 规则）
  brand_id       text NOT NULL REFERENCES brands(id),
  canonical_name text NOT NULL,              -- 同品牌内唯一（部分唯一索引）
  category       pit_type NOT NULL DEFAULT 'OTHER',
  sub_category   text NOT NULL DEFAULT '',
  style_tags     text[] NOT NULL DEFAULT '{}',
  description    text NOT NULL DEFAULT '',
  created_at / updated_at / deleted_at
)
```

后端类型：`Style`（types.ts）= id/brandId/brandName/canonicalName/category/subCategory/styleTags/description/productCount/createdAt/updatedAt；`StyleDetail extends Style { products: Product[] }`。ID 规则（`${prefix}_${uuid}`）、时间字段、repository/API 风格均与现有代码一致。

## 5. Product → Style

- mapProduct（postgres.ts）读取 `row.style_id` → Product.styleId（nullable）
- getProduct SQL 的 `p.*` 自动包含 style_id 列，**无需改 SQL**
- 旧商品 style_id = NULL 完全兼容（3363 商品全部 NULL，正常展示）

## 6. Style → Product

- getStyle(styleId)（postgres.ts）：styles JOIN brands + 子查询 product_count + 该款式下 published 商品列表（feed_score desc, id desc 排序）
- MemoryRepository 同步实现（styles Map + seedStyle 测试注入）

## 7. API（最小 2 端点）

| 端点 | 响应 |
|---|---|
| `GET /api/v1/styles/:id` | StyleDetail（基础信息 + 关联商品）；不存在 404 |
| `GET /api/v1/styles/:id/products` | products 列表 + page.totalHint |

未新增 `GET /products/:id/style`（detail 已内嵌 styleId，前端按需调 /styles/:id，无重复 API）。

## 8. Product Detail

- ProductDetailModel.styleId（product-service 映射后端 styleId）
- detail.uvue「同款式」模块：**仅当 styleId 非空且款式有商品时显示**（`v-if="sameStyle !== null && sameStyle.products.length > 0"`），展示款式名/品牌 + 横向滚动同款商品卡（封面/标题/价格），点击跳转对应商品详情
- 无 style_id 商品：模块整体不渲染，无空状态占位；fetchStyle 失败静默（不阻塞详情）

## 9. 数据归并策略

`scripts/style-merge-dry-run.ts`：
- **默认 dry-run 只统计**（绝对不自动覆盖）：brand_id + canonical_name 聚类 → 多商品簇/单商品簇统计 + 候选导出（--json）
- 显式审核绑定：`--apply-file <json>`（人工审核后的子集）→ upsert style + 回填 products.style_id，幂等
- 归并依据：brand_id + canonical_name（主键），category/sub_category/style_tags 辅助

## 10. 未自动归并的数据（真实 dry-run 结果）

生产库 dry-run 实测：**3363 商品 → 候选簇 3363（多商品簇 0）**—— 当前 canonical_name 全唯一，无同品牌同名重复商品。
- 含义：现数据的款式差异在 canonical_name 层已完全区分（或颜色/版本未合并表达），**自动精确聚类无法合并任何商品**
- 处置：全部保持 style_id = NULL（符合"无法安全判断则保持 NULL"）；真正的款式归并需要模糊归一（去颜色/尺码/批次词）或人工审核，属 Phase 2.2+
- 证据：`node --env-file=.env.production --import tsx scripts/style-merge-dry-run.ts` → 商品总数 3363 / 已绑定 0 / 多商品簇 0

## 11. 测试

`tests/content/style-api.test.ts`（+4，纯内存 MemoryRepository + seedStyle，零生产库触碰）：
1. GET /styles/:id 返回款式基础信息 + 关联商品（黑/原色 2 商品同款式）✅
2. GET /styles/:id 不存在 → 404 ✅
3. GET /styles/:id/products 返回列表 + page.totalHint ✅
4. 无 Style 数据 → getStyle null（未归并语义，UI 不显示模块）✅

## 12. npm run check

[PASS] 全部 check 通过（唯一 WARN 为既有「待运营补充」发布门禁项，非本轮引入）

## 13. check:source

[PASS]

## 14. check:android

[PASS]（12 项，Android gate 未被破坏）

## 15. check:mp-weixin

[OK]；真实编译：**compiled successfully（ready in 39882ms，30 页面）**
产物验证：style-service.js 含 fetchStyle×2；detail.js 含 sameStyle/openSameStyle×31；product-service.js styleId×2

## 16. 后端测试

`npm test` → **18 files / 179 passed / 1 skipped**（fresh，+4 style 测试，无回归）
`npm run build`：exit 2 —— **9 个 pre-existing TS2769（AI import 区域 AiSuggestion，Phase 1.1-C 已确认为历史遗留，行号与错误内容与本轮改动无关）；dist 产物仍正常生成**（含 getStyle）。本阶段未扩大范围修 AI import 类型问题。

## 17. git diff --stat

```
前端（sankengcloset）
  domain/content/index.uts              1 +        （导出 style）
  domain/content/style.uts              新增        （StyleInfo/StyleItem）
  services/content/style-service.uts    新增        （fetchStyle）
  services/content/product-service.uts  45 +-       （styleId）
  pages/product/detail.uvue             150 +-      （同款式模块；含 1.1-A 遗留 diff）

后端（sankengcloset_service）
  migrations/0010_styles.sql            新增        （styles 表 + style_id 列）
  src/types.ts                          67 +        （Style/StyleDetail/Product.styleId）
  src/repositories/contracts.ts         12 +-       （getStyle 签名）
  src/repositories/postgres.ts          280 +-      （mapProduct.styleId + getStyle；含 1.1-C 遗留 diff）
  src/repositories/memory.ts            35 +-       （styles Map + getStyle + seedStyle）
  src/routes/content.ts                 21 +-       （2 个 Style 端点；含 1.1-C 遗留 diff）
  scripts/style-merge-dry-run.ts        新增        （归并候选 + 审核绑定）
  tests/content/style-api.test.ts       新增        （4 测试）
```

## 18. 风险

| 风险 | 等级 | 说明/缓解 |
|---|---|---|
| 生产数据 canonical_name 全唯一，自动归并 0 簇 | 中 | 安全（全部 NULL）；款式归并需模糊归一+审核流，属 Phase 2.2；dry-run 已证明候选/绑定链路可用 |
| build 9 个 pre-existing TS2769（AI import） | 低 | 历史遗留，非本轮引入；npm test 不受影响；dist 正常生成 |
| 同款式模块依赖 fetchStyle 网络 | 低 | 失败静默，不阻塞详情；未归并商品不渲染 |
| styles 表当前 0 行（无归并数据） | 信息 | 符合"不自动覆盖"；MVP 验证的是实体/链路稳定成立，非数据规模 |

## 19. 下一阶段建议

1. **Phase 2.2**：款式归并增强（模糊归一：去颜色/尺码/批次词后聚类 + 置信度阈值）+ 审核流 + 别名词库（aliases）
2. 归并数据到位后：Feed/搜索款式级去重（现有聚合层增量，不动算法）
3. community_posts.product_id（Phase 2.3）
4. **禁止**：Series 实体、AI、Trend 重构、VIP、知识图谱（维持 Phase 2 审计结论）

---

## 验收对照（用户第八节 12 项）

1. migration 成功 ✅（生产库真实应用 0010）
2. 旧 Product 数据不损坏 ✅（3363 条不变，style_id 全 NULL 兼容）
3. style_id 可以 NULL ✅（schema nullable=YES + mapProduct null 处理）
4. Product 可以绑定 Style ✅（apply-file 链路 + 测试验证）
5. 一个 Style 关联多个 Product ✅（测试：原色+绀色 2 商品同款式）
6. Product Detail 获取 Style ✅（ProductDetailModel.styleId + fetchStyle）
7. Style 获取 Products ✅（GET /styles/:id/products + totalHint）
8. 无 Style 商品不影响详情页 ✅（模块 v-if 不渲染，无空状态）
9. Release 数据不受影响 ✅（product_releases 表/API 零改动）
10. Feed 不受影响 ✅（listFeed 零改动，mapProduct 增量字段）
11. Favorite 不受影响 ✅（wishlist 链路零改动）
12. Reminder 不受影响 ✅（reminder 链路零改动）

**最终结论：PASS**

报告：docs/reports/Phase2.1-Style-Entity-Implementation-Report-20260819.md

停止。不进入 Phase 2.2，等待产品指令。
