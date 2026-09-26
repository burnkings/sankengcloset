# 三坑绮橱 · 未完成功能盘点（2026-09-24）

> 方法：逐项 grep + 读源码验证「是否真的有实现」，只写有证据的；不推测、不编造。
> 上位文档：`docs/product/GAP-ANALYSIS-2026-09-11.md`（前一轮）、`docs/operations/agent-prompts/OPTIMIZATION-BACKLOG-2026-09-11.md`（工程待办）。
> 修订：2026-09-24 22:00 — 按下述决策删除 2 项伪缺口、2 项"待决策"落定。

## 0. 一句话结论

产品主链路（Feed → 发现 → 收藏 → 购买外跳 → 订单导入 → 提醒 → 入橱 → 分享）已闭环；
**真正卡住上架/上线的是 3 件合规与外部依赖（账号注销入口、备案号、AI 真实模型），
再有 2 件功能缺口（分享只有复制文案、应用内安装更新）。**

### 0.1 已按决策关闭的条目（不再是缺口）

| 原编号 | 原描述 | 决策 |
|---|---|---|
| B2 | 「同步状态对用户不可见」 | **删除**。账号默认就是同步的，不区分"同步/不同步"这个说法，不需要向用户暴露同步进度。收藏失败已有 toast，够用。 |
| B3 | 「通知页缺『未读』筛选」 | **删除**。不做未读筛选，保持现状 4 档（全部 / 发售 / 互动 / 系统）。设计规范 §6.7 里的「未读」一档同步标记为「不做」。 |
| 2.3-1 | 首页插 2 条「展示样例」待决策 | **落定：内测期正常现象**，不关开关、不改（测试契约已对齐）。 |
| 2.3-2 | 小程序端是否需要「检查更新」 | **落定：隐藏**。已实现（`pages/about/index.uvue` 的 `showCheckUpdate` + `#ifdef MP-WEIXIN`）。 |

---

## 1. 本次会话已修（勿回退）

| # | 问题 | 根因 | 文件 |
|---|---|---|---|
| 1 | 深色模式下通知页未读卡片仍是浅粉白底，标记已读后才变深 | `theme/use-theme.uts` 把 `isDark` 写成对象字面量 getter；UTS 会编译成 `new UTSJSONObject({...})`，其构造函数 `for (key in content) this[key] = content[key]` **当场求值 getter**，值被冻结成模块加载时的 `false` → 全 App 的 `isDark.value ? 深色 : 浅色` 永远走浅色分支 | `theme/use-theme.uts`（改为函数 `isDark()`）、19 处调用点（11 个文件） |
| 2 | 通知行未读高亮在深色下没有"暖粉"层次 | 原本用 `surfaceWarm`（#2A2022，与卡面几乎同色） | `pages/notification/index.uvue` 改用 `n.surfacePink`（深色 #3A2428） |
| 3 | 版本常量与 `manifest.json` 漂移（前者 beta.2、后者 beta.4） | 两处手写、无人校验 | `config/app-version.uts` 对齐 + 新增 `APP_VERSION_CODE` |
| 4 | 检查更新信服务端 `hasUpdate` 布尔；失败与"已是最新"无法区分；无强制更新 | 见 `docs/architecture/V2.4-APP-UPDATE-CONTRACT.md`（**线上 `/api/v1/app/version` 已存在**，缺的是字段填全） | `services/user-data/app-update-service.uts`、`pages/about/index.uvue` |
| 5 | 防回归门禁缺失：对象字面量 getter 会被静默冻结 | — | `scripts/check-source-gates.js` 新增第 6 组门禁（已用探针验证能拦住） |
| 6 | `pages/discover/index.uvue` 导入但未使用的 `FEED_BRAND_POST` | — | 已删（门禁 5.4 会拦这类漏改） |
| 7 | 小程序端「检查更新」是假功能（版本由微信托管） | — | `pages/about/index.uvue` 加 `showCheckUpdate`，`#ifdef MP-WEIXIN` 置 false；协议行数随之 3→2 |
| 8 | 游客点收藏只弹一句 toast，收藏页空态仍在引导"去发现" | 收藏有登录守卫，游客收藏永远为空 | `pages/favorites/index.uvue` 空态按登录态分流（「登录后收藏才会保存」+「去登录」）；`pages/product/detail.uvue` toast 改为「请先登录后收藏（在「我的」页登录）」 |

