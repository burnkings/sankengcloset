# 淘宝桌面端补数据方案（2026-09-23）

用淘宝桌面版 CLI（`taobao-native`）采集商品页原始数据 → AI 解析成数据库字段 → 回填 `products` 表缺失字段。

---

## 1. 四阶段流程

| 阶段 | 谁做 | 输入 | 产出 | 说明 |
|---|---|---|---|---|
| ① 建缺口清单 | 数据库 / 用户 | 缺字段的商品 | `backlog.json` | 每条含店铺名、关键词或商品链接 |
| ② 采集原始页 | `fetch.ps1` | `backlog.json` | `raw/<id>/*.json` | 商详全文、SKU、价格、主图链接 |
| ③ AI 解析 | 当前 AI | `raw/<id>/` | `patch/<id>.json` + `patches.csv` | 只填页面明确出现的值，缺失留空 |
| ④ 回填 | SQL / Excel | patch | `UPDATE` 语句或核对表 | 只补空值，不覆盖人工已确认值 |

无链接的条目：② 先出搜索候选 → AI 挑选正确链接写回 `backlog.json` → 再跑详情采集。

---

## 2. 目录

```
scripts/taobao-backfill/
├── backlog.example.json   任务清单模板
├── backlog.json           实际任务清单（需自己建）
├── fetch.ps1              采集脚本
├── raw/<id>/              原始页面数据（断点续跑依据）
└── patch/                 AI 解析产物
```

---

## 3. 命令

```powershell
# 全量跑
cd C:\Users\dddd\Desktop\sankengcloset\scripts\taobao-backfill
powershell -ExecutionPolicy Bypass -File .\fetch.ps1

# 只跑 20 条（试水）
powershell -ExecutionPolicy Bypass -File .\fetch.ps1 -Limit 20
```

已完成的条目（`raw/<id>/_done` 存在）自动跳过，中断后重跑同一条命令即可续跑。

---

## 4. 字段映射（淘宝页 → products 表）

| products 字段 | 来源 | 可信度 | 备注 |
|---|---|---|---|
| `title` | 商详标题 | 高 | 去掉营销前缀和括号赠品语 |
| `shop_name` | 商详店铺名 | 高 | |
| `images` | `read_page_content` 的 `[商品主图]`/`[商品图]` | 高 | **去掉 `_.webp` 后缀**保高清；第一张作封面 |
| `variants` | `get_product_skus` | 高 | 只写款式/颜色/尺码，不推断库存 |
| `price_cents` | SKU 点击后 `scan_page_elements --filter ￥` | 中 | **不能用搜索价或"¥xx 起"** |
| `original_price_cents` | 页面划线原价 | 中 | 无则留 NULL |
| `sale_status` | 页面库存/预售标签 | 中 | 页面无明确信息则 `UNKNOWN` |
| `external_id` | 商品 ID（URL 的 `id=`） | 高 | |
| `canonical_url` | `get_current_tab` 后去追踪参数 | 高 | 保留 `item.taobao.com/item.htm?id=xxx` |
| `source_platform` | 固定 `TAOBAO` / `TMALL` | 高 | 按域名判断 |
| `description` | 详情原文 | 中 | 原文摘录，不改写 |
| `sub_category` / 各 tag 数组 | 标题+详情原文 | 低 | **只在原文明确出现时填**，不推断 |

**淘宝页拿不到、必须留空**：定金/尾款/批次时间（`product_releases`）、材质成分、风格标签（除非原文写明）、`brand_id`（需另做品牌映射）。

---

## 5. 硬规则

| 规则 | 说明 |
|---|---|
| 不编造 | 材质、风格、库存、发货时间一律不推断 |
| 意向金 ≠ 售价 | 定金/意向金写 `price_type='INTENTION'`，不填 `price_cents` |
| 真实 SKU 价 | 搜索价、"¥xx 起"都不是真实价；点 SKU 后 `sleep 3` 再读 |
| SKU 用 index 点击 | 禁止用 `text` 匹配，避免点错规格 |
| 大结果必须 `-o` | `search_products` / `read_page_content` / `scan_page_elements` 一律写文件，防截断 |
| 图片去 `_.webp` | 否则图裂/变糊 |
| 只补空值 | 回填 SQL 带 `WHERE 字段 IS NULL OR 字段=''` 条件 |

---

## 6. 缺口清单两种来源

**A. 从数据库导出**（把结果转成 `backlog.json`）

```sql
SELECT id, shop_name, title, canonical_url, category
FROM products
WHERE deleted_at IS NULL
  AND (
       images = '[]'::jsonb
    OR price_cents IS NULL
    OR variants = '[]'::jsonb
    OR sale_status = 'UNKNOWN'
  )
ORDER BY updated_at DESC;
```

**B. 人工给清单**：店铺名 + 商品关键词（Excel / 直接粘贴），AI 转成 `backlog.json`。

`backlog.json` 格式：

```json
{
  "sourceApp": "WorkBuddy",
  "tasks": [
    {
      "id": "p001",
      "shop_name": "店铺名",
      "keyword": "商品关键词",
      "item_url": "",
      "category": "LOLITA",
      "need_fields": ["images", "variants", "price_cents"],
      "note": ""
    }
  ]
}
```

---

## 7. 回填 SQL 模板

```sql
UPDATE products
SET images      = '[...]'::jsonb,
    price_cents = 32800,
    price_type  = 'FULL',
    updated_at  = now()
WHERE id = 'prd_xxx'
  AND (images = '[]'::jsonb OR price_cents IS NULL);
```

---

## 8. 已知环境坑

| 坑 | 解法 |
|---|---|
| Bash 调 `taobao-native` 报 `Cannot find module c:\c\files\...` | Git Bash 路径转换 bug，**必须用 PowerShell 调 `.cmd`** |
| PowerShell 吞原生 exe stdout | 脚本已重定向到文件再读 |
| CLI 返回中文乱码 | 读文件，不要直接看 stdout |
| 本仓库 Bash 工具 `ls`/`dirname` 不可用 | 先 `export PATH="/usr/bin:/bin:$PATH"` |
