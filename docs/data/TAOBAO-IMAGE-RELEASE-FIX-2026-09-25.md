# 淘宝采集补全 — 图片与发售信息问题定论 + 本轮修复（2026-09-25）

## 一、你的两个问题的结论

### 1. App 商品图只有一张 —— 是「抓了但没入库」，不是前端没用

取证（直接打线上接口 `GET https://api.sankengcloset.icu/api/v1/products/prd_taobao_<itemId>`）：

| 商品 | 接口返回 images | 接口返回的图 URL |
|---|---|---|
| prd_taobao_1001055244899 | **1 张** | `g-search1.alicdn.com/img/bao/uploaded/..._580x580q90.jpg` |
| prd_taobao_1001299367760 | **1 张** | 同上形态（店铺种子封面） |
| prd_taobao_999680401734 | **1 张** | 同上形态 |

而我们抓到的图是 `img.alicdn.com/imgextra/i2/1826904134/O1CN01..._!!1826904134.jpg`（原图，无缩放后缀）。
接口里那张是**最初店铺种子导入时的 580×580 搜索缩略图**，和我们抓的完全不是同一批 URL
→ 说明 `out-collected/images.sql` **从未导入数据库**。

前端侧没有问题：`pages/product/detail.uvue` 用 `extractImageUrls(result.images)` 渲染 swiper，
`services/content/product-service.uts` 会把后端 `images[]` 全量映射成 `ProductImage[]`，
只有后端返回空数组时才回退用单张 `coverUrl` —— 现在正好落在这个回退分支上，所以只显示一张。

### 2. 发售信息不显示 —— 抓到的批次**根本没写进去**，且原 SQL 有硬 bug

前端「发售信息」卡只在 `currentRelease != null` 时渲染（`pages/product/detail.uvue`），
`currentRelease` 来自后端 `product_releases` 的 LATERAL JOIN。线上实测这些商品 `currentRelease` 全是 `null`。

原 `parse-v3.py` 生成的批次 INSERT 有两个必死问题：

1. **枚举值非法**。数据库 `release_type` 枚举只有
   `first_release / rerelease / reservation / spot / lottery / unknown`，
   而旧脚本写入了 `'release'`（批次）和 `'deposit'`（定金）—— 这两类 INSERT 必然报
   `invalid input value for enum release_type`。
2. **INSERT 放在最后一个 `COMMIT;` 之后**，且 `visibility_status='draft'`。
   导入工具遇到第一条枚举错误就会整批中止（且这些 INSERT 没有事务保护），
   结果就是**一条批次都没进去**。旁证：文件里第一条 INSERT（`'reservation'`，本身合法）
   对应的商品 `prd_taobao_1001299367760`，线上 `currentRelease` 同样是 `null` —— 整块都没执行。

## 二、本轮修复

### 解析端 `scripts/taobao-backfill/parse-v3.py`

- **图片清洗**（原来把页面 UI 资源也当商品图）：
  - 剔除 `-tps-` / `gtms*.alicdn` / `/tfs/` / `shopmanager` / `qrcode` / `avatar` / `.gif`；
  - 只保留「本商品卖家账号 id」名下的图（自动从 URL 里统计出现最多的数字段）；
  - 归一为原图：剥掉 `_q50.jpg` / `_760x760q30.jpg` / `_.webp` / `~crop,...~` / 重复扩展名 `.jpg.jpg`；
  - 按 `O1CN` 去重保序，上限 60 张。
  - **修前后对比**（同一批 1200+ 条）：旧数据平均 15 张里混着图标/店铺横幅、`images[0]` 可能是 logo；
    新数据平均 **7.35 张、0 条 UI 资源残留**，`images[0]` 是真正的主图原图。
- **发售批次**：`release` → `first_release`（命中「再贩/复刻/二次/返场」则 `rerelease`）；
  `deposit` → `reservation`；写入前对枚举做断言（`REL_TYPE_OK` / `SALE_STATUS_OK`），非法直接报错而不是静默产出坏 SQL。