验证结果：源码门禁 **6 组全 PASS**；单元测试 **49/49 全绿**（新增 9 条 `tests/app-update.test.cjs`，另修掉 5 条存量断言漂移，见 §2.4）。

---

## 2. 仍未完成清单

### 2.1 合规硬缺口（上架/审核前必须补）

| # | 项 | 证据 | 建议 |
|---|---|---|---|
| A1 ★★★ | **账号注销没有入口** | 隐私政策承诺可注销（`pages/about/legal-content.uts:83`、`:194`），但全站无 UI 入口（`grep 注销账号 pages/` 只命中法律文本） | `pages/preferences/` 新增「账号与安全」页：二次确认 + 后果说明 + 清本地数据后 `reLaunch`；**需先与后端定注销接口** |
| A2 ★★★ | **应用内无备案号** | 全仓库检索「备案」零结果 | `pages/about/index.uvue` 加一行「备案号」并同步写进隐私政策；号由运营提供。**注意这是两回事**：① **ICP 备案（网站/服务器备案）** —— 域名 `api.sankengcloset.icu` 的备案，App 内展示它；② **App 备案（移动应用备案，工信部 2023 起要求）** —— 按 `appid` 单独备案，与域名备案平行，两号都应展示。当前本项目两号均无 |
| A3 ★★ | 隐私政策「第三方 SDK 目录 / 系统权限清单」 | 已在 2026-09-11 补齐两章（`legal-content.uts`） | 上线前核对 SDK 清单与真实依赖一致 |

### 2.2 功能缺口

| # | 项 | 证据 | 影响 |
|---|---|---|---|
| B1 ★★★ | **AI 订单截图识别未接真实模型** | `services/ai/ai-import-service.uts:83-84` 明写「当前未连接视觉模型，请逐项人工确认」；`config/` 下无 endpoint/key 配置 | 产品自定的最高频 AI 能力停在"规则解析 + 人工补全"；需要模型供应商与密钥。选型结论见 §2.5 |
| B4 ★★ | **分享只有"复制文案"** | `utils/share.uts` 头部注释：SDK 未暴露 `onShareAppMessage`、分享到微信需开放平台 AppID | 小程序端缺少唯一的自然增长渠道；接入分享 SDK 后替换 `shareByCopy` 内部实现即可，调用方不用改。配置清单见 §2.6 |
| B5 ★ | **应用内更新只能跳下载页** | `nativeResources/android/AndroidManifest.xml` 无 `REQUEST_INSTALL_PACKAGES`；无 FileProvider 插件 | 详见 `docs/architecture/V2.4-APP-UPDATE-CONTRACT.md` §3 |
| B6 ★ | 提醒通知依赖自定义基座 | `utils/notify.uts` 注释：Android 走自研 `uni_modules/local-notify`，**标准基座下自动降级为应用内 Toast** | 真机验收提醒功能必须用自定义基座打正式包 |

### 2.3 待你决策（不是缺陷，但代码现状与决策不一致）

1. **收藏页仍用瀑布流卡片**（`pages/favorites/index.uvue:35/64` 的 `ProductCard`），
   与工程待办 #10「改单列决策卡」相反 —— 需要视觉决策后才能动。

### 2.4 工程待办状态（沿用 2026-09-11 backlog §5）

