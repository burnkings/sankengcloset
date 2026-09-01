# Phase 2.5-C Crawled Product Source Data Architecture Audit

- 日期：2026-08-20
- 阶段：Product V2 Phase 2.5-C（采集源数据架构审计——暂停 Style 治理，从源头重审）
- 执行模式：模式 A（2× MiMo v2.5-pro 子代理执行 + deepseekv4flash 复核检验）
- 性质：只读审计（零代码 / 零数据库 / 零 migration 变更）
- 最终状态：**PASS — 可以进入 Implementation**

---

## 1. Executive Summary

- 审计对象：真实采集 JSON（/home/admin/all_shops_products.json，222 店 / 3247 条）+ 导入链路（import-taobao-products.ts）+ 数据库结构（生产库只读）
- **最大发现：Raw 层是空壳**——raw_data 表存在（migration 0002）但生产库 0 行，source_records.raw_data_id 全部 NULL（0/3390）
- **5 个根本问题**：无 Raw 层 / 标题零清洗 / 价格无语义（定金当售价）/ 单图限制 / 无 Release 层
- 已复核证据：current_price="1" 46 条（39 条标题含意向金）、"9999" 45 条（占位价）、3247 JSON 商品 → 3390 source_records（重复导入追加脏数据）、import 脚本 title 无清洗直接入库
- 结论：**P0 改造集中在 import-taobao-products.ts 单文件，数据库 schema 零变更（raw_data 表与 products 列已存在），可以进入 Implementation**

## 2. 当前采集链路图（现状）

```
采集工具(外部/人工)         导入链路                     生产库
┌──────────────┐   ┌───────────────────────┐   ┌──────────────────────┐
│ 淘宝搜索/详情  │ → │ all_shops_products.json│ → │ import-taobao-        │ → │ products(3363)         │
│ (不落库)      │   │ (3247条, 222店)         │   │ products.ts           │   │ brands(252)            │
└──────────────┘   └───────────────────────┘   │ (无事务/无幂等/无清洗)  │   │ product_images(3363)   │
                                                └───────────────────────┘   │ price_snapshots(3390)   │
                                                                             │ source_records(3390)   │
                                                                             │ raw_data(0) ← 空壳     │
                                                                             │ product_releases(0)    │
                                                                             └──────────────────────┘
```

**关键特征**：
- 采集工具产物只以 JSON 文件形式存在，原始数据从未持久化
- import 脚本是唯一数据入口（v2.5 分支已移除 crawler 管道）
- raw_data 表设计存在但零写入（"已设计但从未使用"）

## 3. Raw / Normalize / Product / Style / Release 目标数据流

```
┌──────────────────────────────────────────────────────────────────────┐
│ L1 Raw（raw_data 表，JSONB 原文，不可变）                              │
│   raw_title / raw_price / raw_purchase_text / raw_sku / raw_images / │
│   raw_url / item_id / fetched_at(采集时间) / source_query(来源词)      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │  import-taobao-products.ts（幂等，事务）
┌──────────────────────────────▼───────────────────────────────────────┐
│ L2 Normalize（清洗/转换/推断）                                         │
│   title: 去营销前缀(定金/尾款/日期/团号/【】) → canonical_name/display │
│   price: 元→分；定金/尾款/全价拆分 → current_price/deposit_price/      │
│          balance_price/original_price                                 │
│   images: 多图数组 + URL 归一化 → products.images[]/product_images    │
│   source_url: 去 tracking 参数(spm/utparam/mi_id) →  canonical URL    │
│   pit_type: 显式字段→正则→categories→OTHER                            │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ L3 业务实体                                                           │
│   Product（item_id 稳定身份）→ Style（款式聚类）→ Release（批次/再贩）  │
│   关系：Product.style_id（已激活 1180/1391）                           │
│         Product → product_releases（待填充，代码已就绪）               │
└──────────────────────────────────────────────────────────────────────┘
```

**分层职责**：Raw 层不可变保真；Normalize 层可重放（Raw 在则清洗规则升级可重跑）；Product 层 identity 稳定（item_id）；Style/Release 层为派生业务实体。

## 4. 字段问题清单（已复核的真实证据）

### 4.1 全字段清单（3247 条统计）

必选 11 字段（100%）：query_shop / shop_name / product_url / item_id / title / current_price / main_image / categories / shop_link / colors / sizes（后两者实际常为空数组）
可选 5 字段：purchase_type / sku_checked / sku_failed / pit_type / 其他

**缺失字段**：images[] / description / sales_count / rating / original_price / deposit_price / balance_price / raw 层全部

### 4.2 标题词分类（真实统计）

