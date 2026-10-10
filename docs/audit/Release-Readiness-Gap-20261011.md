# 上架就绪度审计 · 2026-10-11

审计对象：`sankengcloset`（前端 `deab01e`，微信小程序 + uni-app x Android App）
审计方式：源码逐层核对 + 线上接口实测（`https://api.sankengcloset.icu`）+ 项目自带门禁。
**所有结论都有可复现的证据行号 / 实测数字，不含推测。**

---

## 一、商品详情「标题右侧价格」为什么还是固定价（不是区间）

### 结论：前端是对的，**是数据里没有区间**

前端链路逐层核对，全部正确：

| 层 | 位置 | 行为 |
|---|---|---|
| 格式化 | `presentation/content/feed-presenter.uts:233` | `formatPriceRange(min,max)`；`max <= min` 时按**单值**返回（合法分支） |
| 详情页 | `pages/product/detail.uvue:292-308` | 优先 `formatPriceRange(item.price, item.maxPriceCents)` → 退化「款式参考价现算」→ 再退化 price_type 摘要 |
| 映射 | `services/content/product-service.uts:215` | `result.maxPriceCents = item.maxPriceCents`（**已透传**） |
| 列表 | `/api/v1/feed` 返回体 | 含 `maxPriceCents` 字段 |

**线上实测（决定性证据）**

- 采样 `/api/v1/feed` 8 页 × 20 条 = **160 个商品，其中 `maxPriceCents > price` 的有 0 个**。
- 单条详情 `prd_taobao_771451888321`：`priceCents=23300`、`maxPriceCents=0`、`priceType="UNKNOWN"`、`variants=0`。

⇒ 区间右端全库为空 ⇒ `formatPriceRange` 走单值分支 ⇒ 显示 `price_cents`（后台标的固定价）。

**根因**：迁移 **0112** 新增 `products.max_price_cents` 时**无回填**；运营后台的「最高价」录入也一直没跑起来。

**修法（按性价比）**

1. **后端自动推导 + 一条 SQL 回填全库**：`max = max(款式参考价)`，无款式则 `max = max(批次 fullPriceCents)`；
   `min` 保持 `price_cents`。这是根治，且不需要运营逐条录。
2. 运营后台「最高价」流程跑起来（字段 `cMaxPrice` + 校验已有）。
3. 前端已有的「款式参考价现算」兜底只在 `variants` 有 ≥2 个不同价时生效，线上 `variants=0`，救不了。

**⚠️ 附带发现（口径分叉，建议一并修）**
`pages/product/detail.uvue:338` 的规格价格是**页面自己手拼**的：

```ts
return '¥' + low + (low === high ? '' : '–' + high)
```

没走 `formatPriceRange` ⇒ 万级缩写（`x.x万`）、小数位裁剪、en-dash 三处口径会和商品卡/榜单分叉。
**应改为调用 `formatPriceRange(prices[0], prices[prices.length-1])`。**

---

## 二、距「上架微信小程序」还缺什么

### 已有（可放心）

用户协议 + 隐私政策页（`pages/about/legal`，`legal-content.uts` 200+ 行真实文本）、
账号注销（UI 二次确认 + `deactivateAccountRemote`）、ICP 备案号（`陕ICP备2026020070`，**真值**）、
帮助页 + 客服邮箱 `service@sankengcloset.icu`、意见反馈、举报（社区，带原因分诊）、
检查更新、TabBar 图标齐全、分包 16 个 / 26 页、体积合规（主包上传口径 ≈806KB / 硬限 2048KB）、
隐私勾选**不预勾**（`agreed = ref(false)` 起步）。

### 缺（按阻塞程度）

| 级别 | 缺什么 | 证据 |
|---|---|---|
| 🔴 阻塞 | **法律文本运营主体信息仍是占位** | `pages/about/legal-content.uts:16-20`：`LEGAL_ENTITY` / `LEGAL_CONTACT` / `LEGAL_EFFECTIVE_DATE` / `CLOUD_PROVIDER` / `REGULATOR` **全部 = `'待运营补充'`**。实测 `LEGAL_RELEASE=1 node scripts/check-source-gates.js` → **`[FAIL] …仍为「待运营补充」，发布前需由运营填值`**（该门禁平时只 WARN，所以此前没拦住）。审核必看隐私政策的运营主体与联系方式 |
| 🔴 阻塞 | **UGC 零内容安全检测** | 全项目 grep `msgSecCheck` / `mediaCheckAsync` / `secCheck` **零命中**。社区可发动态、传图、改昵称头像 ⇒ 微信要求接入内容安全接口（`security.msgSecCheck` / `mediaCheckAsync`），否则审核驳回或事后下架 |
| 🟠 高风险 | **「前往原店」按钮名不符实** | `pages/product/detail.uvue:191` 按钮文案是「前往原店」，但 `utils/share.uts:41 openExternalUrl()` 的真跳转只在 `#ifdef APP`（走 `taobao://` scheme）；**小程序端落到 `uni.setClipboardData` 复制链接**。名不符实 + 带淘宝链接易被按「引导站外交易」审视 |
| 🟡 平台侧 | 微信认证、小程序 ICP 备案、类目资质（服饰/电商） | 非代码；备案号已有说明备案在办/已办，需确认**小程序备案**本身完成 |
| 🟡 平台侧 | 「用户隐私保护指引」声明接口 | 代码侧已备好，平台侧要填 `uni.chooseImage`(5 处) / `uni.setClipboardData`(2 处)，否则真机报 `api scope is not declared in the privacy agreement` |
| 🟡 平台侧 | `request` 合法域名 | 需加 `api.sankengcloset.icu` |

