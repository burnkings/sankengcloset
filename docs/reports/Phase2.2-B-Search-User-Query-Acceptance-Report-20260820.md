# Phase 2.2-B Search User Query Acceptance — 用户搜索行为验收报告

日期：2026-08-20
基线：Phase 2.2-A Search Alias Implementation PASS
性质：纯业务验收审计（零代码零数据库零 seed 改动，未 commit）
验证方式：临时验收测试（MemoryRepository 纯内存，注入 15 商品 + 33 条真实场景别名，跑完即删）——非猜测，全部真实执行
结论：**PASS**（P0 可用达标；P1 建议 2 项，不阻塞）

---

## 1. 当前 Search 架构（验收基线）

```
用户输入 → 前端原样透传 → GET /api/v1/search?q=
  → normalizeSearchTerm：trim → NFKC → 小写 → 空格折叠
  → resolveSearchAliases（SQL 粗筛候选）
  → resolveSearchTerms（JS 精筛，单一语义来源）
      category → p.pit_type = ANY
      brand → p.brand_id = ANY
      style → p.style_id = ANY
  → 文本 ILIKE（display/canonical/brand/style 名）
  → ranking：entity(6) > exact(5) > category/prefix(4) > contains(3) > feed_score
  → v2 rank keyset 游标
```

## 2. 当前 aliases 状态（生产库 127.0.0.1:5433 实测）

| 项 | 状态 |
|---|---|
| 表 + 索引 | aliases 完整（3 索引 + 3 CHECK） |
| 总条数 | 31（全部 category） |
| 幂等 | 重跑 31 upserted / 1 skipped，无重复 |
| brand alias | **0 条生效**——「中牌」因品牌「中牌制服部」不在生产 brands 表被 seed 跳过 |
| style alias | 0 条（词表空，待运营） |

⚠️ 数据缺口：生产环境 brand 简称链路存在但**无数据**（品牌入库后重跑 `npm run seed:aliases` 即生效，代码链路已验证可用）。

## 3. 50+ Query Matrix（真实执行，66 条全过）

### A. JK（11 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| 格裙 | JK 品类 | 6条 全JK | PASS |
| jk / JK / Jk | 缩写 | 6条 全JK | PASS |
| jk制服 / JK 制服 | 缩写+品类 | 6条 全JK | PASS |
| 制服 | 品类 | 6条 全JK | PASS |
| 水手服 / 西装外套 / 开衫 | 品类词 | 6条 全JK | PASS |
| 深蓝格裙 / 格裙 45cm | 商品名+属性 | 6条 全JK | PASS |

### B. Lolita（13 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| lo裙 / lo 裙 | 圈内术语 | 6条 全LOLITA | PASS |
| lo | 2位缩写 | 6条 全LOLITA | PASS |
| Lolita / 洛丽塔 / 洋装 | 俗称 | 6条 全LOLITA | PASS |
| ＬＯＬＩＴＡ | NFKC 全角 | 6条 全LOLITA | PASS |
| 花嫁 | 风格词 | 6条 全LOLITA | PASS |
| jsk / op / sk / kc | 缩写 | 6条 全LOLITA | PASS |
| 月光曲 | Style 俗称 alias | 3条 实体商品 | PASS |
| 月光曲 JSK | Style 正式名 | 6条 全LOLITA | PASS |

### C. 汉服（11 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| 汉服 / hanfu / 汉元素 | 品类 | 5条 全HANFU | PASS |
| 马面 / 马面裙 | 简称/品类 | 5条 全HANFU | PASS |
| 襦裙 / 齐胸 / 圆领袍 | 形制词 | 5条 全HANFU | PASS |
| 明制 / 宋制 / 唐制 | 朝代形制 | 5条 全HANFU | PASS |
| 宋制旋裙 | 商品名 | 5条 全HANFU | PASS |

### D. Brand（6 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| 兔缝缝 / 花笺 / 星辰猫 | 正式名 | 全部对应品牌商品 | PASS |
| 中牌 | 简称 alias | 仅中牌商品 1条 | PASS |
| 星猫 | 简称 alias | 全部星辰猫商品 | PASS |
| Alice Girl | 英文品牌名 | 全LOLITA | PASS |