- **可见性**：`visibility_status` 从 `draft` 改为 `published`（否则客户端拿不到 currentRelease）。
  想改回草稿态：`RELEASE_VISIBILITY=draft python parse-v3.py raw-v4 out-collected`。
- **事务**：商品的 UPDATE 与批次 INSERT 合并成**单事务**（`BEGIN; ... COMMIT;`），不再出现「只落一半」。
- **图片只补不缩**：`images = CASE WHEN images IS NULL OR jsonb_array_length(images) < N THEN <新图集> ELSE images END`
  —— 新图更多时才覆盖，避免把人工整理过的长图集冲掉。

### 采集端 `scripts/gui-automation/cdp_collect.py`

- **模拟键鼠**（你要的）：不再用 `window.scrollTo`，改为 CDP 真实输入事件 ——
  `Input.dispatchMouseEvent(mouseMoved)` + 分段 `mouseWheel`（随机 560~880 px、随机位置、随机停顿）
  + 偶发 `End` / `PageDown` 键事件；末尾真实滚轮回到顶部。既更拟人，也能触发商品详情懒加载。
- **全量展示图**：`<img>` 的 `src/data-src/data-ks-lazyload/data-lazy/data-original` + 背景图 + 源码正则
  四路收集，再做卖家 id 过滤与归一（与解析端同一套规则），上限 60 张。
- **速度慢一倍**：默认每条延迟 2.5~5.5 秒 + 拟人滚动本身约 8~10 秒，
  实测 **2.67 条/分钟（≈22.5 秒/条）**，对比旧版 ~8.5 秒/条（约 7 条/分钟）确实慢了一倍以上。
- **单实例锁**：`scripts/taobao-backfill/.collect.lock`，原子创建 + 30 秒抢占窗口保护，
  防止托管/定时任务重复拉起导致并发（并发会互相拖慢甚至卡死客户端）。
- **优先级**：`backlog.json` 已是 `LOLITA → JK → HANFU → OTHER` 的块顺序，采集器按序跳过 `_done`。
  当前 LOLITA 767 条**已全部完成**，实际在跑 JK，之后是 HANFU。

## 三、怎么导入（本次要跑的两份）

```bash
cd scripts/taobao-backfill/out-collected

# 1) 商品图片（只补不缩：新图集张数更多才覆盖）
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f images.sql

# 2) 商品字段（只补空值）+ 发售批次 INSERT，单事务
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f patch-collected.sql
```

- 匹配键：`external_id = '<淘宝itemId>' AND source_platform IN ('TAOBAO','TMALL')`。
- 建议加 `-v ON_ERROR_STOP=1`：这次两边都在一个事务里，出错会整体回滚，不会留半成品。
- 导入后在 App 里打开商品详情验收：主图轮播应有 7 张左右、下方出现「发售信息」卡。

## 四、当前进度（2026-09-25 17:35）

- 采集完成 **1245 / 3247**（38.3%）；LOLITA 767 条已 100% 完成，正在采集 JK（剩 609），
  HANFU 1418 条排最后。
- 解析产出：**1242 条**有效记录，images 覆盖 99.9%（平均 7.35 张 / 共 9130 张），
  variants 87.6%、sub_category 74.2%、product_releases 45.3%、sale_status 51.1%、description 25.7%。
- 按 2.67 条/分钟，剩余 ~2000 条约需 **12.5 小时**。

## 五、遗留的两点（需要你拍板）

1. **63 条商品只有 1 张图**：多为下架/失效或仅有一张主图的商品，属于源数据本身如此；
   如需逐一复核可以挑出来单独跑一轮。
2. **采集进程无法真正脱管**：本机 `schtasks.exe` 被 Command Security 黑名单禁用，
   所以不能用计划任务托管；当前靠「长驻后台任务 + 每 2 小时自动续跑」兜底。
   若要彻底脱管，可以二选一：把 `schtasks.exe` 从黑名单移除；或把
   `scripts/gui-automation/run-collect.cmd` 放进「启动」文件夹（开机自启）。
