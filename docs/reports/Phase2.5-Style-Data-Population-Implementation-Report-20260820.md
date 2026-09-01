# Phase 2.5-A Style Data Population 实施报告

- 日期：2026-08-20
- 阶段：Product V2 Phase 2.5-A — Style Data Population & Entity Activation
- 执行模型：deepseekv4flash
- 结论：**PASS**

---

## 1. 实际修改文件

### 后端（sankengcloset_service）

| 文件 | 变更 |
|---|---|
| `scripts/populate-styles.ts` | **新增**。幂等 Style 填充脚本（dry-run / --apply 双模式） |

**零修改**：后端 src/（无 API 变更）、migrations/（无新迁移，0010 已提供全部结构）、前端全部文件。

### 前端（sankengcloset）
零修改。Phase 2.1 已就绪的链路本阶段直接激活：`product-service.uts`（styleId 映射）→ `pages/product/detail.uvue`（styleId 非空即 fetchStyle 渲染"同款式"）→ `style-service.uts`（GET /styles/:id）。

## 2. 实际数据库修改

生产库 127.0.0.1:5433（sankeng-pg）——变更前已备份 `/tmp/sankeng-pre-2.5a.dump`（2.39MB，custom format）。

| 操作 | 量 |
|---|---|
| styles INSERT / UPSERT | 1180 行（第一次 apply：新插入 1180；第二次：0 插入） |
| products.style_id UPDATE | 1391 行 |
| 迁移 | **无**（0010_styles.sql 已提供 styles 表 + (brand_id, canonical_name) 唯一索引 + products.style_id 外键） |
| 删除 | 无（仅清理了本脚本首次执行产生的 3 行 base64 id 残留，0 商品引用） |

## 3. migration 是否需要

**不需要。** 结构全部由 0010_styles.sql（Phase 2.1）提供：styles 表、`styles_brand_name_unique (brand_id, canonical_name) WHERE deleted_at IS NULL`、`products_style_id_fkey`、`products_style_idx`。

## 4. Style 数据量

- styles 总行数：**1180**（全部 deleted_at is null）
- 商品数分布：单商品 1043 / 2 商品 93 / 3 商品 27 / 4 商品 9 / 5 商品 5 / 6 商品 2 / 8 商品 1
- 多商品簇（"同款式"真实关联）：**137 个**，覆盖 348 商品
- 示例：熊岛JK「草莓咚咚」8 商品、熊岛JK「芋泥啵啵」6、月铃兔「雪月铃」6、未央宫「瓷韵青花」5

## 5. Product Style 覆盖率

| 指标 | 值 |
|---|---|
| 商品总数 | 3363 |
| style_id 非空 | **1391（41.4%）** |
| 未覆盖（保持 NULL） | 1972（58.6%） |
| distinct style_id | 1180（= styles 数，无孤儿） |

覆盖率 41.4% 高于 30% 底线，且全部来自确定性规则，未为凑数放宽。

## 6. 归并规则（v4 FINAL，与原型 /tmp/style_proto4.py 一致）

提取优先级与过滤：

```
L1（最高）: 【款式名】 — 1718 标题命中，过滤后 1345 商品
HASH      : #款式名#   — 37 标题，22 商品
L2        : "XX系列"   — 剥离品牌核心名前缀 + 营销前后缀，24 商品
```

过滤链（命中任一即拒绝创建 Style，商品保持 NULL）：
1. **类型/形态词黑名单**（96 词）：套装/制服/连衣裙/衬衫/半裙/格裙/上衣/下装/小物/马甲/开衫/水手服/斗篷/外套/裤/裙/鞋/袜/包/云肩/T恤/JSK/OP/SK/lo裙 等
2. **营销/状态词黑名单**（80 词）：定金/尾款/意向金/现货/预售/合集/礼盒/掉落/兑换/专拍/秒杀/清仓/已售完/售空/售罄/全款/征集中/拍一发五/断码抢购/39裙长专区 等
3. **品牌名双向碰撞**：提取名 ⊇ 品牌名 或 ⊆ 品牌核心名（去运营后缀）→ 拒绝（防【贰333】【山川】【栀野高】品牌简写）
4. **价格模式** `数字+(元|件|月|日|折|抵|团|期|套|块|万|千)` → 拒绝
5. **纯数字/纯字母数字**、**长度 <2 或 >12**、**含 · . / | 分隔符** → 拒绝
6. 版本号（绮罗2.0/星空2.0/小尾巴1.0/时光之舞3.0）**保留为独立簇**（不与基础版合并）

canonicalize：NFKC 归一 + 去空白。聚类键：`brand_id + canonical_style_name`（同品牌同款式名；跨品牌同名不合并）。

**明确不合并**：颜色变体（2.0小蛋糕 ≠ 小蛋糕）、品牌双店（甜嗑jk原创 vs 甜嗑jk工作室 的「甜心萌兔」分成两簇）、同款式多批次（严格按 brand_id）。

**sub_category**：从标题检测 37 种类型词（格裙/水手服/JSK/OP/马面裙/襦裙/大袖衫…），簇内多数派；无命中为空。
**style_tags**：留空（不猜）。
**category**：簇内商品 pit_type 多数派。
**description**：空。

## 7. 未归类数量

1972 商品（58.6%）保持 `style_id = NULL`：
- 无【】/系列标记的裸款式名标题（如 Alice girl「十字姬」裸款式名——品牌词缀剥离规则风险高，宁缺勿错）
- 命中黑名单/品牌碰撞/价格模式被拒的
- 全部按指令"宁可低覆盖率，不能错误合并"处理

## 8. 风险数据（已知，可接受）