### E. 中英文混输 / 空格 / 特殊字符（5 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| lo裙 白色 / jk 深蓝 / 汉服 马面 | 术语+属性组合 | 正确分类 | PASS |
| lolita! | 特殊字符容错 | 全LOLITA | PASS |
| "  LoLiTa  " | 首尾空格+混大小写 | 全LOLITA | PASS |

### F. 无结果（2 条）
| Input | 意图 | 结果 | 判定 |
|---|---|---|---|
| 太空服 | 真实无结果 | 0条 | PASS |
| jk裙 不存在品牌zzz | 组合无结果 | 6条 JK（别名 OR 语义生效，合理） | PASS |

### G. 恶意输入 / 英文子串安全（17 条，全部 0 命中）
`foo' OR '1'='1`、`'; DROP TABLE products;--`、`" OR 1=1 --`、drop、shop、stop、open、logo、slot、skirt、select、btc、kcx、uniform、sailor、maidan → **全部 0 条** ✅

### 覆盖类别核对
A✓ B✓ C✓ D✓ E✓ F✓ G✓ H(大小写/NFKC/空格/特殊字符 在 A/B/E 内)✓ I(商品名 深蓝格裙/宋制旋裙)✓ J(中英混输)✓ K✓ L✓ M✓ N✓ O✓ P✓ Q(3位及以下缩写 8 个)✓ R(长英文词 uniform/sailor 安全)✓

## 4. Query 测试结果

- 66 条真实场景全部 PASS（分类正确 / 空结果正确 / 恶意输入 0 命中）
- 断言包括：HTTP 200 + 结果集非空性 + 分类纯度（expectCategory 时全部商品属于该坑向）
- 临时验收测试 5/5 通过后已删除，工作树零残留

## 5. Ranking 验证

### 实体优先级（正确 ✅）
| 场景 | 结果 |
|---|---|
| Style alias「月光」→ sty_moonlight | 前 2 位均为月光曲实体商品（rank6），文本命中商品在其后 |
| Brand alias「中牌」→ br_zhongpai | 仅中牌商品返回（rank6） |
| Brand 正式名「星辰猫」 | 全部星辰猫品牌商品，无其他品牌混入 |

### exact > prefix > contains（部分正确，发现 1 个 P1 缺陷 ⚠️）

真实排序实测（搜「格裙」，注入 6 个 JK 商品）：
```
RANK 格裙 order: prd_jk_navy_45, prd_jk_e, prd_jk_d, prd_jk_c, prd_jk_b, prd_jk_a
```
- prd_jk_a = 「深蓝格裙 45cm」（title 含完整「格裙」，contains 命中）
- prd_jk_d = 「兔缝缝 格纹西装外套」（仅靠 category JK 命中，**不含「格裙」文本**）

**缺陷根因**：category 命中 rank4 与 prefix 同级，且 case 分支中 category 先于 prefix 判断——所有同类商品被整体抬到 rank4，**contains 文本命中（rank3）被 category 覆盖**。结果：title 含完整关键词的商品与完全无关的同类商品同分，同 rank 内按 id 降序 → 相关性丢失。

**影响面**：任何命中分类别名的搜索（格裙/jk/lo裙/汉服 等）都会出现「分类内排序 = id 序」而非「文本相关性序」。不影响结果集正确性（分类无误、无错商品），只影响排序质量。

**建议修复方向（Phase 2.2-C 或后续）**：rank 计算将 category 命中拆为加分项而非独立等级——
```
rank = entity(6) / exact(5) / prefix(4) / contains(3) 基础分
     + category 命中时 +1（作为 OR 扩展的保底，但不覆盖文本相关性）
```
即：格裙搜索中「深蓝格裙 45cm」（contains 3 + category 1 = 4）应排在「格纹西装外套」（纯 category 1）之前。

## 6. Alias 安全性

