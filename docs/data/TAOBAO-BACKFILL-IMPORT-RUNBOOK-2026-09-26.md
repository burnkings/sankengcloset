# 淘宝补全数据导入 Runbook（2026-09-26）

> 目的：把 `scripts/taobao-backfill/out-collected/` 的补丁导入生产库（PostgreSQL 17，`127.0.0.1:5433`，库名 `sankeng`）。
> 本文件可直接交给云服务器上的模型/运维执行，**不需要它写任何 SQL**。
>
> **只想跑一条命令 → 直接看 [§9 完整 JSON 覆盖导入](#9-完整-json-覆盖导入推荐路径-本地备好上传后一条命令)**：
> `out-collected/import-full.sql` 把**重建后的完整商品表**（220 店 / 3010 条，含新增 MIXED 大类）
> 内嵌在一个文件里，一条 `psql` 跑完，跑前自动建快照，配 `rollback-full.sql` 可回退。
> 数据文件是桌面 `all_shops_products.updated.json`；想先本地人工过目就看 `full-preview.csv`。
> 第 1～7 节是「多份 SQL 分开跑」的老路径与排障记录，仍有参考价值。

---

## 0. 最重要的事实

**这两份补丁至今一条都没执行过。**

2026-09-25 线上取证（`GET https://api.sankengcloset.icu/api/v1/products/prd_taobao_<itemId>`）：

- `images` 仍是店铺种子的单张 `g-search1.alicdn.com/..._580x580q90.jpg`，与我们抓到的 `img.alicdn.com/imgextra/...` 不是同一批 URL；
- `currentRelease` 恒为 `null`。

⇒ App「只显示一张图 / 没有发售信息」的真因不是前端 bug，是补丁从未入库。**前端不需要改。**

---

## 1. 待导入文件

原始产出（**下面的「修复版」才是要跑的**）：

| 文件 | 大小 | 内容 |
|---|---|---|
| `images.sql` | 3.1 MB | 1844 条 `UPDATE products` 覆盖 `images` |
| `patch-collected.sql` | 1.8 MB | 1844 条 `UPDATE products`（只补空值）+ 639 条 `INSERT INTO product_releases` |

生成自 `parse-v3.py raw-v4 out-collected`，解析目录 1845 个。

### ⭐ 现在要跑的只有一份：`import-full.sql`（见 §9）

| 文件 | 大小 | 说明 | 状态 |
|---|---|---|---|
| `import-full.sql` | 4.97 MB | 重建后的完整商品表（220 店 / 3010 条）内嵌，一条命令覆盖率导入（商品字段 + 690 批次 + 分类/隐藏 + 标题清洗 + 品牌封面剥离） | **待执行 —— 用它就行** |
| `rollback-full.sql` | 1.5 KB | 独立回滚，依赖导入时建的 `_bak_*` 快照 | 备用 |
| `..\..\..\Desktop\all_shops_products.updated.json` | 5.53 MB | 单一数据文件（`import-full.sql` 里内嵌的就是它） | 数据存档 |
| `full-preview.csv` | 512 KB | 本地过目：3010 行，逐条列出补了哪些字段、最终品类 | 人工核对 |

**下面这四份是旧路径（`images.fix.sql` 已执行过，其余被 `import-full.sql` 取代）：**

| 文件 | 大小 | 说明 | 状态 |
|---|---|---|---|
| `images.fix.sql` | 3.30 MB | 1844 条 UPDATE 覆盖 `images`；仅 WHERE 大小写不敏感 | ✅ **已提交，1844 条 `UPDATE 1`** |
| `patch-fields.fix.sql` | 1.32 MB | 1844 条「只补空值」UPDATE，**独立事务** | 已被 §9 取代 |
| `release-insert.fix.sql` | 178 KB | 639 条 `product_releases` INSERT，**已补 `id` 列**，**独立事务** | 已被 §9 取代 |
| `cloud-sync-2026-09-26.sql` | 21 KB | 本地删改 → 云库同步（隐藏 237 + OTHER 归位 18） | 已被 §9 取代（且不含 MIXED） |

辅助：`_preflight-match-rate.sql`（只读预检）、`out-fixed/`（修好 `parse-v3.py` 后重新 parse 的原始产物）。

> **`patch-collected.fix.sql` 已废弃**（03:08 那份）。两个必死问题：
> ① 639 条 INSERT 漏写 `id` 列 → `null value in column "id" of relation "product_releases" violates not-null constraint`；
> ② 1844 条 UPDATE 与 639 条 INSERT 挤在同一事务 → INSERT 一炸把 UPDATE 全部回滚（白跑一遍）。
> 现已拆成两份独立事务，且**根因已在生成器 `parse-v3.py` 里修掉**（详见第 4.6 节）。

> `out-fixed/images.sql` 与 `out-collected/images.fix.sql` 的 **1844 条 UPDATE 逐行完全一致**，
> 唯一差别是行尾（CRLF vs LF），psql 两种都能吃。

### ⚠️ images 与 patch 两份都要传、都要跑，缺一不可

两份文件的字段**完全不重叠**，各管一半：

| 文件 | 唯一负责的字段 | 对方是否碰 |
|---|---|---|
| `images.sql` | `products.images` | 否（patch 里 `SET images` 出现 0 次） |
| `patch-collected.sql` | `products.sub_category` / `material_tags` / `color_tags` / `variants` / `price_type` / `price_cents` / `description`，以及 `product_releases` 的 639 条 INSERT | 否（images.sql 只写 `images`） |

只跑一个的后果：

- **只跑 `images.sql`** → 详情页有 7 张图了，但**没有「发售信息」卡**，分类/材质/颜色/变体仍是空；
- **只跑 `patch-collected.sql`** → 有「发售信息」卡了，但**主图还是那张单图**。

**不需要传的文件**：
- `variants.sql`（7.2 KB，仅 11 条 UPDATE）—— 9-23 的早期版本，其内容已被 `patch-collected.sql` 的 1644 条 `variants = CASE` 完全覆盖，传了反而会被旧数据抢先写入。
- `patch-collected.json`（5.9 MB）—— 与 SQL 同源的 JSON，仅供核对，导库用不上。

---

## 2. 幂等性：为什么可以放心重复跑

两份补丁都写成**只补不缩 / 只补空值**，重复执行第二次是 no-op。

| 字段 | 写入条件 | 是否会冲掉人工数据 |
|---|---|---|
| `images` | `images IS NULL OR jsonb_array_length(images) < N`（N = 本次抓到张数） | 不会。人工整理过、张数更多的图集原样保留 |
| `sub_category` / `description` | `btrim(col) = ''` | 不会 |
| `material_tags` / `color_tags` | `= '{}'` | 不会 |
| `variants` | `= '[]'::jsonb` | 不会 |
| `price_type` | `= 'UNKNOWN'` | 不会 |
| `price_cents` | `IS NULL` | 不会 |
| `product_releases` INSERT | `NOT EXISTS (… release_no = 1)` | 不会重复插；已有批次的行不动 |

匹配键统一为 `external_id = '<itemId>' AND source_platform IN ('TAOBAO','TMALL')`。

发售批次枚举已校验合格（合法枚举只有 `first_release / rerelease / reservation / spot / lottery / unknown`）：

```
416  reservation  / PRE_ORDER
177  spot         / ON_SALE
 36  first_release/ PRE_ORDER
  6  first_release/ ON_SALE
  3  first_release/ SOLD_OUT
  1  rerelease    / PRE_ORDER
```

`visibility_status` 639 条全部 `published`，`draft` 0 条，非法枚举 0 条。

---

## 3. 执行命令

### 3.1 先备份（必做）

```bash
# 方式一：pg_dump custom format（与历次 Phase 2.x 同口径）
docker exec sankeng-pg_postgres_1 pg_dump -U postgres -F c sankeng \
  > /tmp/sankeng-pre-backfill-$(date +%Y%m%d-%H%M).dump

ls -lh /tmp/sankeng-pre-backfill-*.dump   # 历史同口径约 2.4 MB
```

### 3.2 路径 A：在库所在机器（推荐）

```bash
cd /path/to/out-collected

# 1) 商品图片（只补不缩）
psql "postgresql://postgres@127.0.0.1:5433/sankeng" -v ON_ERROR_STOP=1 -f images.sql

# 2) 商品字段（只补空值）+ 发售批次
psql "postgresql://postgres@127.0.0.1:5433/sankeng" -v ON_ERROR_STOP=1 -f patch-collected.sql
```

没有本机 psql 客户端时走容器 stdin（文件不必进容器）：

```bash
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < images.sql
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < patch-collected.sql
```

> 容器名以实际为准：`docker ps --format '{{.Names}}'`（历史报告里是 `sankeng-pg_postgres_1`）。

### 3.3 路径 B：文件在本机、库在云服务器

```bash
# 传文件
scp scripts/taobao-backfill/out-collected/images.sql \
    scripts/taobao-backfill/out-collected/patch-collected.sql \
    user@server:/tmp/

# 远端执行
ssh user@server 'cd /tmp && \
  docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < images.sql && \
  docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < patch-collected.sql'
```

或本地经 SSH 隧道直连（别把 5433 暴露到公网）：

```bash
ssh -N -L 15433:127.0.0.1:5433 user@server &
psql "postgresql://postgres@127.0.0.1:15433/sankeng" -v ON_ERROR_STOP=1 -f images.sql
psql "postgresql://postgres@127.0.0.1:15433/sankeng" -v ON_ERROR_STOP=1 -f patch-collected.sql
```

### 3.4 路径 C：交给云服务器上的模型执行 —— 直接抄这段指令

```text
任务：把两份现成的 SQL 补丁导入生产 PostgreSQL，不要自己写或改写任何 SQL。

环境：PostgreSQL 17，容器 sankeng-pg_postgres_1，库 sankeng，端口 127.0.0.1:5433。
文件已在 /tmp/images.sql 和 /tmp/patch-collected.sql。

请严格按顺序执行，每步把完整输出贴回来：
1) 备份：
   docker exec sankeng-pg_postgres_1 pg_dump -U postgres -F c sankeng > /tmp/sankeng-pre-backfill-$(date +%Y%m%d-%H%M).dump
   确认 dump 文件存在且大于 1MB，把 ls -lh 结果贴回来。
2) 导入：
   cd /tmp
   docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < images.sql
   docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < patch-collected.sql
   预期各输出 BEGIN / UPDATE 1844 / COMMIT，第二条多 639 行 INSERT 0 639。
   任一报错立即停止，不要重试、不要修复、不要改 SQL，把错误原文贴回来等我决定。
3) 执行第 5 节的验收 SQL，把结果贴回来。

禁止事项：
- 不得自行构造或修改任何 SQL 语句；
- 不得执行不带 WHERE 的 UPDATE / DELETE / TRUNCATE / DROP；
- 不得改动 release_type 取值或 visibility_status；
- 不得用 App 的 AI 导入接口（/api/v1/ai/import-tasks）做批量回填，那条链路是给用户上传照片用的，产出是 suggestion，且低置信度不会覆盖已有数据。

例外：若出现 `UPDATE 0`（WHERE 未匹配），**停下来、贴出结果、不要自行加条件重试**。
处置办法见第 4.5 节（先跑 `_preflight-match-rate.sql` 预检，再按结论换用 `.fix.sql`）。
```

---

## 4. 回滚

因为补丁只补空值、只增不减，正常情况不需要回滚。真要退回：

```bash
# 恢复到独立库再比对（最安全，不动生产库）
docker exec -i sankeng-pg_postgres_1 createdb -U postgres sankeng_rollback
docker exec -i sankeng-pg_postgres_1 pg_restore -U postgres -d sankeng_rollback < /tmp/sankeng-pre-backfill-xxx.dump
```

`pg_restore --clean` 会先删对象，**不要直接对生产库跑**。

---

## 4.5 排障：`UPDATE 0`（WHERE 一条都没匹配上）

**症状**：`images.sql` 无语法错误，但 1844 条全是 `UPDATE 0`。

### 4.5.1 根因（2026-09-26 实测，高置信）

**库里的 `source_platform` 存的是小写 `'taobao'`，补丁写的是大写 `('TAOBAO','TMALL')` → 全部匹配 0 行。**

证据：线上接口对同一批商品原样透传各枚举，大小写并不统一 ——

```json
{"sourcePlatform":"taobao",  "category":"LOLITA",  "saleStatus":"UNKNOWN",
 "priceType":"FULL",  "visibilityStatus":"published"}
```

`category` / `saleStatus` / `priceType` 都还是大写，只有 `sourcePlatform` 是小写。
说明不是接口层统一转小写，而是**库里的值本身就是小写**。

另一条佐证：9-23 的 `scripts/product-enrich/out/patch.sql`（同一个大写 WHERE）**当年导入成功过** ——
线上 `sub_category` / `variants` / `color_tags` / `price_type` / `price_cents`
正是它写的 6 个字段，且都已落库（而它不写的 `material_tags` / `description` / `images` / `product_releases` 全空）。
⇒ 说明 `source_platform` 的大小写在 9-23 之后被改过（库侧重构）。

### 4.5.2 先跑预检，别直接改（零写入）

```bash
# 若 SQL 文件已在服务器 /tmp
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng \
  -v ON_ERROR_STOP=1 < /tmp/_preflight-match-rate.sql
```

期望看到 `extid_only` = `with_platform_lower` = **1844**、`with_platform_upper` = **0**。
最后一段会打印 `products` 各列的真实类型（`images` 必须是 `jsonb`）。

### 4.5.3 应用修复版补丁

**优先用 sed 就地改（不用重传 5 MB）**：

```bash
cd /tmp
sed "s/source_platform IN ('TAOBAO','TMALL')/lower(source_platform::text) IN ('taobao','tmall')/g" \
    images.sql > images.fix.sql
sed "s/source_platform IN ('TAOBAO','TMALL')/lower(source_platform::text) IN ('taobao','tmall')/g" \
    patch-collected.sql > patch-collected.fix.sql

# 自检：新 WHERE 应各出现 1844 / 2483 次，旧 WHERE 应为 0
grep -c "lower(source_platform::text)" images.fix.sql patch-collected.fix.sql
grep -c "source_platform IN ('TAOBAO','TMALL')" images.fix.sql patch-collected.fix.sql
```

也可直接用本机已生成好的修复版：`out-collected/images.fix.sql`、`out-collected/patch-collected.fix.sql`
（与原件的**唯一差异**就是 WHERE 那一处，已 diff 验证）。

```bash
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < images.fix.sql
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < patch-collected.fix.sql
```

期望：`UPDATE 1844` / `UPDATE 1844` + `INSERT 0 639`。

> `lower(x::text)` 对枚举列和 text 列都安全（enum→text 允许隐式转换，text 上是空操作），
> 且大小写两种值都能命中，属于向前兼容写法。

### 4.5.4 排查清单（若预检里 `extid_only` 也是 0）

那说明不是大小写问题，按顺序查：

| 症状 | 含义 | 处置 |
|---|---|---|
| `extid_only = 0` | `external_id` 对不上（可能带 `prd_taobao_` 前缀） | 查 `SELECT id, external_id FROM products LIMIT 5;` 看真实形态 |
| 总行数远小于 3247 | 连到了**另一个库**（dev / 空库 / 只读副本） | `SELECT current_database(), inet_server_port();` 核对是不是 `sankeng`@`5433` |
| `products` 表不存在 | 连错 database 或 schema | 同上 |
| 各枚举都是大写 | 大小写假设不成立 | 回到原版 `images.sql` / `patch-collected.sql` |

---

## 4.6 排障：`null value in column "id" of relation "product_releases"`

**症状**（2026-09-26 03:22 实测）：

```
ERROR:  null value in column "id" of relation "product_releases" violates not-null constraint
DETAIL: Failing row contains (null, prd_taobao_1001299367760, 预约批, 1, reservation, ...)
```

**根因**：`product_releases.id` 是 `TEXT PRIMARY KEY` 且**没有默认值**，而 `parse-v3.py` 生成的 INSERT
没带 `id` 列。附带伤害：因为 UPDATE 与 INSERT 在同一事务里，这一炸把 1844 条 UPDATE 也一起回滚了
（`images.fix.sql` 是独立文件，不受影响，已确认提交成功）。

**修复**（已生成 `release-insert.fix.sql`）：

```sql
-- 原：INSERT INTO product_releases (product_id, release_name, ...)
--     SELECT id, '预约批', 1, ...
-- 改：INSERT INTO product_releases (id, product_id, release_name, ...)
--     SELECT 'rel_taobao_' || external_id || '_1', id, '预约批', 1, ...
```

**为什么用 `'rel_taobao_<itemId>_1'`**：
- 与现有 `products.id = 'prd_taobao_<itemId>'` 命名习惯一致；
- 本批 `release_no` 恒为 1（已核对 639/639），所以 `_1` 后缀天然唯一；
- **确定性**，重跑同一条生成同一个 id，不像 `gen_random_uuid()` 那样每次新值。

**顺带的结构修复**：把 `patch-collected.fix.sql` 拆成
`patch-fields.fix.sql`（1844 UPDATE）与 `release-insert.fix.sql`（639 INSERT）**两个独立事务**。
以后哪一段出错只会回滚那一段，不会再出现「INSERT 炸、UPDATE 白跑」。

**根因已修**：`parse-v3.py` 里加了

```python
WH     = lambda pid: ("WHERE external_id = " + q(pid) +
                      " AND lower(source_platform::text) IN ('taobao','tmall')")   # 大小写不敏感
REL_ID = lambda pid: q('rel_taobao_' + str(pid) + '_1')                             # 补 id
```

并已重跑验证：`parse-v3.py raw-v4 out-fixed` → `images=1844 … releases=639`，与修复前计数一致。
下次 parse 不会再犯这两个错。

**执行**：

```bash
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < patch-fields.fix.sql
# 期望：UPDATE 1844

docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < release-insert.fix.sql
# 期望：INSERT 0 639
```

---

## 4.7 本地改了、云库没同步的数据（2026-09-26 03:20 实测）

**结论：本地全部删改，云库一条都没生效。** 抽了 268 个 id 打线上接口，**全部 200 且 `visibility_status='published'`**：

| 本地动作 | 条数 | 云库实测 |
|---|---|---|
| 剔除配饰专营店（徽楚汉韵原创云肩 + 格格间 原创汉元素） | 85 | **85/85 仍在，published** |
| 删除配饰小物 / 道具演出 / 不发货专用链 | 150 | **150/150 仍在** |
| 删除兑换专拍 | 2 | **2/2 仍在** |
| 重置 punish 假成功 4 条 | 4 | 4/4 仍在（重采后会由补丁覆盖，无需处理） |
| OTHER 归位（LOLITA/JK/HANFU） | 22 | **22/22 的 `category` 仍是 `OTHER`** |
| 童装 / cos 12 条 | 12 | 12/12 仍在（待确认） |

**同步脚本**：`cloud-sync-2026-09-26.sql`（幂等、可重复、可回滚）

| 节 | 内容 | 语句 |
|---|---|---|
| 第 1 节 | 隐藏 237 条（85 + 150 + 2） | 1 条批量 UPDATE：`visibility_status='hidden'` **且** `deleted_at=now()` |
| 第 2 节 | OTHER 归位 18 条（另 4 条已在删除集内，跳过） | 18 条定向 UPDATE：`category` + `pit_type` |
| 第 3 节 | 童装 / cos 12 条 | **`/* */` 注释掉，待确认** |
| 文末 | 回滚语句 | **已注释**（照抄前先确认没被误执行） |

为什么同时写 `hidden` 和 `deleted_at`：不确定后端 feed 的过滤条件是哪一列，两列一起写两种口径都挡得住；
回滚就是把 `visibility_status` 改回 `published`、`deleted_at` 置 `NULL`。

```bash
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < cloud-sync-2026-09-26.sql
```

---

## 5. 验收（导入后必跑）

```sql
-- ① 图片：应看到 7 张左右、首图为 imgextra 原图
SELECT external_id,
       jsonb_array_length(images) AS imgs,
       images->0->>'url'          AS first_img
FROM products
WHERE lower(source_platform::text) IN ('taobao','tmall')
  AND external_id IN ('1001055244899','1001248247402','1001299367760');

-- ② 发售信息：不应再为空
SELECT p.external_id, r.release_name, r.release_type, r.sale_status, r.visibility_status
FROM products p
JOIN product_releases r ON r.product_id = p.id
WHERE p.external_id IN ('999430975965','999452800674','999580070463','999661119980');

-- ③ 覆盖率总览（对比补丁报告：images 1844 / avg 7.8 张 / variants 1644 / releases 639）
SELECT count(*) FILTER (WHERE images IS NOT NULL AND jsonb_array_length(images) > 1) AS multi_img,
       round(avg(jsonb_array_length(images)) FILTER (WHERE images IS NOT NULL), 2)    AS avg_imgs,
       count(*) FILTER (WHERE variants <> '[]'::jsonb)                                AS has_variants,
       count(*) FILTER (WHERE btrim(sub_category) <> '')                              AS has_subcat
FROM products
WHERE lower(source_platform::text) IN ('taobao','tmall');
```

前端侧验收（接口 id 必须带 `prd_taobao_` 前缀）：

```
GET https://api.sankengcloset.icu/api/v1/products/prd_taobao_1001055244899
```

期望：`images` 是 8 张 `img.alicdn.com/imgextra/...`，`currentRelease` 非 null。

---

## 6. 补丁报告基线（本次导入对应的解析产出）

| 字段 | 拿到 | 覆盖率 |
|---|---|---|
| images | 1844 | 99.9%（平均 7.8 张，共 14479 张） |
| variants | 1644 | 89.1% |
| price_type | 1844 | 99.9% |
| price | 1820 | 98.6% |
| sub_category | 1452 | 78.7% |
| sizes | 878 | 47.6% |
| sale_status | 739 | 40.1% |
| product_releases | 639 | 34.6% |
| description | 286 | 15.5% |
| material_tags | 483 | 26.2% |
| color_tags | 314 | 17.0% |

来源：`out-collected/report.md`（生成时间 2026-09-26T02:46:08）。

---

## 7. 别做的事

- **别走 App 的 AI 导入接口**做批量回填。`POST /api/v1/ai/import-tasks` 是「用户上传照片 → 模型识别 → 人工确认」的单品链路，产出是 suggestion，低置信度不覆盖已有数据（`V2.2-AI-IMPORT-CONTRACT.md`）。它不适合补 1844 条商品。
- **别把 5433 直接开到公网**，用 SSH 隧道。
- **别省 `-v ON_ERROR_STOP=1`**，否则出错会继续往下跑。
- **别在事务末位 `COMMIT;` 之后追加语句** —— 历史上 `product_releases` 的 INSERT 就是被放到 COMMIT 之后加 `draft`，整块静默不执行，才导致「发售信息」卡一直不渲染。
- **别用大写 `source_platform = 'TAOBAO'` 匹配**。库里是小写 `'taobao'`，一律写
  `lower(source_platform::text) IN ('taobao','tmall')`。
- **别把 `patch-collected.json` 当导入源**，那是核对用的同源 JSON。
- **别传 `variants.sql`**（9-23 早期版本，只有 11 条，会被旧值抢先写入）。
- **别把不同性质的语句塞进同一个事务**。1844 条 UPDATE 已经跑通，却因为 639 条 INSERT 里少一个 `id`
  被整体回滚 —— 白跑一遍。字段补丁与批次 INSERT 必须各自独立事务。
- **别依赖 `parse-v3.py` 生成的 `product_releases` INSERT 直接可跑**。它漏了 `id` 列。
  改 `parse-v3.py` 或改用 `release-insert.fix.sql`；下次重新 parse 前先确认这一点。

---

## 8. 「三坑混搭」分类 —— 已按 **B 层（一级大类）** 落地

**决策（2026-09-26）**：混搭不是细分类，而是与 JK / Lolita / 汉服**同级的一级大类**，
用来收纳「汉洋折衷」这类跨坑店铺/品牌商品。代码值 **`MIXED`**，展示文案 **`混搭`**。

> 为什么用 `MIXED` 当代码值：App 里 `pages/community/detail.uvue:45`、
> `pages/community/index.uvue:93`、`pages/share/create.uvue:144`、`domain/content/brand.uts:12`、
> `domain/content/outfit.uts:16` **早就写了 `MIXED` / `混搭`**（设计上留过位，只是没实现）。
> 沿用 `MIXED` 才不会出现第二套码。

### 8.1 数据库端

只有一条，且**必须在事务之外单独提交**（PG 不允许在同一事务里「加枚举值并立刻使用」）：

```sql
ALTER TYPE pit_type ADD VALUE IF NOT EXISTS 'MIXED';
```

这条已内嵌在 `import-full.sql` 的**第 0 步**（在 `BEGIN;` 之前），跑那个文件就会带上。
枚举值**加了就不能删**（PostgreSQL 不支持 DROP ENUM VALUE），回滚时它会留下，但不影响任何数据。

### 8.2 App 端改动清单（16 个文件，需重新发版）

| 文件 | 改了什么 |
|---|---|
| `domain/clothing-category.uts` | 新增 `CATEGORY_MIXED = 'MIXED'`；`CATEGORY_LABELS_CLASS.MIXED` / `CATEGORY_LABELS.MIXED` = `'混搭'`；`CATEGORY_EMOJI.MIXED` = `'🎐'`；`ALL_CATEGORIES` 加一项 |
| `theme/tokens/colors.uts` | 新增 `mixedColors`（青玉色 `#5E8C86`，与前三类拉开区分）；`categoryColors.mixed`；`categoryDotColors.MIXED` |
| `presentation/content/feed-presenter.uts` | `getPitTypeLabel` 加 `MIXED → '混搭'`（**所有商品卡共用这一个函数，改这里就全覆盖**）；`getCategoryPlaceholderBg` / `getCategoryAccent` 加 MIXED |
| `utils/category.uts` | 两个方向都加 MIXED 分支；**并修掉 `categoryLabelToCode` 返回 label 的 bug**（见 8.3） |
| `pages/wardrobe/index.uvue` | 品类 chip 的 `value` 改成分类码 + 新增混搭 chip + `catLabel` 加 MIXED；**修掉 chip 筛不出东西的 bug**（见 8.3） |
| `pages/wardrobe/edit.uvue` | 分类选择器加「混搭」（含回显映射） |
| `pages/purchase/edit.uvue` | 同上 |
| `pages/budget/index.uvue` | 分类支出行的 `codes` / `names` 各加一项 |
| `pages/reminder/edit.uvue` | `getWardrobeCat` 加 `MIXED → '混搭'` |
| `pages/share/create.uvue` | `wardrobeCategory` 加 `MIXED → '混搭'` |
| `pages/brand/index.uvue` | 品牌页品类筛选加「混搭」+ 映射到 `MIXED`（原 else 分支恒等于 JK，必须显式判） |
| `pages/ranking/index.uvue` | 榜单品类筛选加「混搭」 |
| `pages/favorites/index.uvue` | 收藏 → 记购买 的分类透传：原三目把非 LO/HAN 一律压成 `JK`，改为保留 `MIXED` / `OTHER` |
| `stores/home-feed-store.uts` | 偏好坑向 → 后端 `categories` 参数：`混搭 → MIXED` |
| `stores/preferences-store.uts` | `toRemotePitType` 加 `混搭 → MIXED`；旧存量迁移加 `MIXED → 混搭` |
| `services/content/feed-service.uts` | 频道/筛选的中文 → 码映射加 `混搭 → MIXED` |
| `services/content/ranking-service.uts` | 榜单返回的分类码 → 展示名，加 `MIXED → '混搭'` |
| `services/mock/mock-catalog.uts` | mock 目录的 `categoryLabel` 加 MIXED（仅为演示数据一致性） |

`pages/community/index.uvue` 与 `pages/community/detail.uvue` **本来就已支持混搭**，无需改动。

已跑过的门禁：`check-source-gates.js` PASS、`check-r0-sync-consistency.js` PASS、
`check-horizontal-scrollbar.js` PASS、`node --test tests/*.test.cjs` **56/56 PASS**。

> ⚠️ `check-v25-android-beta.js` 有 2 项 FAIL（`beta version` / `Vapor enabled`），属**陈旧断言**：
> 脚本里硬编码了 `"versionName" : "2.5.0-beta.2"` 与 `"vapor" : true`（冒号前带空格），
> 而 manifest 实际已是 `2.5.0-beta.4`、写成 `"vapor": true`。与本次改动无关，建议按实际格式放宽该断言。

### 8.3 顺手修掉的两个真 bug

**① `utils/category.uts` 的 `categoryLabelToCode` 返回的是 label 而不是码**

```uts
// 修前（错）：'JK' → 'JK制服'，'Lolita' → 'Lolita'
if (label == 'JK' || label == 'JK制服') return CATEGORY_LABELS_CLASS.JK
// 修后（对）：'JK' → 'JK'，'Lolita' → 'LOLITA'，'汉服' → 'HANFU'，'混搭' → 'MIXED'
if (label == CATEGORY_JK || label == CATEGORY_LABELS_CLASS.JK) return CATEGORY_JK
```

**② 衣橱页品类筛选点任何 chip 都是 0 条**

链路：chip 的 `value` 传的是中文（`'Lolita'` / `'汉服'`）→ `categoryLabelToCode` 又原样返回 label
→ `wardrobe-store` 拿它跟 `item.category`（DB 里的 `'LOLITA'` / `'HANFU'`）比 → 永远不相等。
现在 chip 的 `value` **直接用分类码**，不再经过中文转换。

### 8.4 混搭名单：110 条

判定口径（`scripts/taobao-backfill/_q_mixed_scope.py` 扫描 + 人工核对）：

- **强信号**：「汉洋折衷」「汉洋」**110 条 → 收**（这是最终口径）；
- **中信号**：「中华娘 / 新中式 / 新国风」+ 含 Lo 系词（JSK / OP / 洛丽塔 / Lolita）5 条 → **按用户要求不收**
  （那是新中式 Lo 裙，不是汉洋混搭）；
- **不收**：「汉元素」164 条 —— 汉服改良日常款，归 HANFU 不改。

结果：**110 条，涉 33 家店铺**（强信号口径），其中已采集 34 条。
明细：`out-collected/MIXED-混搭分类名单.csv`（多一列 `use`：收 / 不收，中信号 5 行保留可回溯），
id 清单：`out-collected/_mixed_ids.json`（**只含强信号**）。

> ⚠️ `_q_mixed_scope.py` 已改成只把强信号写进 `_mixed_ids.json`。别再把 CSV 里 `use=不收` 的行写回 MIXED。

### 8.5 「汉洋折衷」是不是整店风格？—— 不是，所以按**商品**改而不是按店铺改

对含汉洋商品的 33 家店铺做全店画像（`_q_mixed_shops.py` → `MIXED-汉洋店铺画像.csv`）：

| 判定 | 店数 | 含义 |
|---|---|---|
| 专营（汉洋 = 全店 100%） | **3** | 十二时原创汉服店 5/5、年禧原创汉服 2/2、叁肆喜原创工作室 1/1 |
| 主营（≥60%） | 6 | 南茶仙笙 6/7、陌如韵 4/5、华夏衣礼 3/4、汉青辞 10/14、南时记 2/3、长风序 8/13 |
| 混营（<60%） | **24** | 其余，占比从 53% 一路降到 2% |

典型反例：`醉时阁原创汉服店` 43 件里只有 1 件是汉洋（2%）、`青衣华裳原创汉服` 31 件里 1 件（3%）、
`映月原创设计` 15 件里 8 件但**全店都是 LOLITA**。

**结论：汉洋折衷是「款式」不是「店铺属性」。** 绝大多数店铺只在少数款上做汉洋，
且这些款大量长在纯汉服店里（HANFU 88 条 / LOLITA 27 条）。
⇒ 只把**商品**改成 `MIXED`，**不动 `brands` 表的店铺分类**。
如果确实想把店铺也标 MIXED，只有上面 3 家「专营」够格，需要另外确认。

---

## 9. 完整 JSON 覆盖导入（推荐路径）—— 本地备好，上传后一条命令

第 1～5 节讲的是「多份 SQL 分开跑」的老路径。**现在只需要这一节。**

### 9.1 数据文件怎么来的

按「桌面那份就是数据源」的口径重建：

```
C:\Users\dddd\Desktop\all_shops_products.json      222 店 / 3247 条（原版，不动）
  − 删除集 237 条                                   → 剩 3010 条
  + 两份采集补充（1845 条：images / 材质 / 颜色 / 款式 / 描述 / 价格 / 发售批次）
  + 分类调整 128 条（110 条 → MIXED、18 条 OTHER 按店铺主类目归位）
= C:\Users\dddd\Desktop\all_shops_products.updated.json   220 店 / 3010 条  ← 唯一真相
```

对账（已核）：桌面 3247 − 删除 237 = **3010**，正好等于 `backlog.json` 的 3010 条；
1845 条采集项**全部**在桌面 JSON 里、且**没有一条**落在删除集内（零误伤）；
222 − 2 = 220 店（`徽楚汉韵原创云肩`、`格格间 原创汉元素` 整店被删空）。

### 9.2 新 JSON 的字段约定

- **原键全部保留不动**：`query_shop` / `shop_name` / `product_url` / `item_id` / `title` /
  `current_price` / `main_image` / `categories` / `shop_link` / `colors` / `sizes` /
  `purchase_type` / `sku_checked` / `sku_failed` / `pit_type`
- **采集补充用库列名平铺**：`images` / `sub_category` / `color_tags` / `material_tags` /
  `variants` / `price_type` / `price_cents` / `description` / `releases`
- `images` 写成**纯 URL 字符串数组**（好读）；导入时由 SQL 转成库里要的对象数组
  `[{url,thumbnailUrl,width,height,sizeBytes,objectKey}]`
- `releases` **不带 id**，导入时按 `rel_taobao_<itemId>_<release_no>` 生成 → 不会重犯「漏 id」那个错
- **字段缺席 = 该项没采到 = 导入时不动该列（不是写 NULL）**
- `pit_type` / `categories` 已就地改成最终值（MIXED 110 / 归位 18）

覆盖情况：`images` 1844 ｜ `variants` 1644 ｜ `price_cents` 1820 ｜ `sub_category` 1452 ｜
`releases` 639 ｜ `material_tags` 483 ｜ `color_tags` 314 ｜ `description` 286。
品类分布：JK 1003 / HANFU 1210 / LOLITA 687 / **MIXED 110** / OTHER 0。

### 9.3 要传的文件与命令

| 文件 | 大小 | 说明 |
|---|---|---|
| `scripts/taobao-backfill/out-collected/import-full.sql` | **4.97 MB** | **上传这个**，JSON 已内嵌，不用再传别的 |
| `out-collected/import-dryrun.sql` | 4.97 MB | **干跑版**：真执行全部语句 + 打验收 SELECT，最后 `ROLLBACK`，库状态零变化 |
| `out-collected/rollback-full.sql` | 1.4 KB | 要回退才需要 |
| `out-collected/full-preview.csv` | 512 KB | 本地过目：3010 行，逐条列出补了哪些字段、最终品类 |
| `out-collected/标题-清洗对照.csv` | 574 KB | 2995 行：`title_old → title_new` 逐条对照 |
| `out-collected/封面-变更明细.csv` | 284 KB | 1200 行：逐条列「剥离 / 提升主图」前后的封面 URL 与张数 |
| `C:\Users\dddd\Desktop\all_shops_products.updated.json` | 5.69 MB | 数据存档 / 你自己编辑用 |

```bash
# ① 先干跑（不改库）→ 读 NOTICE 与 6 项验收数字
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng \
  -v ON_ERROR_STOP=1 < import-dryrun.sql

# ② 数字对得上，再真跑
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng \
  -v ON_ERROR_STOP=1 < import-full.sql
```

> ⚠️ 容器名是 `sankeng-pg_postgres_1`（连字符），此前文档里写成下划线 `sankeng_pg_postgres_1`，那是错的。
> 干跑版**没有任何不可回滚语句**（无 `CREATE INDEX CONCURRENTLY` / 无 `VACUUM` / 无外连），
> 所以「干跑通过 = 真跑必定跑通」。

### 9.4 语义：这份 JSON 就是最终状态

| 步骤 | 做什么 |
|---|---|
| 第 -1 步 | **前置自检**：按固定列清单查列存在性，缺列立刻报列名；并 `RAISE NOTICE` 打印 `products` 完整列清单 |
| 第 -1.5 步 | **类型自检**：校验相关列确为 text / jsonb，不符即报错（含实际类型名） |
| 第 0 步 | **放开 `category` 的 CHECK 约束**：动态找出「所有涉及 `category` 列的 CHECK 约束」→ 打印原定义 → 删除 → 重建含 `MIXED` 的等价约束（幂等）。<br>~~原先的 `ALTER TYPE pit_type ADD VALUE 'MIXED'` 已删除~~（`pit_type` 枚举没有任何列使用，`'MIXED'` 只是 `category` 的文本值） |
| 摊平 | 把 `{店铺: [商品…]}` 摊成一行一商品（3010 行），建临时表 `_items` |
| 安全阀 A | 报「JSON 里但库里找不到对应商品的条数」 |
| 安全阀 B | 报「因不在 JSON 里将要隐藏的条数」（预期 237）；**> 400 条直接中止** |
| 第 0.5 步 | 建快照 `_bak_products_20260926` / `_bak_releases_20260926` |
| 第 1 步 | 商品字段：`SET col = COALESCE(JSON 值, 原值)` —— 有值就覆盖，没写不动 |
| 第 2 步 | 分类：`category` 整列覆盖为 JSON 的 `pit_type` 值（仅当和现值不同）<br>⚠️ **没有 `products.pit_type` 这一列**，别写；`pit_type` 只是个没有列使用的枚举类型名 |
| 第 3 步 | 发售批次：自己的 id `ON CONFLICT DO UPDATE`；别人占着 `release_no` 就跳过 |
| 第 4 步 | **JSON 里没有的淘宝/天猫商品 → 隐藏**（`visibility_status='hidden'` + `deleted_at=now()`）＝ 那 237 条删除 |
| 收尾 | 6 项验收 SELECT |

> **第 4 步是「覆盖」的关键**：删除不是靠一张名单，而是靠「不在数据文件里」。
> 你以后想删商品，直接从 JSON 里去掉那条就行。

**为什么不做「整行覆盖」**：线上接口只暴露部分列（没有 `brand_id` / `shop_id` / `style_tags` /
`season_tags` / `data_status` 等），拿不全的列整行覆盖会把没碰的字段写成 NULL。
所以覆盖范围**精确限定在 JSON 里出现的列**。

### 9.4.1 为什么不是「清空重灌」（常见误解，别这么干）

`products` 表实测 **34 列**（2026-09-26），数据文件只覆盖其中 **10 列**。
`TRUNCATE products` + 重插会让其余列全部回落到建表默认值：

| 类别 | 会丢什么 | 后果 |
|---|---|---|
| 关联 | 品牌 / 店铺关联、风格 / 标签关联 | 变 NULL，关联断掉 |
| 标签 | 除 `color_tags` / `material_tags` / `variants` 外的其余标签列 | 回落 `{}` |
| 统计 | 浏览数、收藏数、推荐分 | 归 `0`，推荐排序崩 |
| 时间 | 入库时间、首发/采集时间、发售相关时间字段、`deleted_at` | 回落 `now()` / NULL，**发售时间全丢** |
| 状态 | `sale_status`（默认 `'UNKNOWN'`）、`visibility_status`（默认 `'draft'`） | 在售/预约/发布状态错乱 |
| 价格 | 除 `price_cents` 外的其余价格列 | 归 `0` |
| 名称 | 规范名 / 展示名 / 来源链接 | 回落默认值 |

**已实测确认的列类型**（本次导入依赖这些）：

| 列 | 类型 | 默认值 |
|---|---|---|
| `products.category` | **text** | — |
| `products.images` | **jsonb** | `[]` |
| `products.variants` | **jsonb** | — |
| `products.price_type` / `sale_status` / `visibility_status` / `source_platform` / `external_id` / `sub_category` | **text** | `price_type`→`'UNKNOWN'`、`sale_status`→`'UNKNOWN'`、`visibility_status`→`'draft'` |
| `product_releases.release_type` / `sale_status` / `visibility_status` | **text** | — |

> 完整 34 列清单在 `import-full.sql` 跑起来时会由第 -1 步的 `RAISE NOTICE` 打出来。

**另有 6 张表通过外键硬引用 `products(id)`**（`TRUNCATE` 会被直接挡下报错）：

```
product_releases   .product_id → products(id)   发售批次
product_images     .product_id → products(id)   图集
product_variants   .product_id → products(id)   规格
price_snapshots    .product_id → products(id)   价格历史
sale_events        .product_id → products(id)   销售事件
product_tags       .product_id → products(id)   标签关联
```

还有两张**用户数据表**用 `product_id` 裸引用商品（无 FK，不会报错但会留悬空引用）：
`wardrobe_items`（衣橱，商品信息存在 `payload_json` 里）、`wishlist_items`（心愿单）。
**硬删商品 → 用户衣橱/心愿单里那些商品变悬空引用。**

**「隐藏」是业务语义，不是技术绕路**：那 237 条的动机是「别在 App 里显示」，不是「销毁数据」。
隐藏 = App 里消失 + 引用兜得住 + 可一键回滚；硬删 = 不可回滚，且万一判错要重新采集。

**⇒ 所谓「替换」= 让库里的可见集合与数据文件一致，包含两半：**
`JSON 里有的 3010 条 → 更新成 JSON 的值（第 1~3 步）` ＋
`JSON 里没有的 237 条 → 从可见集合里出去（第 4 步隐藏）`。
只有前半，替换就不完整 —— 你在 JSON 里删了那 237 条，App 里它们照常显示。

### 9.4.2 ⚠️ `database-schema-export.sql` 是过期快照，别拿它对列名

仓库里的 `database-schema-export.sql` 与实际库**至少两处不符**（已实测）：

| 快照写的 | 线上实际 | 证据 |
|---|---|---|
| `products.images TEXT[]` | **jsonb**（默认 `[]`） | `images.fix.sql` 用 `jsonb_build_object` 跑出 1844 条 `UPDATE 1`，类型不符会直接报错 |
| `product_releases.deposit_price_cents` / `balance_price_cents` | **`deposit_cents` / `balance_cents`** | `scripts/product-enrich/out/patch.sql`（9-23，已成功落库）用的就是这个列名 |
| `products.pit_type pit_type`**和** `category TEXT` 两列并存 | **只有 `category`**（text），无 `pit_type` 列 | 2026-09-26 实测：`products` 共 **34 列**，`pit_type` 枚举（`JK\|LOLITA\|HANFU\|OTHER`）**没有任何列使用** |
| `products` 50 列 | **34 列** | 同上 |

不影响导入：`import-full.sql` 的**第 -1 步**会先查这 26 个目标列是否存在，缺任何一个立刻报列名中止。
但**以后判断表结构不要信这份快照**，需要时重新 `pg_dump --schema-only`。

### 9.4.3 ⚠️ 实测：`products.pit_type` 列不存在（2026-09-26）

第 -1 步自检在云服务器上拦下：

```
ERROR: 前置自检失败，以下列不存在：products.pit_type
CONTEXT: PL/pgSQL function inline_code_block line 25 at RAISE
```

**这个报错同时是好消息**：自检用 `string_agg` 一次性收集**所有**缺失列，报出来的**只有一个**
⇒ 其余 25 个目标列（含 `images`/`category`/`visibility_status`/`deleted_at`/`deposit_cents`/`balance_cents` 等）
**全部存在**。**只需要改 `pit_type` 一处。**

**佐证**：9-23 成功落库的 `scripts/product-enrich/out/patch.sql`（1.55 MB）里 `pit_type` 出现 **0 次**。

**根因**：`pit_type` 照抄了 §9.4.2 那份过期 schema（它同时有 `pit_type pit_type` 和 `category TEXT` 两列），
线上实际只有 `category` 一列。

**已修复（2026-09-26）**：

| 位置 | 改法 | 状态 |
|---|---|---|
| 第 -1 步自检 | 删掉 `('products','pit_type')`，剩 **25 列** | ✅ |
| 第 0 步 | `category` 实测是 **text** ⇒ `ALTER TYPE` **整步删除** | ✅ |
| 第 2 步 | 只留 `category = s.pit_type` | ✅ |
| 第 1 / 3 / 4 步 | 去掉所有 `::price_type` / `::release_type` / `::sale_status` / `::visibility_status` cast（这些列全是 text） | ✅ |
| 第 -1.5 步 | **新增类型自检**，不符即报出实际类型名 | ✅ 新增 |
| `rollback-full.sql` | 同步去掉 `pit_type` 列 | ✅ |

**云服务器实测结果（2026-09-26）**：

- `products` 共 **34 列**；`category` = **text**、`images` = **jsonb**（默认 `[]`）、`variants` = **jsonb**
- `products.pit_type` **不存在**；但**存在**一个叫 `pit_type` 的枚举类型 = `JK | LOLITA | HANFU | OTHER`（无 MIXED），
  **没有任何列使用它** ⇒ 不要为它做 `ALTER TYPE`
- `source_platform` = text，3247 条**全是小写 `taobao`**（再次确认大小写口径）
- `category` 现有分布：`HANFU 1418 ｜ JK 1040 ｜ LOLITA 767 ｜ OTHER 22`
  （导入后 OTHER 应为 22 − 18 归位 = **4**）

### 9.5 幂等与验收

可以**反复执行**，结果一致。唯一副作用是**快照表被刷新**。

| 列 | 期望 |
|---|---|
| `multi_image` | ≈ 1844 |
| `has_variants` | ≈ 1644 |
| `mixed` | **110** |
| `releases_total` | ≈ 3010（2026-09-27 起**每件商品都有一条**发售状态；此前是 690） |
| `soft_deleted` | **237** |
| `alive` | ≈ 3010 |

### 9.6 回滚

```bash
docker exec -i sankeng_pg_postgres_1 psql -U postgres -d sankeng \
  -v ON_ERROR_STOP=1 < rollback-full.sql
```

删掉本次新增的 `product_releases`，商品行从快照整列还原（含分类 / 隐藏状态）。
**前提是 `_bak_*` 快照表还在**；连快照也没了只能靠 `pg_dump`。

### 9.7 已修的坑（别改回去）

1. **内嵌 JSON 的 dollar-quote 定界符**：模板写 `$__TAG$` 却按 `__TAG__` 替换 → 定界符留在 SQL 里，
   psql 直接语法错。现在模板与替换统一为 `$__TAG__$`，且生成后断言：定界符恰好 2 次、
   占位符残留 0、回读内嵌 JSON 与源对象逐字段相等。
2. **回滚语句绝不和导入语句放同一个文件**：早期 `cloud-sync-2026-09-26.sql` 把未注释的回滚 UPDATE
   放在文末，整文件一跑立刻撤销自己。
3. **`product_releases.id` 必须自带**（TEXT PRIMARY KEY 且无默认值）→ 新 JSON 干脆不写 id，
   由 SQL 按 `rel_taobao_<itemId>_<release_no>` 生成。
4. **`products.pit_type` 列不存在**（2026-09-26 首次导入时被自检拦下）：分类只写 `category`（text）；
   同时 `visibility_status` / `price_type` / `sale_status` 都是 **text**，所以给它们赋值**不能加 `::枚举` cast**。
   全脚本已去 cast，并新增第 -1.5 步**类型自检**（不符即报实际类型名）。
   ⚠️ 教训：别再照 `database-schema-export.sql` 写列名。
5. **`_items` 临时表建表少了一列**（2026-09-26 第二次导入失败）：当时 `_items` 只建 3 列
   （`shop_name` / `it` / `external_id`），第 2 步却引用 `pit_type` →
   `ERROR: column "pit_type" does not exist`。事务回滚，但 **Step 1 的 3010 条 UPDATE 白跑一次**。
   现 `_items` 固定 **4 列**（补上 `pit_type`），且所有引用一律带别名前缀（`i.xxx`）。
6. **`products.category` 上有 CHECK 约束**（2026-09-26 第三次导入失败）：约束 `products_category_check`
   只允许 `JK/LOLITA/HANFU/OTHER` ⇒ 写 `'MIXED'` 报
   `ERROR: new row for relation "products" violates check constraint "products_category_check"`。
   `database-schema.md` 与 `database-schema-export.sql` **都没记这条约束**
   （前者只记了 `community_posts.category`，而且那里**已经含 MIXED**）⇒ 两份快照都不可信。
   修法：第 0 步**动态查找**涉及 `category` 列的 CHECK 约束（**不硬编码约束名**）→
   打印原定义留档 → 删除 → 重建含 `MIXED` 的等价约束。可反复执行。

### 9.7.1 上传前的本地机器检查（一条命令，`_build_full.py` 生成时自动跑）

| # | 检查 | 在哪跑 | 拦什么 |
|---|---|---|---|
| 1 | **列自检** 目标列存在性 | SQL 内（第 -1 步） | schema 漂移（列被改名/删除） |
| 2 | **类型自检** text/jsonb | SQL 内（第 -1.5 步） | 列其实是枚举，不能直接赋 text |
| 3 | **静态 lint：列引用** | 本地生成时 | 引用了某表没有的列（**第 5 条就是这么漏的**） |
| 4 | **sqlglot 语法解析** | 本地生成时 | 语法错误；且会**规范化** `CREATE TEMP TABLE` / `DO` 块后再解析，不允许任何语句被静默跳过 |
| 5 | **约束放行** | SQL 内（第 0 步） | `category` 的 CHECK 约束不允许 `'MIXED'`（**第 6 条**） |
| 6 | **约束留档** | SQL 内（第 -1 步） | 把两张表所有 CHECK 约束打印出来，便于发现其它未知约束、便于补文档 |

第 3 条的列清单**不是手写常量，而是从 DDL 反解**：`_items` 建表语句里 `AS <别名>`
有哪几个，就只允许引用哪几个 —— 所以「建表少写一列」这件事本身也会被抓到。

第 4 条解决了「解析器假装通过」的陷阱：sqlglot 遇到不认识的语法会降级成 `Command` 跳过，
必须把 `CREATE TEMP TABLE ... ON COMMIT DROP`、`DO $tag$…$tag$`、`\set` 规范化掉，
**要求 `未解析(Command) = 0`** 才算通过。

单独跑语法复核：`python scripts/taobao-backfill/_lint_sql_parse.py`

> 三道在生成/自检阶段拦，剩下的才可能落到服务器上。**上传前先看生成器最后一行是不是
> 「sqlglot 语法复核通过，可以上传」。**

### 9.8 与第 1～5 节的关系

| 旧路径 | 新路径 |
|---|---|
| `images.fix.sql`（✅ 已提交，1844 条 `UPDATE 1`） | 第 1 步会重跑同口径覆盖，幂等、值相同 |
| `patch-fields.fix.sql` + `release-insert.fix.sql` | 第 1 步 + 第 3 步 |
| `cloud-sync-2026-09-26.sql` | 第 2 步 + 第 4 步（并含 110 条 → MIXED） |
| 无 | 前置自检 + 两道安全阀 + 快照 + 回滚 |
| ~~`merged-patch.json` / `import-merged.sql`~~、~~`db-overwrite.json` / `overwrite-import.sql`~~ | **均已删除**，被 `all_shops_products.updated.json` + `import-full.sql` 取代 |

**结论：只用 `import-full.sql` 一条命令。**

### 9.9 标题清洗 · 品牌封面剥离 · 干跑（2026-09-26 定稿）

这一步在 `_build_full.py` 的 `[4.5]`～`[4.7]` 之间，实现在 `scripts/taobao-backfill/_text_clean.py`
（与 `_build_full.py` 共用，`_title_clean.py` 只是它的命令行壳，输出到 `_preview/`，别覆盖正式产物）。

**A. 标题清洗（2995 条，平均 30.4 → 21.9 字）**

- **删**：店铺品牌名（从店铺名反解，含 ≥3 字截断变体）、重复品类词、纯平台噪音
  （`原创设计 / 正版 / 跳转链接 / 专拍 / 包邮 / 秒杀 / 清仓 / 待命名 / 未命名`）。
- **留（用户口径，别改回去）**：`新款/新品/现货/预售/定金/订金/尾款/补款/全款/意向金/预约`
  是**发售状态**不是引流词；`秋冬/毛绒` 这类季节与特殊性描述也留（常规款不是厚款）。
  `SEASON` 词表**整体置空**。
- **保护**：`【…】`/`《…》`/`~` 前 2~8 字是**系列名**，整体保留（`沐夏`/`青玉`/`墨玉麒麟`/`泡芙心结`）。
- 原值一律存 `title_raw`，随时可回溯比对。

四条铁律（踩过坑才有的）：

| # | 规则 | 不遵守会怎样 |
|---|---|---|
| R1 | 品牌词**截断变体 ≥3 字** | 2 字截断把「莓莓甜品熊」削成「甜品熊」 |
| R2 | 品牌**主体**允许 2 字 | 琴挑 / 葵子 / 久久 这类短品牌删不掉 |
| R3 | 候选词出现在 **>2 家店**标题里 = 行话，剔除 | 「国风」出现 230 次，不拦会把「国风大典」删成「大典」 |
| R4 | `SHOP_STOP` 里**不放单字后缀** | 「社」会把「山川会社」切成「山川会」 |

另两个必须保留的处理（都是实测漏网后补的）：
中英文边界要切分，否则店铺名「LiYou狸柚原创设计」提不出「狸柚」；**但切分前后两种片段都要收**，
否则「YoYo酱」只剩个孤零零的「酱」。孤立 `lo`（= Lolita 缩写）要删，用
`(?<![A-Za-z])lo(?![A-Za-z])` 以免误伤 `lolita`/`lolite`。

⚠️ 占位符安全：`【…】` 保护用的是 `\x00N\x00` 占位符，`~` 系列名保护的正则字符类
**必须排除 `\x00`**，否则会把占位符当系列名吞掉、还原错序后把它吐进标题（曾污染 10 条）。
还原循环也做两轮，防嵌套。

**B. 品牌封面剥离（1151 条商品 / 移除 1377 张图）**

- 前提：**App 的封面 = 库里的 `coverUrl` = `images[0]`**，`main_image` 只是淘宝搜索列表页的实拍图，
  从未被当封面用。`images[]` 是详情页图集，**开头常是店铺品牌插画 / logo**。
- 判据：**店铺级复用** —— 同一张图在本店被 ≥2 个商品用到 ⇒ 它是店铺素材，不是具体商品图。
- 处理：**前缀剥离**，只剥 `images` 开头连续的品牌图，不动后面的商品细节图。
- 兜底：剥离后仍有约 49 条**只在单商品用过**的插画 / 设计稿 ⇒
  `promote_main_image()` 把该商品自己的主图提到首位（图集里有同源原图就提，没有就插入 `main_image`）。
  **替换目标恒为该商品自己的主图 ⇒ 即使误判，结果仍是商品图。**
- 明细留档：`out-collected/封面-变更明细.csv`（1200 行）、`标题-清洗对照.csv`（2995 行）。

> 失败过的图像判据（别再试）：`qerr`（16 色量化平均色差，插画与实拍在 4.5~20.4 完全重叠）、
> `main_image` 复用（全库仅 5 张）、`bg`（被黑底实拍打爆）、关键词统计（176 条状态词商品只有 15 条
> 封面真是文字图）。**任何自动判据都会误伤「白底平铺实拍」**（纯白背景 + 白衣服与线稿统计学上无法区分）。

**C. 发售信息兜底（补 51 条）**

`infer_release()` 从标题读状态词：命中而该商品 `releases` 为空时补一条
（`意向金/定金/订金/尾款/补款/预约/全款/预售` → `reservation` + `PRE_ORDER`；`现货` → `spot` + `ON_SALE`）。
实测 7 个状态词覆盖率全部 100%、0 条缺失。优先级低于采集结果（只在为空时用）。

**D. 干跑（上传前先跑的版本）**

`import-dryrun.sql` = 把 `import-full.sql` 的 `COMMIT;` 换成「先打 6 项验收 SELECT，再 `ROLLBACK;`」。
它**真执行全部语句**（临时表、快照、4 步更新、约束删改），最后整体回滚 ⇒ 库状态零变化。
脚本内无不可回滚语句 ⇒ **干跑通过 = 真跑必定跑通**。

### 9.10 2026-09-27 追加：口径反转 + 标签/说明清洗 + App 修复

用户提了 9 条，数据侧 5 条、App 侧 4 条。

#### A. 发售状态词从标题里**删掉**（口径第 2 次反转）

- 9-26 是「保留」；9-27 用户改口：**标题里的 `现货/现货掉落/定金/意向金/尾款…` 要删** ——
  商品卡与详情页底部已经展示发售状态（`currentRelease`），标题里再写一遍就是重复。
- 实现：`_text_clean.py` 新增 `RELEASE_WORDS`，并入 `clean_title` 的词表。
  复合词（`现货掉落/现货页面/现货专拍/现货直发/现货开售`）排在单词前面，按长度降序替换时先命中。
- **保留** `新款/新品`（上新词，不是状态）与 `秋冬/毛绒`（季节与特殊性描述）。
- ⚠️ 连带修掉一个保护规则的副作用：`~` 系列名保护原来会把 `现货】春彩~…` 的 `现货】春彩`
  整段保护下来，导致「现货」逃过清洗。现在**段内含可删词就不保护**（同时顺带让「白糖少女~」
  这类品牌前缀也能被删掉）。
- ⚠️ `fallback_release` 必须喂**原始标题**：清洗后状态词已没了，喂清洗后的标题会把定金款判成现货。

#### B. 标题不用空格隔开（用户第 6 条）

根因不是「多了空格」，而是**删词时拿空格补洞**：
`可爱毛绒lo鞋蝴蝶结蕾丝边洛丽塔玛丽珍…` 被清成 `可爱毛绒 鞋蝴蝶结蕾丝边 玛丽珍…`。

修法：末尾只保留「拉丁/数字之间」的空格（`OP JSK`、`Alice girl` 留；中文之间、中文与拉丁之间不留）。
结果：含空格标题从 **2460 条降到 23 条**，中文之间的空格 **0 条**。

#### C. 发售状态补全（用户第 1 条：「一般不是定金预约的都是现货」）

原来只有 690 条有 `releases`，其余 2320 条底部状态是空的。现按顺序兜底（采集结果永远优先）：

| 优先 | 判据 | 结果 |
|---|---|---|
| 1 | 标题含 `售完/售罄/已结束/已下架/无补` | `spot` + **SOLD_OUT** |
| 2 | 标题含 `意向金/定金/订金/尾款/补款/预约/全款/预售` | `reservation` + PRE_ORDER |
| 3 | `price_type` ∈ DEPOSIT/INTENTION/BALANCE | `reservation` + PRE_ORDER |
| 4 | 其余 | `spot` + **ON_SALE**（现货） |

覆盖率 **3010/3010**。分布：`spot/ON_SALE 2510 ｜ reservation/PRE_ORDER 443 ｜ first_release/PRE_ORDER 36
｜ spot/SOLD_OUT 11 ｜ first_release/ON_SALE 6 ｜ first_release/SOLD_OUT 3 ｜ rerelease/PRE_ORDER 1`。

⚠️ **连带修了 App 一个显示 bug**：`deriveReleaseStatusText` 原来把 `t === 'spot'` 判在
`sale === 'SOLD_OUT'` **之前** ⇒ `spot + SOLD_OUT` 会显示成「现货」，把卖完的说成有货。
已把「售罄 / 已结束」提到最前。

#### D. 材质/颜色标签去重（用户第 7 条）

`dedup_tags()`：按小写归一保序去重 + 丢掉「是另一个标签真子串」的项。
实测：`['蕾丝','丝','pu','PU']`（「丝」⊂「蕾丝」153 条、`pu`/`PU` 21 条）、`['绒','羊绒']`、
`['聚酯纤维','聚酯纤维100%']`。清洗后 **重复 0 条、子串冗余 0 条**，共 236 条商品受影响。

#### E. 商品说明剔除店铺推广与付款信息（用户第 8 条）

286 条 `description` 里 **284 条根本不是商品说明**，而是抓下来的**店铺推荐位**：
`店铺推荐 | <别的商品标题> | ¥ | 120 | 100+人购买 | …`

`clean_description()`：① 从第一个推广位标记处（`店铺推荐/拼单好物/官方立减/退货宝/店铺活动…`）
**整段截断**；② 去掉 `https://item.taobao.com/...` 这类付款链接；③ 按段丢弃命中
付款/交易词（`付款/定金/尾款/包邮/客服/备注/链接/已售/人购买…`）的段。

结果：**284 条整条剔除、2 条截短**（**第 2 轮口径加严后这 286 条已全部删掉** —— 见 §9.11 A）。
⚠️ **等于说这次采集压根没采到商品说明**，想要「商品说明」这个模块得重新采。

#### F. App 侧 4 条

| # | 问题 | 根因 | 修法 |
|---|---|---|---|
| 3 | 收藏页**一直**显示「部分商品加载失败」 | 404/410 被当成瞬时网络错误 ⇒ 下架商品每次进来都失败，且 `invalidFavoriteIds` 拿不到失效 id，「清除失效」入口永不出现 | `favorite-store.ts` 按状态码分流（404/410→失效可清除，其余→重试一次再提示），提示文案分开 |
| 2 | 「查看商品」左边图标不好看 | 用的是 `shirt` 图标 + **20rpx**（≈10px），24×24 的 2px 描边缩成糊团 | 新增 `static/icons/bag(.svg/-active.svg)` 购物袋线性图标，尺寸 24rpx、文字 22rpx |
| 9 | 一个尺码标签里 M 和 L 上下堆着 | `sizeName` 常是 `"S\nM\nL\nXL"`（366 条）**一条承载多码**，详情页原样当 chip | 新增 `utils/size-option.uts`：拆分隔符 → 去括号与「码」后缀 → 白名单校验 → 去重 → 规范排序 |
| 4 | 排行榜等处补混搭分类 | 源码里排行榜/品牌/社区/预算/衣橱/购买/分享/偏好**都已有混搭**；真机跑的是 9-05 的旧构建 | 补齐剩余枚举（帮助中心、隐私政策文案、搜索热词、偏好「全选=全部」判定）；**需重新打包** |

尺码那个 util 踩了两个坑（都已修，写在注释里）：

1. 「码」后缀剥除会**先吃掉「均码」的码** → `均码` 变成 `均` 被白名单丢掉（**52 条**中招）。
   改成：只有剥完还是有效尺码（字母码/数字码）才剥。
2. `S送发箍送徽章` 这类脏值整条被丢 → 加「取开头 ≤3 位 ASCII 尺码记号」兜底。

实测丢弃的 49 条全是真噪声（`定金须先确认收货`×7、`也可联系客服备注`×4、`下单备注`×3、
`软妹风`×3、`项链/花丸/手袖/发带`、`打样中！`、`内搭\nJSK`、`BNT`…），真尺码零误杀。

### 9.11 2026-09-27 第二轮：说明「涉及其他商品」整条删 + 放开 `lo`

#### A. 说明：命中「其他商品」关键词 ≥2 个 ⇒ 整个 `description` 字段删掉

用户口径：「说明里只要涉及其他商品的都完整删掉」，关键词 **店铺活动 / 店铺推荐 / 包邮 / 购买 / 已抵 / 热销**，
「涉及两个的整个说明字段都删掉」。

- 实现：`_text_clean.py` 新增 `DESC_OTHER_KW`，`clean_description()` **第一步**判断命中 ≥2 → 直接返回 `''`；
  同时把 `已抵` 补进 `DESC_PAY_KW`、`热销` 补进 `DESC_PROMO_KW`。
- 实测分布（286 条有说明的）：命中 ≥2 个 **190 条**、命中 1 个 **0 条**、命中 0 个 96 条
  ⇒ 边界上不存在「只命中 1 个怎么办」的分歧，两种理解结果一致。
- 词组合 Top：`包邮+店铺推荐+购买` 64 条 ｜ `店铺推荐+购买` 45 条 ｜
  `包邮+已抵+店铺推荐+店铺活动+热销+购买` 35 条 ｜ `包邮+已抵+店铺推荐+购买` 28 条。
- **最终：286 条全部清空（`description` 非空 = 0）**。上轮那 2 条「截短后仍有内容」的
  （「公益宝贝…捐赠 15 笔」这类）本轮也整条删掉。
- ⚠️ 结论重申：**这次采集压根没采到真实商品说明** ⇒ App 详情页「商品说明」模块将是空的；
  想要这个模块必须重新采集。

#### B. 标题：不再删 `lo`（口径反转）

用户口径：「去掉关键词 lo 检测，如果是可爱毛绒lo鞋就直接显示可爱毛绒lo鞋吧，类似的一同处理」。

- 删掉 `clean_title()` 里的孤立 `lo` 正则 `(?<![A-Za-z])lo(?![A-Za-z])`
  （曾把「可爱毛绒lo鞋」清成「可爱毛绒鞋」）。
- 并把 `lo娘` / `lo裙` 从 `CATEGORY` 移除（属于「类似的一同处理」）——
  否则 27 条标题的 `lo裙` 会被**整词**删掉，`lo` 照样消失。
- **完整品类词 `lolita / Lolita / LOLITA / lolite / Lolita裙 / 洛丽塔 / 罗丽塔 / ロリータ` 仍照删**
  （那是品类词，不是 `lo` 缩写）。
- 实测：源数据 **99 条**标题含孤立 `lo` → 清洗后 **99/99 全保留**；最终 3010 条里 **90 条**含 `lo`
  （差的 9 条属于被删的那 237 条）。
- 附带：标题含空格 **25 条**（中文之间 **0**）—— 比上轮多 2 条，来自 `lo JSK` 这类
  拉丁与拉丁之间的空格，符合「只保留拉丁/数字之间的空格」规则。

### 9.12 2026-09-27 第三轮（定稿）：标题只删品牌名 + 商品说明整体下线

#### A. 标题清洗**仅针对品牌名**

用户口径：「算了，标题清洗仅针对品牌名称吧，其余都不变」。

`clean_title()` 重写为**只做一件事**：把品牌词（`build_brand_words` 从店铺名提取）整词删掉，末尾 `strip()`。

**不再做**的事（全部原样保留）：

- 品类词删除（`lolita / 洛丽塔 / 汉服 / JK制服 / lo裙 / lo娘`…）
- SEO 引流词删除（`原创 / 设计 / 正版 / 专拍 / 链接 / 包邮 / 秒杀`…）
- 发售状态词删除（`现货 / 定金 / 意向金 / 尾款 / 预售`…）
- 空格 / 符号 / 括号 / 孤立单字母规整，以及 `lo` 检测

⚠️ 一个必须处理的细节：**删品牌名时要连带吃掉两侧空白**。
店铺名「Alice girl原创工作室」去后缀后会被切成 `Alice` / `girl` 两个词，
若逐个 `replace(w, '')`，中间的空白会留在标题里：

```
【意向金1元抵10元】Alice girl原创新款…  →  【意向金1元抵10元】 原创新款…   ← 多一个空格（旧实现）
【意向金1元抵10元】Alice girl原创新款…  →  【意向金1元抵10元】原创新款…    ← 正确
```

改法：`re.sub(r'[\s\u3000]*' + re.escape(w) + r'[\s\u3000]*', '', s)`，末尾再兜底合并连续空白。

实测：3247 条源标题里 **2544 条**发生变化（都是删掉了品牌名）；
`lolita 270 / Lolita 331 / 洛丽塔 294 / 现货 134 / 定金 59 / 意向金 75 / 尾款 42 / 孤立 lo 91`
全部**原样保留**。

词表（`CATEGORY` / `SEO` / `RELEASE_WORDS` / `SEASON` / `BRACKET` / `DESC_*` / `clean_description`）
全部转为**不再调用**，保留在 `_text_clean.py` 仅供回溯与将来可能的恢复。

#### B. 商品说明（`description`）整体下线

用户口径：「删除商品说明字段和模块，不需要保留」。

| 层 | 处理 |
|---|---|
| 采集字段白名单 | `COLLECT_KEYS` 移除 `description` ⇒ 新 JSON 不再产出该字段（实测 JSON 里 `"description"` 键 **0 个**）|
| 数据库 | SQL 第 1 步 `SET description = NULL`（**无条件清空**）。⚠️ 绝不能写 `COALESCE(s.description, p.description)` —— 新 JSON 没这个键，COALESCE 会把库里旧的推荐位脏值原样留下来 |
| App 详情页 | 删除「商品说明」模块（模板块 + `descriptionText` computed）|
| App 数据接入 | `product-service.uts` 不再把 `description` 接进 `FeedItem.subtitle` 与 `Product.description` |

⚠️ 数据模型里的字段**定义保留**：`FeedItem.subtitle` 是跨实体通用字段（feed/brand 共用），
`Product.description` 被 mock 引用，删定义会牵连编译且收益为零 —— 它们现在恒为空串。

#### C. 本轮产物（2026-09-27 01:36）

`import-full.sql` **5,165,736 B** ｜ `import-dryrun.sql` 5,165,889 B ｜
`all_shops_products.updated.json` **6,083,213 B**（比上轮大 —— 标题保留了更多内容）｜
`标题-清洗对照.csv` 2386 行 ｜ `[9] sqlglot 语法复核通过，可以上传`。
门禁 `check-source-gates.js` 全 PASS ｜ `tests/*.test.cjs` 7 个全 OK。

#### D. App 代码已推远程

```
git@github.com:burnkings/sankengcloset.git   main   c27795d → b1908c8
84 files changed, 4153 insertions(+), 295 deletions(-)
```

本机原先**没有 `.git`**，需先 `git init` → `git remote add origin` → `git fetch`
→ `git reset --mixed origin/main` 建立基线（`--soft` 不会填充 index，会误判成 454 项全新文件）。

`.gitignore` 新增排除（本地 2.5 GB 采集数据不进仓库）：
`_archive-2026-09-26/`、`scripts/_chromeprof/`、`scripts/gui-automation/`、
`scripts/product-enrich/`、`scripts/taobao-backfill/`。

### 9.13 2026-09-27 第四轮：标题再删 `原创` / `设计` / `新款`

用户口径：「原创 / 设计 / 新款 这三个也在标题里删除，加上品牌名共四个」。

`clean_title()` 的删除词表 = **品牌词** ∪ `TITLE_DROP`：

```python
TITLE_DROP = ['原创设计', '原创', '设计', '新款']
TITLE_DROP_EXCEPT = {'设计': '感'}      # 唯一例外，见下
```

- `原创设计` 必须排在 `原创` / `设计` **之前** —— 词表按长度降序处理，长词先命中。
- 其余 SEO 词（`正版 / 专拍 / 链接 / 包邮 / 秒杀 / 特价 / 清仓`…）、品类词、发售状态词、`lo`
  **一律仍保留**。
- ⚠️ **唯一例外：`设计感`**。`设计` 被拆走后只剩一个「感」
  （「…小众设计感学生薄款jk制服女」→「…小众感学生…」），是明显的坏结果。
  所以删 `设计` 时加了负向先行断言 `(?!感)`。实测只影响 **6 条**。

实测（3247 条源标题）：

| 指标 | 值 |
|---|---|
| 标题发生变化 | **3030 条** |
| 平均长度 | 30.5 → **25.5** 字 |
| `原创` / `新款` 残留 | **0** / **0** |
| `设计` 残留 | 6（全部是 `设计感`，有意保留）|
| 最终 3010 条里仍含 `lo` | 89 |

⚠️ 附带说明：**标题含空格的条数从 25 涨到 377（其中中文之间 281）** —— **不是清洗引入的**。
`_check_space.py` 逐条比对确认「只有清洗后才有空格」的条目 = **0 条**；
那 377 条全部是**卖家原标题里本来就有的空格**，按「其余都不变」的口径原样保留
（另有 172 条原本存在的空格，在删词时被连带吃掉）。

#### 产物（2026-09-27 02:1x）

`import-full.sql` **5,193,367 B** ｜ `import-dryrun.sql` 5,193,520 B ｜
`all_shops_products.updated.json` **6,113,562 B** ｜ `标题-清洗对照.csv` 2839 行 ｜
`[9] sqlglot 语法复核通过，可以上传`。

**App 侧本轮无代码改动，不需要重新打包。**

## 10. 待你决策

| # | 事项 | 现状 |
|---|---|---|
| 1 | 童装 / cos 共 **12 条**是否删 | 已判定该删（真童装 3 条、真 cos 9 条），且**全部未采集**（零代价）。明细在 `out-collected/童装与cos-判定明细.csv`，导入脚本**不动**它 |
| 2 | 收藏链接 5 条（千木）、定金/尾款专拍链接是否删 | 未决 |
| 3 | 是否重启 Chrome 续采 HANFU 剩余 1147 条 | 未决（Chrome 已退出） |
| 4 | `_archive-2026-09-26/`（7.7 MB）是否可删 | 待确认 |
| 5 | `brands` 表的店铺分类是否也要标 MIXED | 按 §8.5 的画像，只有 3 家「专营」够格（十二时 / 年禧 / 叁肆喜）。当前**只改商品，不动 brand** |
| 6 | 中信号 5 条（新中式 Lo 裙）以后要不要另立细分类 | 已按你的要求**排除出 MIXED**；若以后想收，可挂 `sub_category` 而不是大类 |
| 7 | 标题清洗后的零星残留要不要再收一遍 | 现状（3010 条中）：孤立单字 101 条（多为 `【预】` 这类店铺自己写的 1 字段）、孤立「店」10 条、叹号 9 条、波浪号 1 条。**已判定不值得为它加规则**（再加规则伤及正常标题的风险高于收益）；如你想要，可以按白名单逐条改 |
| 8 | ~~`description` 说明字段~~ | **已定稿：整体下线** —— 字段 + 模块全删，库里置 NULL（见 §9.12 B）|
| 9 | ~~`lo` / 品类词保留范围~~ | **已定稿：标题只删品牌名，其余（品类词/状态词/空格/符号）全部原样保留**（见 §9.12 A）|

## 附：最终交付清单（2026-09-27 更新）

**只上传一个文件**：`scripts/taobao-backfill/out-collected/import-full.sql`（5.17 MB）

```bash
# ① 干跑（不改库）：应看到全部 NOTICE + 6 项验收数字
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < import-dryrun.sql
# ② 真跑
docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < import-full.sql
```

期望验收：`multi_image≈1844 ｜ has_variants≈1644 ｜ mixed=110 ｜ releases_total≈3010 ｜ soft_deleted=237 ｜ alive≈3010`
出问题回滚：`docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng -v ON_ERROR_STOP=1 < rollback-full.sql`

**App 侧同时要做的**：改动涉及
`stores/favorite-store.uts`、`stores/preferences-store.uts`、`components/v3/PostCard.uvue`、
`pages/product/detail.uvue`、`pages/search/index.uvue`、`pages/help/index.uvue`、
`pages/about/legal-content.uts`、`presentation/content/feed-presenter.uts`、`domain/content/feed-item.uts`，
新增 `utils/size-option.uts` 与 `static/icons/bag{-active}.svg` ⇒ **必须重新打包**，
否则运行中的还是 9-05 的旧构建（`unpackage/dist` 就能看出来）。

---