| 类别 | 代表词 | 证据 | 归属 |
|---|---|---|---|
| 营销词 | 意向金(75)/定金/尾款/预售/现货/上新/秒杀/清仓 | 167 条含意向金/定金/尾款 | **清洗层剥离** |
| 销售状态 | 再贩/抽选/预约/掉落/待定 | 少量 | normalize 为 sale_status |
| 商品形态 | JSK/OP/SK/格裙/制服/连衣裙/马面/襦裙/套装/小物 | 高频 | **sub_category，不进标题** |
| 品牌 | 品牌名出现在标题 | 高频 | normalize 剥离 |
| Style 候选 | 【】内内容 | 1715 标题 | 款式名（populate-styles L1） |
| Series 候选 | "XX系列" | 32 标题 | 暂不结构化（Phase 2.4 结论） |

### 4.3 价格（严重问题，已复核）

- current_price **100% 字符串**，混入多种语义：意向金(1/5/10/20 元)、定金(0.97/2.01 元)、占位价(9999)、真实售价
- 「意向金1元抵10元」→ current_price="1"（46 条，39 条标题含意向金）
- 9999 = 售罄/占位标记（45 条）
- **结论：current_price 当前不可用于任何价格分析**；deposit_price/balance_price/original_price 全为 0
- 可靠性等级：搜索列表价 中（混入定金）/ 详情页价 未采集 / SKU 价 未采集

### 4.4 SKU（采集未生效，已复核）

| 组合 | 条数 | 占比 | 判定 |
|---|---|---|---|
| 字段不存在 | 3167 | 97.5% | A 无 SKU 采集 |
| checked=F failed=T 无字段 | 60 | 1.8% | B 尝试采集失败 |
| checked=F failed=T 空数组 | 17 | 0.5% | C 进入但解析失败 |
| checked=F failed=F 空数组 | 3 | 0.1% | D 未失败但无数据 |

布尔字段无法表达"部分抓取(E)"。**最小状态模型建议**：`sku_status: none|failed|partial|ok`（替代 sku_checked+sku_failed 双布尔）

### 4.5 图片（单图限制）

- 只有 main_image（580x580 alicdn 缩略图，带 `_580x580q90` 后缀），**0 商品有多图**
- 建议：直接改 `images[]` 数组（MAIN/DETAIL/SKU/COLOR/MODEL 用 URL 前缀或字段注释区分，不做子对象）；缩略图 URL 应保留原图 URL + 缩略图派生

### 4.6 URL（tracking 参数污染）

- product_url 含 spm/xxc/mi_id/skuId/priceTId/utparam/abbucket/ns 等 8 类 tracking 参数
- item_id 与 URL 提取 100% 一致（3247 条可校验）
- 建议：三态保存——raw_url（原样）/ canonical_url（`https://item.taobao.com/item.htm?id={item_id}`）/ item_id（稳定身份）

### 4.7 店铺（干净）

- query_shop = shop_name 100% 一致（0 不一致，已复核）
- shop_link 与店铺关联正常；**未发现 query_shop≠shop_name≠brand 混淆**（但品牌名变体问题存在，见 Phase 2.5-B：甜嗑系 7 变体）

### 4.8 类目（冗余，已复核）

- categories 与 pit_type **值完全相同**（完全冗余）；categories 语义=三坑直接分类（用户 2026-08-19 确认）
- 建议分层：Raw Category（淘宝原始类目，未采集）→ Pit Type（JK/LOLITA/HANFU/OTHER）→ Category/Sub Category（业务细分类，当前空）

## 5. P0 / P1 / P2 分级

| 级别 | 问题 | 现状证据 | 改在哪 |
|---|---|---|---|
| **P0** | raw_data 持久化 | 0 行 / raw_data_id 全 NULL | import 脚本首步写 raw_data |
| **P0** | 标题清洗 | 【意向金】【定金】等直接入库 canonical_name | import normalize 层 |
| **P0** | 价格语义拆分 | current_price 混入定金/意向金/占位价 | import normalize 层 |
| P1 | 多图 images[] | 0 商品多图 | 采集工具 + import |
| P1 | source_records 幂等 | 3247 JSON → 3390 records（重复追加） | import upsert |
| P1 | price_snapshots 去重 | 重复导入追加相同快照 | import upsert |
| P1 | Release 生成 | product_releases 0 行 | 后续数据工程 |
| P1 | canonical_name 冲突 | 同店同名商品（导入时有去重但无冲突策略） | import |
| P2 | URL 归一化 | canonical_url 未存 | import |
| P2 | source_url 列扩展 | 只存原始带参 URL | import |
| P2 | phash 图片去重 | 无 | 后续 |
| P2 | 事务保护 | 逐商品写入无事务 | import 包事务 |

