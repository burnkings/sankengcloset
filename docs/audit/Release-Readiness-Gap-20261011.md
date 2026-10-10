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

---

# 八项整改结果（2026-10-11 实施）

| # | 事项 | 结果 |
|---|---|---|
| 1 | 价格区间 SQL 推导回填 | **做不了 —— 库里没有第二个价格源**（见下） |
| 2 | 接入 msgSecCheck / mediaCheckAsync | ✅ **已上线**（后端 `3e641b0`，线上 `block`，真实凭据实测通过） |
| 3 | 双端跳转选型 | ✅ 已定案并落地：小程序=**复制链接**，App=唤起淘宝；按钮文案已按平台区分 |
| 4 | 删 `modules.Push` 声明 | ✅ 已删（`app-android` + `app-ios`） |
| 5 | 重复图标 | ✅ `static/logo.png` 已移走（与 `app-icon.png` 字节相同、零引用）；⚠️ 多档图标仍缺 |
| 6 | 根目录卫生 | ✅ 5 个文件归入 `docs/data/`、`docs/audit/` |
| 7 | 大文件拆分能优化多少性能 | ✅ 有实测结论：**拆文件几乎不提速**（见下） |
| 8 | manifest 优化 | ✅ 乱码注释剥离已自动化并接进构建脚本；其余建议见下 |

## 1. 价格区间为什么不能靠 SQL 回填（只能补数据）

四个只读探针查线上库的结果：

| 查了什么 | 结果 |
|---|---|
| `products` | 3095 行；`price_cents > 0` 的 3095 行（100%）；`max_price_cents` 非空 **1 行且其值为 0** |
| `products.variants` | **是 jsonb 列，不是独立表**；1640 个商品有变体，但**只有身份字段**（id/name/sizeName/colorName/styleName）——**没有任何价格** |
| `product_releases.full_price_cents` | 2941 个商品有批次、1504 行有价；**但「批次价 > 商品价」的商品数 = 0**；另有 1 行 `999999900`（脏数据） |
| 全库含 price/amount/cents 的列 | 只有 `products.price_cents / max_price_cents / price_type` 与 `product_releases.deposit/balance/full_price_cents` |
| `ai_import_tasks`（本以为存了原始采集证据） | **0 行** |

⇒ **全库不存在第二个价格**，「一条 SQL 推导出区间」无源可导。
（`deposit + balance` 是**分期语义**，把它当「价格区间」显示是错的，不能这么糊。）

**唯一两条正路**：
1. **采集侧补价**（推荐）：在淘宝详情页抓 SKU/规格价区间，写入 `price_cents`（下限）+ `max_price_cents`（上限）；
2. **运营手录**：后台「最高价」字段与 `maxPrice < price` 校验都已就绪。

参考：`products.price_type` 分布 = FULL 1543 / UNKNOWN 1239 / DEPOSIT 161 / INTENTION 129 / BALANCE 23。

## 2. 内容安全（已上线）

- 新增 `src/services/content-security.ts`：`stable_token` 取 token 并缓存（过期前 5 分钟续）；
  `checkText()` = `msg_sec_check` v2（同步、可立即拦截）；`submitMediaCheckAsync()` = `media_check_async` 提交。
- **fail-open**：微信超时/报错/拿不到 token **一律放行** —— 绝不因检测故障卡死全站发帖；
  只在微信**明确判违规**时拒绝。
- 接线位置：建动态（`caption + topic`，`scene=2`）放在「图片校验完、**还没落库**」之间
  ⇒ 违规内容不进库，也不留下孤儿 media 引用；改昵称（`scene=1`）。
- openid 取自 `users.login_subject`；内存驱动恒返回 `''` ⇒ 本地/测试自动跳过。
- 开关：`WX_CONTENT_SECURITY = off | log | block`；**线上已置 `block`**。
- **实测**：`stable_token` OK；`msg_sec_check` → `errcode:0 / suggest:pass / label:100`；
  `media_check_async` → `trace_id`。
- ⚠️ **`mediaCheckAsync` 是异步的**，结果要靠小程序后台配「消息推送」回调才能拿到
  ⇒ 目前它只负责提交，**真正拦违规的是文本侧**。要让图片也拦，需再加回调端点。

## 3. 双端跳转：小程序不能跳，App 才跳

- **小程序端只有「复制链接」这一个合规解**：`taobao://` 这类外部 scheme 打不开；
  `web-view` 只能加载已备案的业务域名，且微信明令禁止用它承载站外电商导流 ⇒ 跳 H5 既麻烦又易被判「诱导跳转」。
- **App 端唤起淘宝 App 最顺**（现有实现：`taobao://` → 系统浏览器 → 复制兜底）；App 不受微信规则约束，
  这正是 App 相对小程序的价值点。
- 已落地：`pages/product/detail.uvue` 按钮文案按平台区分（小程序显示「复制链接」，App 显示「前往原店」），
  消除「文案与行为不符」的审核风险。

## 7. 拆文件到底能优化多少性能 —— 诚实结论：几乎不能

实测当前产物：`common/vendor.js` **95.8KB**（共享底座），页面 chunk 最大依次是
`pages/product/detail.js` **23.4KB**、`reminder/edit.js` 22.7KB、`favorites/index.js` 20.6KB。
`detail.uvue` 782 行 = **20 个 `ref` + 60 个 `computed`** + 25 个函数。

- 拆 `.uvue` **不改变产物体积**（uvue 按页面聚合编译到同一个 chunk），**也不改变运行时性能**
  （小程序执行的还是同一份压缩代码）。
- 真收益是**可维护性 / 评审 diff / 编译增量**（HMR 只重编改动文件）。**不要把「拆文件」当性能优化来讲。**
- 真正影响性能的三件事：① 减少 `computed` / `ref` 数量（60 个 computed 每次响应式变更都要重算脏节点）；
  ② 非首屏块懒加载（分包 / 条件渲染）；③ 图片按显示尺寸取图（已落地）。
- ⚠️ 未做真机 profile 之前**不给百分比**。

## 8. manifest 最佳化

- ✅ **乱码注释自动化剥离**：新增 `scripts/strip-manifest-junk.py`（只删「超长且确实是注释」的行；
  剥离后用 JSON5 去注释再校验一次合法性，不合法就**拒绝写入**），已接进 `build-mp-weixin.ps1` 编译后自动执行。
- ✅ 参数合法性：改完脚本用 PowerShell 解析器验证过（1022 tokens / **0 parse errors**，UTF-8 BOM 完好）。
- ⏳ 可做但不急：`app.distribute.icons.android` 四档是空字符串（uni-app x 用 `app-android`，这段是残留）；
  `quickapp / mp-alipay / mp-baidu / mp-toutiao` 四个平台 stub 用不到（本工程只出微信 + App）。