| 风险 | 数量 | 说明 |
|---|---|---|
| 簇内 category 与商品 pit_type 不一致 | 5 组 / 11 商品 | style.category 取多数派；同款横跨坑向标签（汉洋折衷等）属正常，不影响正确性 |
| 「F马戏团」簇 | 2 商品 | "K.Q.F马戏团系列" 剥离失败残留 F 前缀（K.Q.F 非品牌表条目）；可后续人工改名 |
| 颜色词误作款式名 | 少量（薄荷绿/极光蓝/粉色甜心 等） | 未建颜色词黑名单（防误伤真款式名）；若后续暴露可人工处理 |
| 品牌双店同名款式未合并 | 1 组 | 甜嗑「甜心萌兔」两店两簇（严格 brand_id 聚类，符合保守原则） |
| 单商品簇占 88% | 1043/1180 | 实体化正确但"同款式"模块仅在 137 个多商品簇生效 |

## 9. 幂等性验证

```
第一次 --apply: 新插入 1180 / 回填 1391 行变更
第二次 --apply: 新插入 0 / 更新 1180（无值变化）/ 回填 0 行变更
```

- style id 稳定：`sty_${sha256(brandId:canonicalName).hex.slice(0,16)}`（首次用 base64 截断发生前缀碰撞——3 行残留已清理，改用 sha256 后 1180/1180 唯一）
- 无 DELETE 全表重建；upsert 走 ON CONFLICT (brand_id, canonical_name) WHERE deleted_at IS NULL DO UPDATE

## 10. API 验证

复用 Phase 2.1 端点，**无新 API**：
- `GET /api/v1/styles/:id`（StyleDetail：基础信息 + 关联商品 + productCount）
- `GET /api/v1/styles/:id/products`（同款商品列表）

契约覆盖：`tests/content/style-api.test.ts`（MemoryRepository + seedStyle，4 tests，npm test 全过）。生产 API 未 curl（遵守生产库保护纪律），数据层验证见 §11。

## 11. Product Detail 验证

链路闭环（全部代码实证 + 编译产物验证）：

```
products.style_id (1391 非空)
  → getProduct SQL (SELECT p.* 含 style_id) → mapProduct → styleId
  → 前端 product-service.uts:103 result.styleId
  → detail.uvue: styleId !== '' 时 fetchStyle(styleId)
  → GET /styles/:id → StyleDetail.products（同款式商品）
  → "同款式" SectionHeader + 横向滚动同款商品
```

- Style 为空（1972 商品）：`sameStyle = null`，整个模块**不渲染**（无"暂无数据/mock/假推荐"）
- 编译产物验证：`style-service.js` 存在、`product/detail.js` 含 fetchStyle、`product-service.js` 含 styleId
- 真实 mp-weixin 编译：`pages/product/detail` 编译通过（ready in 42607ms）

## 12. npm test

```
Test Files  20 passed | 1 skipped (21)
Tests       209 passed | 1 skipped (210)   （29.72s）
```

（1 skipped = postgres.integration.test.ts，TEST_DATABASE_URL 未配置自动跳过，符合生产库保护纪律）

## 13-16. 前端门禁

| 门禁 | 结果 |
|---|---|
| `npm run check` | ✅ PASS（含编译产物 require 校验） |
| `npm run check:source` | ✅ PASS（V3 source gates + audit regression gates） |
| `npm run check:android` | ✅ PASS（6 项） |
| `npm run check:mp-weixin` | ✅ PASS（产物 require 路径校验） |

## 17. 真实编译结果

```
/opt/hbuilderx/HBuilderX/cli launch mp-weixin --compile true --project /home/admin/projects/sankengcloset
→ Project sankengcloset compiled successfully
→ ready in 42607ms（HBuilderX 5.23，30 页面全编译：home/discover/community/product/detail/brand 等）
```

## 18. Phase 2.3 遗留验证状态

| 项 | 状态 |
|---|---|
| 前端门禁（check 系列） | ✅ 本阶段一并跑通（工作区含 Phase 2.3 未提交代码） |
| 真实 mp-weixin 编译 | ✅ 30 页面含 pages/community/index、pages/community/mine 编译通过 |
| 后端测试 | ✅ community-product.test.ts 全过（209 总数含） |
| Implementation Report | ⏳ 未生成（按指令"不要重新实现 Phase 2.3"，仅验证；报告留待产品指令） |
| 覆盖/撤销 | 无（Phase 2.3 修改全部保留） |

## 19. 结论：PASS

### 交付物清单
1. `scripts/populate-styles.ts` — 幂等填充脚本（dry-run/--apply，可重复执行）
2. styles 表：1180 行真实数据（0 孤儿、0 重复）
3. products.style_id：1391/3363（41.4%），1972 保持 NULL
4. 数据链路 Brand → Style → Product → ProductRelease 中 Style 层已激活（ProductRelease 仍 0 行，属数据侧现状，非本阶段范围）
5. 零 migration、零 API 变更、零前端代码变更

### 后续 Gap（不属本阶段范围，记录）
- Search 尚未 join styles 做款式搜索（Phase 2.2 alias 架构可直接扩展：styles 数据已就绪，待 Phase 2.5-B）
- Community/Discovery/Trend 复用 Style 待后续阶段
- 裸款式名（Alice girl 十字姬类，~1600 标题）未提取——需要品牌词缀剥离表或人工审核，宁缺勿错
- 单商品簇占 88%，"同款式"模块主要在 137 个多商品簇生效

---

*Phase 2.5-A 完成，停止。未进入 Phase 2.5-B/C/D、Phase 2.6、Phase 3。*
