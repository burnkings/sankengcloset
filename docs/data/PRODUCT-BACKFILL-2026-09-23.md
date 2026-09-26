# 商品数据补全方案（2026-09-23）

源数据：`C:\Users\dddd\Desktop\all_shops_products.json`（222 店铺 / 3247 条，item_id 唯一）
现状：colors、sizes **全空**（当年 SKU 采集失败）；其余字段（标题/店铺/价格/主图/链接）完整。

补全分两层：**离线提取**（已完成，可立即导入）+ **淘宝端采集**（按需分批）。

---

## 第一层：离线提取（已完成）

脚本 `scripts/product-enrich/enrich.cjs`，纯正则从标题提取，不联网、不推断。

| 字段 | 补出 | 覆盖率 | 说明 |
|---|---|---|---|
| sub_category | 2806 | 86.4% | 按坑向分派规则表，长词优先 |
| variants(styleName) | 2426 | 74.7% | 只出款式维度，禁止笛卡尔积 |
| product_releases | 379 | 11.7% | 仅标题写明现货/定金/尾款/再贩时生成，时间一律留空 |
| color_tags | 379 | 11.7% | 只认"X色"与多字颜色词 |
| price_type | 361 | 11.1% | 意向金/定金/尾款/全款/现货 |
| sale_status | 320 | 9.9% | 售罄/现货/预售/预告 |

价格解析：3247 条全为单值，无区间价。<10 元视为意向金占位价，不写入 `price_cents`。

**产物**（`scripts/product-enrich/out/`）

| 文件 | 用途 |
|---|---|
| `patch.json` | 全量结构化补丁，程序消费 |
| `patch.csv` | 人工核对 / Excel 打开 |
| `patch.sql` | 按 `external_id` 匹配，用 `CASE WHEN ... = '' THEN` 只补空值 |
| `backlog.json` | 淘宝采集队列，3247 条按优先级排序 |
| `report.md` | 覆盖率与分布统计 |

### 提取规则（保守，宁缺毋滥）

- **颜色**：只认多字词（藏青、雾霾蓝、樱花粉…）和"X色"形式（白色、粉色、绀色）。裸单字"金/青/米"已废弃——实测"金"265 条几乎全来自"织金/定金"，"青"来自"青禾/青桐"。食物色（奶油/巧克力/香槟）必须带"色"后缀。
- **款式**：JSK/OP/SK 用 `[^a-z]` 边界匹配；有 JSK 时剔除 SK；标题含"45cm"且品类含"裙"时合成"45cm格裙"。
- **价格**：区间价不填；意向金不写入售价；variants 价格仅在**单款式 + FULL + ≥10 元**时给出。
- **发售批次**：`release_name` 取标题【】内标签或"一团/二团"；`start_at`/`end_at`/`ship_at` 一律 null（标题里没有，不编造）。

---

## 第二层：淘宝端采集（按需）

补 `material_tags`、`description`、尺码维度、发售时间——这些标题里没有，只能开商品页。

### 前置条件（必须）

1. **手动启动淘宝桌面版并登录**（双击桌面图标）。
2. 沙箱安全策略已阻断 `reg.exe`，脚本无法自动拉起客户端，必须人工先开。
3. 客户端运行后，脚本可连续跑。

### 命令

```powershell
cd C:\Users\dddd\Desktop\sankengcloset\scripts\taobao-backfill
powershell -ExecutionPolicy Bypass -File .\fetch.ps1 `
  -Backlog ..\product-enrich\out\backlog.json -Limit 50
```

不加 `-Limit` 即跑完整队列。中断后重跑同一条命令自动续跑（`raw/<id>/_done` 为完成标记）。

### 耗时与批次

实测约 **13 秒/条**（navigate 3s + 4 次读取 + 间隔）。
- 50 条 ≈ 11 分钟
- 300 条 ≈ 65 分钟
- 3247 条全量 ≈ 12 小时

建议先跑 50 条验证产出质量，确认后按 `-Limit` 分批推进。

### 队列优先级

1. 现货 / 有真实价格（能拿到有效 SKU 价）
2. 其余在售商品
3. 意向金页（价格无意义，最后抓）

---

## 已知环境坑

| 坑 | 解法 |
|---|---|
| Git Bash 调 `taobao-native` 报 `Cannot find module 'c:\c\files\...'` | MSYS 路径 bug，**必须 PowerShell 调 `.cmd`** |
| `.ps1` 含中文被 PS 5.1 按 GBK 解析炸掉 | 脚本已改纯 ASCII，`￥` 用 `[char]0xFFE5` |
| PowerShell 吞原生 exe stdout | 全部重定向到文件再读 |
| 客户端未启动时所有调用返回"应用未运行" | 手动启动客户端；脚本内置一次自动拉起重试 |
| 自动拉起被沙箱拦截（reg.exe 黑名单） | 无法绕过，人工启动 |
| 本仓库 Bash 工具 `ls`/`dirname` 缺失 | 先 `export PATH="/usr/bin:/bin:$PATH"` |

---

## 下一步

1. `patch.sql` 导入（或按 `patch.csv` 人工核对后导入）
2. 手动启动淘宝桌面版 → 跑 50 条采集 → 我解析 `raw/` 产出第二批补丁（material_tags / description / 尺码）
3. 效果确认后按批次推进采集