> 注：分享面板只能由用户点 `<button open-type="share">` 拉起，当前实现是「复制文案」，已合规。

---

## 三、距「正式版 App（非应用商店分发）」还缺什么

| 级别 | 缺什么 | 证据 |
|---|---|---|
| 🔴 阻塞 | **App 图标只有 72×72** | `static/app-icon.png` 实测 **72 × 72**，且 `static/logo.png` 与它是**同一份文件**（都是 4023 字节）。`manifest.json` 的 `app.distribute.icons.android` 的 hdpi/xhdpi/xxhdpi/xxxhdpi **四档全是空字符串**。Android 正式版至少需要 192/384/512 多档 |
| 🟠 高 | **无启动图** | `app-android.distribute.splashScreens` 只有空 `default: {}` |
| 🟠 高 | **无应用内更新闭环** | `services/user-data/app-update-service.uts` 只有 `checkUpdateRemote()`（版本比较 + `minVersionCode`），**没有任何下载 APK / 拉起安装**的代码 ⇒ 用户只能自己去网页下载新包 |
| 🟡 中 | **`Push` 模块声明与实际不符** | `manifest.json` 声明 `modules: { Push: {} }`，但项目实际用本地通知插件（`uni_modules/local-notify`），无任何厂商推送配置 ⇒ 云打包/审核容易卡 |
| ✅ | 已有 | `release.keystore`（签名密钥，**勿删**）、`POST_NOTIFICATIONS` 权限处理、登录页隐私勾选、HTTPS 后端 |
| ⚠️ 流程 | 打包方式 | uni-app x 只能走 HBuilderX 云打包/本地打包，**自动化沙箱做不了**，需在本机桌面点 |

**建议最小路径**：补一套多档图标 + 启动图 → 清掉 `Push` 声明 → 出一版 APK 自测 →
应用内更新做成「检查到新版本 → 打开下载页」即可（不必做静默安装）。

---

## 四、优化点（已核对，剔除了误判）

1. **价格区间数据回填** —— 体验影响最大，与 §一 同一件事。
2. **补 UGC 内容安全** —— 合规 + 稳定性，与 §二 同一件事。
3. **统一价格格式化** —— `detail.uvue:338` 手拼 → `formatPriceRange`。
4. ⚠️ **`static/fonts/`（612KB，5 个 ttf）不是垃圾，别删**：
   `App.uvue:70-87` 的 `@font-face` 在用 `/static/fonts/Inter-*.ttf` 与 `NotoSansSC-Regular.ttf`；
   `scripts/strip-mp-deadweight.py` 只在 **mp-weixin 产物**里剔（小程序 `@font-face` 不支持包内本地路径）。
   可做的只有「`NotoSansSC-Regular.ttf`（340KB）子集化」，注意子集化有缺字风险。
5. **图标资源重复且过小** —— `app-icon.png` 与 `logo.png` 同一份 72×72，出真一套多档。
6. **根目录卫生** —— `database-schema.md.local-backup`、`REVIEW-SUMMARY-2026-09-13-14.md`、
   `lolita-titles-100.csv`、`database-schema-export.sql` 散在根目录，建议归入 `docs/` / `data/`。
7. **`scripts/` 子树 28,622 文件（9,296 jpg）** = 本地采集缓存占磁盘（已 gitignore），建议定期归档。
8. **大文件拆分** —— `pages/product/detail.uvue`(770 行) / `pages/reminder/edit.uvue`(643) /
   `stores/favorite-store.uts`(617) / `pages/favorites/index.uvue`(602)。
   `detail.uvue` 混了 价格·发售·规格·社区·黑名单 五块逻辑，适合抽 composable。
9. **把 manifest 剥离脚本化** —— 每次 `cli publish` 都会把 16MB 乱码注释写回 `manifest.json`，
   建议加进 `build-mp-weixin.ps1` 末尾自动剥（现为手工，见 memory §一.10）。
10. **`.workbuddy/_trash-2026-10-10/`（7.8MB）待人工删除** —— 上轮清理的隔离目录。

---

## 附：本次审计用到的可复现命令

```bash
# 价格区间覆盖率（线上实测）
node .workbuddy/tmp/probe-price-range.cjs      # → 商品样本数=160，有价格区间的=0

# 发布法律文本门禁
LEGAL_RELEASE=1 node scripts/check-source-gates.js   # → [FAIL] 运营信息常量仍为「待运营补充」

# 内容安全检测缺失
grep -rn "msgSecCheck\|mediaCheckAsync\|secCheck" pages/ services/ stores/ utils/   # → 零命中

# App 图标尺寸
python -c "import struct;d=open('static/app-icon.png','rb').read(33);print(struct.unpack('>II',d[16:24]))"  # → (72, 72)
```