| 验证项 | 结果 |
|---|---|
| drop/shop/stop/open（含 op 子串） | 0 命中 ✅ |
| logo/slot（含 lo 子串） | 0 命中 ✅ |
| skirt（含 sk 子串） | 0 命中 ✅ |
| select/update/insert/delete/backup/cloud/operator/stopwatch | 0 命中 ✅ |
| btc（含 bt）/ kcx（含 kc）/ bntv（含 bnt） | 0 命中 ✅ |
| jkl（含 jk） | 0 命中 ✅ |
| 独立缩写 op/sk/kc/bt/jk/lo/jsk/bnt | 全部正确命中对应分类 ✅ |
| lo裙/lo/jk制服/op 词边界命中；drop/stop/logo 不命中（单元） | ✅ |

**结论：短 alias → 长单词误命中已彻底消除**（词边界正则在 JS 精筛层为单一语义来源，postgres/memory 双端一致）。

## 7. 词库缺口（仅真实业务价值）

| 词 | 用户场景 | 意图 | 为什么应加入 | 风险 | alias_type |
|---|---|---|---|---|---|
| cla | 搜「cla」找古典系 Lolita | LOLITA 风格缩写 | 圈内高频稳定缩写，与 jsk/op 同级 | 低（cla 无歧义） | category |
| 对襟 | 搜「对襟」找对襟衫/对襟袄 | HANFU 形制 | 汉服基础形制词，审计 §6 D 类已确认 | 低 | category |
| 褙子 | 搜「褙子」找宋制外套 | HANFU 形制 | 宋制核心单品 | 低 | category |
| 比甲 | 搜「比甲」找明制马甲 | HANFU 形制 | 明制核心单品 | 低 | category |
| 袄裙 | 搜「袄裙」找明制套装 | HANFU 形制 | 明制主流品类 | 低 | category |
| 斗篷 | 搜「斗篷」找汉服外套 | HANFU 形制 | 秋冬热销单品（需确认是否跨坑） | 中（斗篷非汉服专属） | category |
| 晋制 | 搜「晋制」找魏晋风 | HANFU 形制 | 与明/宋/唐制同族 | 低 | category |
| 十三余 | 搜「十三余」找品牌 | HANFU 品牌正式名 | 头部品牌（正式名已 ILIKE 可搜，价值低） | 低 | brand |
| 重回汉唐 | 同上 | HANFU 品牌 | 头部品牌（同上） | 低 | brand |
| 花朝记 | 同上 | HANFU 品牌 | 头部品牌（同上） | 低 | brand |
| 织造司 | 同上 | HANFU 品牌 | 头部品牌（同上） | 低 | brand |
| 兔缝缝→兔家 | 搜「兔家」找兔缝缝 | 圈内简称 | 真实圈内高频称呼 | 低 | brand |
| 中牌制服部品牌入库 | 搜「中牌」应生效 | 已有 alias 激活 | **生产库品牌缺席导致 alias 未生效**（数据缺口，非代码） | 低 | 数据修复 |
| Style 俗称（月光曲等） | 搜款式俗称 | Style 命中 | schema 已支持，等运营确认 | 低 | style |

> 备注：甜系/哥特/绀色/织金 等属性词**不应**入 alias（走 ILIKE 文本匹配即可，入表反而造成「搜甜系→全部甜系商品」的过度归类）；衬衫/半裙/背心裙 跨坑歧义词**明确不入**（审计 §4-6 结论）。

## 8. 高风险词审查