## 6. 最小改造方案（只设计，未实现）

**范围：import-taobao-products.ts 单文件，schema 零变更（raw_data 表、products 价格列已存在）**

1. **P0-1 raw 持久化**：读 JSON 后逐条 `INSERT INTO raw_data (id, source, entity_type, entity_id, raw_payload, fetched_at)`，entity_id=item_id，raw_payload=整条原始 JSON（含 query_shop/source 信息）；source_records.raw_data_id 回填
2. **P0-2 标题清洗**：清洗函数（去【营销词】前缀/去"6.27晚8点定金#"/去团号日期/trim/控制字符）→ canonical_name；display_name 保留轻清洗版；**raw_title 永远留 raw_data**
3. **P0-3 价格拆分**：从标题 + purchase_text 提取定金/尾款/全价 → deposit_price/balance_price/original_price；current_price 仅在确认为全价/现货价时写入，否则置为可识别标记（或用 price object，见 Q7）
4. **P1 幂等**：source_records 按 (platform, external_id) ON CONFLICT DO UPDATE；price_snapshots 同 (product, price, source, date) 去重；整体包事务
5. **Q5 JSON 最小改造**（采集端）：新增 original_price/deposit_price/balance_price/images[]/purchase_text；purchase_type 改枚举 deposit|full|preorder|none；保留 item_id/sku_checked/sku_failed（过渡期），后续换 sku_status

## 7. Q1-Q10 答案（摘要）

| # | 问题 | 答案 |
|---|---|---|
| Q1 | 最大 5 个根本问题 | ①无 Raw 层 ②标题零清洗 ③价格无语义 ④单图 ⑤无 Release 层 |
| Q2 | 必须源头解决 | 多图、SKU、定金/尾款/全价拆分、详情描述、raw 持久化——5 项均无法在 Product/Style 层补救 |
| Q3 | 保留 raw | raw_title/raw_price/raw_purchase_text/raw_sku/raw_images/raw_url/item_id/crawl_timestamp/source_query |
| Q4 | 需要 normalize | title（清洗）、price（元→分+语义拆分）、pit_type、images（归一化）、source_url（去参）、brand、sale_status |
| Q5 | JSON 最小改造 | +original_price/deposit_price/balance_price/images[]/purchase_text；purchase_type 枚举化（详见 §6.5） |
| Q6 | 直接改 images[]？ | **是**。当前 0 多图，数组模型一次到位；MAIN/DETAIL 等用 URL 特征或字段注释，不做子对象 |
| Q7 | 价格升级 price object？ | **是（P0）**。最小版：结构化四字段（current/deposit/balance/original）+ raw_price 留底；完整 price object 可延后 |
| Q8 | 标题清洗放哪层 | **ingestion/normalization 层**（import 脚本）。采集层保真不修改，清洗规则可升级重放 |
| Q9 | 数据流 | Raw(不可变) → Normalize(可重放) → Product(item_id 身份) → Style(款式聚类) → Release(批次) |
| Q10 | 下一步最小改动 | import-taobao-products.ts 加 raw 持久化 + 标题清洗 + 价格拆分 + 幂等 + 事务（P0 三项） |

## 8. 是否可以进入 Implementation

**可以（PASS）**。依据：
1. P0 改动集中在 import-taobao-products.ts 单文件（+ 采集端 JSON 格式约定同步更新 DATA-FILE-FORMAT-SPEC.md）
2. 数据库 schema 零变更——raw_data 表（0002 已建）、products 价格列（deposit_price/balance_price/original_price 已存在）
3. 现有数据可保留：raw 层只对**新导入**生效；存量 3363 商品的标题/价格问题通过重跑导入（Raw 建立后）或增量治理解决，不需回滚
4. 风险可控：改动不触碰 Product/Style/Release 现有数据与 API

**实施建议（Phase 2.5-C Implementation 任务书要点）**：
- P0 三项（raw 持久化/标题清洗/价格拆分）+ P1 幂等/事务 一起做
- 采集端 JSON 新格式（§6.5）与 DATA-FILE-FORMAT-SPEC.md 同步更新
- 完成后用新旧 JSON 各导一次验证（幂等 + raw 落库 + 价格字段正确）
- 注意：新导入可能改变现有商品标题（清洗后）→ 需确认 canonical_name 变更对 style 聚类的影响（populate-styles 提取的是【】内容，清洗后【】保留则不受影响）

---

*审计完成。本阶段零代码/零数据库变更。未进入 Implementation（按指令停止，等待产品指令）。*