| # | 任务 | 现状（2026-09-24 核对） |
|---|---|---|
| 6 | `reminder/edit` 提醒类型分组 | ⬜ 仍是 `slice(0,4)` / `slice(4)` 两行平铺、无分组标题（`pages/reminder/edit.uvue:13,16`） |
| 8 | 消除第 4 份金额实现 | ⬜ `pages/profile/index.uvue:223` 的 `formatAmount` 仍是私有一份（`toFixed(0)`、无万级） |
| 9 | 术语统一（消费日志 / 购买记录 / 订单） | ⬜ 未建词汇表，全站三套词仍在 |
| 10 | 收藏页改单列决策卡 | ⬜ 见 §2.3-1，需先决策 |
| 11 | 首页 Feed 两分支抽公共 hook | ⬜ `pages/home/index.uvue` 仍有 `#ifdef MP-WEIXIN`（`scroll-view`）与 App（`list-view`）两套渲染路径 |
| — | **单元测试** | ✅ **49/49 全绿**。本次修掉 5 条存量断言漂移：`content-flows.test.cjs` 3 条由样例前置契约变更导致（已按"内测期正常"重写）、`transition-followup.test.cjs` 2 条品牌缓存/重试用例生产行为已变（服务层无缓存 → 改断言）；另删掉过期的 `mock-catalog` 测试桩，改为加载真实模块 |
| — | **首页会插 2 条「展示样例」** | ✅ **已落定为预期行为**（内测期）。`services/mock/comparison-products.uts` 的 `SHOW_COMPARISON_PRODUCTS = true`，`services/content/feed-service.uts:126-146` 对每个推荐首页请求前置插 2 条 `sourceLabel: '展示样例'`。开关与测试契约保持一致，**不关**。上线前需复评 |

---

## 2.5 AI 订单截图识别 · 模型选型结论（2026-09-24）

场景特征：**订单截图 → 抽取店铺名 / 商品名 / 金额 / 下单时间 / 规格**。
是"文档/截图结构化抽取"，不是通用视觉问答，评判标准是 **字段级准确率 + 单价**，不是模型名气。

| 优先级 | 模型 | 定位 | 理由 |
|---|---|---|---|
| **首选（免费额度打底）** | **GLM-4.6V-Flash** | 完全免费 | 结构化抽取能力够用，零成本跑通全链路验证；先上线拿真实截图集测准确率 |
| 首选（付费主力） | **GLM-4.6V-FlashX** | 低价版 | 同系列、同 Schema，仅换单价档位，切换零改造成本；量上来后按准确率决定是否升级 |
| 备选 | **Qwen3-VL-30B-A3B** | 开源权重 | 可自部署；MoE 激活参数小、单张图成本低；适合后期数据敏感或需离线时 |
| 备选 | **Doubao-Seed-2.0-Pro** | 国产头部多模态 | 中文票据/订单截图场景强，价格比旗舰低，作为交叉验证第二供应商 |

**结论**：默认走 **GLM-4.6V-Flash（免费）→ GLM-4.6V-FlashX（付费）同一 Schema 双档**，
`services/ai/ai-import-service.uts:83-84` 的「未连接视觉模型」替换为一个可配置的 endpoint + key 即可。
注意：**密钥绝不能写进前端**，必须由后端 `api.sankengcloset.icu` 代理转发（App 包内任何字符串都可被反编译提取）。

## 2.6 分享到微信 · 配置清单

| # | 项 | 说明 |
|---|---|---|
| 1 | 微信开放平台账号 + 应用审核通过 | 拿到 AppID（移动应用）；**分享到微信必须走开放平台，不是公众平台** |
| 2 | 应用签名与包名登记 | 与 `manifest.json` 的 `appid`、`release.keystore` 的签名指纹一致，否则微信拒调 |
| 3 | 微信开放平台 SDK（`uni_modules`） | uni-app x 当前 SDK 未暴露 `onShareAppMessage`，需引入独立分享模块 |
| 4 | iOS 配置 | `LSApplicationQueriesSchemes` 补 `weixin` / `weixinULAPI`；Universal Link 需在开放平台登记 |
| 5 | Android 配置 | 无需额外权限；分享回跳用 `WXEntryActivity` |
| 6 | 小程序端 | 小程序**天然有** `onShareAppMessage`，但需在 `pages.json` 允许；与 App 端是两套实现 |

落地方式：`utils/share.uts` 已把调用方与实现解耦，**只需替换 `shareByCopy` 内部实现**，页面代码不用改。

---

## 3. 验收方式

```bash
node scripts/check-source-gates.js    # 必须 6 组全 PASS
node --test tests/*.test.cjs          # 49/49
```

真机冒烟必测：**通知页在深色模式下的未读/已读卡片对比**（本次修复点）、
关于页「检查更新」（App 端可点、小程序端应整行消失）、
游客点收藏（应提示先登录）、收藏页空态（游客态文案应为"登录后收藏才会保存"）、
提醒通知（需自定义基座）。