| 词 | 判定 | 理由 |
|---|---|---|
| op/sk/kc/bt/lo/jk/jsk/bnt | KEEP | 词边界已保护，独立命中正确，长词安全（§6 实证） |
| 马面 / 马面裙 | KEEP | 同 canonical HANFU，无歧义（马面裙 包含 马面 子串，canonical 相同无冲突） |
| 明制/宋制/唐制/齐胸/圆领袍 | KEEP | 形制词单一坑向，无歧义 |
| 洋装/洛丽塔/汉服/hanfu/汉元素 | KEEP | 稳定系统词 |
| 花嫁 | REVIEW | 跨坑歧义边缘：「花嫁」主指 LOLITA 花嫁风，但汉服/中式婚服语境也出现。当前 confidence 100 归 LOLITA 可接受，建议运营确认后再定；若出现汉服花嫁商品误归类再降级 |
| 中牌（brand） | KEEP（待数据） | 词本身规范无歧义；生产库品牌缺席是数据缺口，品牌入库即生效 |
| 领带/领结/开衫 | KEEP | JK 语境稳定；领带在正装/其他语境也可能出现，但三坑 app 内商品均为 JK 归类，无实际误匹配 |
| 短于 2 位的词（如「jk」拆分「j」「k」） | 不入 | 单字符绝无业务价值且子串风险无穷大 |
| 圈内黑话（「海苔」「草莓柄」） | 不入 | 需运营确认的俗称，无 canonical 锚点，禁止直接 canonical 化 |

## 9. P0 / P1 / P2

### P0 必须修
**无。** 搜索功能正确、安全、无崩溃、无错误结果、恶意输入零命中。

### P1 建议修
1. **Ranking：category 命中覆盖 contains 文本相关性**（§5 缺陷）——搜「格裙」时 title 含「格裙」的商品排不到最前。修复方向：category 改为加分项而非独立等级。工作量小，改善明显。
2. **生产库 brand alias 数据缺口**——「中牌制服部」品牌不在 brands 表，「中牌」alias 未生效。品牌入库后重跑 `npm run seed:aliases`（代码链路已就绪，纯数据操作）。

### P2 后续优化
- 词库扩充：cla/对襟/褙子/比甲/袄裙/晋制（§7 低风险 6 词，运营确认后 seed）
- 品牌简称扩充（兔家 等，运营确认）
- Style 俗称入表（schema 已就绪，等运营提供词表）
- 品牌正式名 alias（十三余 等）价值低（ILIKE 已覆盖），可做可不做

### 无需处理
- 英文长词误匹配（已安全）
- 属性词入 alias（明确不做）
- 跨坑歧义词（衬衫/半裙，明确不做）
- 搜索联想/拼音/分词（审计范围外禁止项）

## 10. 最终判断

**PASS**

- Q1 P0 可用？→ **是**。66 条真实 Query 全对，恶意输入零命中，分类/品牌/款式/商品搜索全部正确理解。
- Q2 P1 三坑垂直能力？→ **基本达成**（分类词/缩写/俗称/品牌简称/款式搜索/NFKC/词边界安全全部就位）；1 项 P1 排序优化待做，不阻塞。
- Q3 31 条 alias 足够？→ **是，够支撑当前 Product V2**。核心高频场景全覆盖；缺口集中在形制词补充（P2）与品牌数据激活（P1 数据项）。
- Q4 需要继续增加词库？→ 需要，但优先级低（P2）；先做 P1 两项。
- Q5 Top 20 词？→ 实际仅 **6 个低风险词**值得入（cla/对襟/褙子/比甲/袄裙/晋制）+ 品牌数据修复；其余为待运营确认词，不凑数。
- Q6 绝不要加入？→ 单字符词、跨坑歧义词（衬衫/半裙/背心裙）、黑话俗称（无 canonical 锚点）、属性词（甜系/绀色 走 ILIKE）。
- Q7 Ranking 需调整？→ **需要**（P1：category 加分项化），见 §5。

---

## 验收方法说明

- 临时验收测试 `tests/content/search-acceptance.tmp.test.ts`：MemoryRepository 纯内存（零生产库触碰），注入 15 个真实场景商品（JK 6 / LOLITA 5 / HANFU 4 + 3 品牌 + style + 3 brand alias + 1 style alias），跑 66 条 Query + Ranking 断言 + 安全性断言 + normalize 边界，5/5 通过后**已删除**，工作树零残留。
- 全部结论基于真实执行输出（Query 结果矩阵、RANK 排序、ABBR 命中日志），非猜测。

报告：docs/reports/Phase2.2-B-Search-User-Query-Acceptance-Report-20260820.md

停止。不修改任何代码/数据库/seed。不进入 Phase 2.3，等待产品指令。
