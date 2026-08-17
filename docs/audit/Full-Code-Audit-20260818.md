# 三坑绮橱（sankengcloset）全面代码审计报告

- **审计基准**：远程 `origin/main`，commit `074185e`（feat: 功能补全与视觉统一）
- **审计日期**：2026-08-18
- **审计方式**：只读静态分析（未修改任何业务代码）；所有结论已核实到「文件:行号 + 代码片段」粒度
- **技术栈**：uni-app x，vapor 模式，目标平台 App-Android / iOS / 小程序（微信）/ Web / 鸿蒙
- **规模**：317 个跟踪文件（75 个 .uvue / 78 个 .uts），13 个 store，5 个 service 目录

---

## 修复执行记录（2026-08-18 同日）

本报告所列 **51 项问题（11 高危 / 26 中风险 / 14 低风险）已全部处置**，分 9 个独立提交合入 main（相对审计基准 074185e 的净变更：约 +1050 / -2600 行，删除 12 个死文件，新增 10 个源文件）：

| 提交 | 内容 | 覆盖项 |
|---|---|---|
| `9dbfa95` | 阶段 A 纯 Bug 修复 | H2 H4 H10(误报核销) M1 M2 M3 M4 M5 M8 M12 M13 M14 M15 L1 L2 |
| `c82863b` | 阶段 B 同步层与内存 | H1 M6 M7 M9 M26 |
| `b0427d9` | 阶段 C 主题与渲染性能 | H3 H5 M10 + 门禁修正 |
| `5718e34` | 阶段 D 死代码清理与合规 | H6 H7 H8 H9 M20 M21 M22 L3 L4 L8 L9 L10 L11 L12 L14 |
| `cc5ec1f` | 阶段 E(1) CRUD 模板/双写/格式化 | E2 E3 E4a (M16 M17 M18 M19 部分) |
| `537449a` | 阶段 E(2) AI导入/token/缓存 | E1(ai-import) E6 E7 (H11 M11 M24 部分) |
| `44dbce1` | 阶段 E(3) 页面直连收敛 | H11(全) E1(全) |
| `d9cd4fa` | 阶段 E(4) FeedBlock 组件化 | E4b (M19 完成) |
| `7b15853` | 阶段 E(5) 样式魔法值收敛 | E5 (M23 限定范围) |

**关键说明**：
- **H10（onPageScroll 签名）**：深查后确认「三页 `(top:number)` vs 首页 `(e:UniScrollEvent)`」源于滚动来源不同（MainLayout emit number vs 原生 scroll-view 事件对象），**非 bug，无需修改**，已核销。
- **H1（同步队列）**：7 类无重放端点实体改为「存档降级」（`v21_sync_dropped` 上限 100 条可 `drainDroppedOperations` 恢复），不再永久保留。
- **待运营**：`LEGAL_ENTITY` 等 5 个法律常量（H9）与微信合法域名配置（H7）代码已落地，发布前需运营填值/配置——发布门禁 `LEGAL_RELEASE=1 npm run check` 会强制拒绝占位符。
- **需真机回归**：小程序深色系统监听（C1）、vapor 主题 getter 追踪（C2）、token 混淆登录链路（E7）、页面收敛后的业务回归（E1）。

---



## 0. 平台特性前提（结论判定依据）

| 平台 | 关键约束 |
|---|---|
| vapor 模式 | 模块顶层 `ref()/computed()` 无活跃 effect scope，`n.value` 返回 undefined（项目已用 `reactive + getter` 规避，见 `theme/use-theme.uts:1-11`）；所有 UTS 编译为 JS |
| UTS | 要求显式类型，不支持 JS 泛型宽松写法；`any` 会削弱类型检查 |
| App-Android/iOS | 原生渲染；`setAppTheme` 需显式设置 appTheme，仅改页面 token 不驱动原生 UI；`onOsThemeChange` 仅 App 端可用；页面栈上限 10 层；tabBar 页只能用 `switchTab` |
| MP-WEIXIN | `darkmode:true` 需 `theme.json` 变量 + `onAppThemeChange/onThemeChange` 监听；tabBar 深色图标需 `darkIconPath`；`urlCheck` 控制合法域名校验 |
| Web | `getAppBaseInfo().hostTheme` 支持有限、无 `onOsThemeChange`，深色模式系统跟随能力弱 |
| 鸿蒙（HarmonyOS） | 编译特性与 App-Android 类似但系统主题 API 存在差异，需条件编译兜底 |

---

## ① 风险汇总清单（风险等级 + 问题位置 + 影响）

### 高危（H1–H11）

| # | 位置 | 问题简述 | 影响 |
|---|---|---|---|
| H1 | `services/sync/local-sync-queue.uts:86-114,120-140` + 7 处入队点 | 同步队列对不支持重放的实体（`outfit`/`post_like`/`brand_follow`/`wish`/`notification_read`/`ai_import_confirmation`/`budget`，见 `content-library-store.uts:466,488,491,526,551,554,576,579`、`notification-center-store.uts:100,108`、`ai-import-store.uts:59-65`、`budget-store.uts:50-55`）**永久保留**，`retryCount` 无上限、无 TTL、无清理入口 | 队列随离线操作无限膨胀；每次 App 前台恢复（`App.uvue:26,32`）、网络恢复、登录后都会全量读取重放，storage 占用与同步耗时线性增长，直至触发平台存储配额 |
| H2 | `services/ai/ai-import-service.uts:27` | 商品链接正则 `/id=(\\d+)/` 等在正则字面量中写了 `\\d`（双重转义），匹配的是「反斜杠+d」字面量而非数字 | 淘宝/闲鱼/拼多多链接的 `productId` 永远提取不到，AI 导入商品关联能力完全失效（运行级 bug） |
| H3 | `theme/use-theme.uts:166-182` | 系统主题监听仅在 `#ifdef APP` 分支注册 `onOsThemeChange`；MP-WEIXIN 分支依赖一次性 `getAppBaseInfo().hostTheme`（:44-45），**未注册** `uni.onThemeChange`/`onAppThemeChange` | 微信端「跟随系统」模式下切换手机深色主题，`_state.isDark` 保持旧值，页面内所有运行时色值不更新（仅原生导航栏色被 `applySystemChrome` 手动同步）——本项目已知痛点在非 App 端未根治 |
| H4 | `pages/notification/index.uvue:63-68` + `stores/notification-center-store.uts:36` | 通知跳转：`actionTarget='/pages/favorites/index'`（tabBar 页，`pages.json:211`）却走 `uni.navigateTo`，仅对 community 特判了 `openPrimaryTab`（switchTab），favorites 漏判 | App 端 navigateTo 跳 tabBar 页失败，「降价通知」点击无响应；小程序端行为也不符合 tabBar 跳转规范 |
| H5 | `pages/home/index.uvue:43,104` + `stores/home-feed-store.uts:318` | `store.masonryBlocks` 是普通 getter，每次访问都执行 `masonryBlocks()` 全量重建（`new MasonryBlock()` + 左右列分配 + `filterFeedByChannel` + 品牌黑名单过滤）；滚动触发 `onPageScroll`（home/index:199-203）写 `lastScrollTop` 导致整页重渲染 | Feed 越长开销越大，滚动/点赞/收藏等任意响应式状态变化都触发全量块重建，App 端滚动卡顿 |
| H6 | 项目根目录 `release.keystore` | Android 发布签名密钥文件实体存在于项目根目录（.gitignore:37 已忽略 git，但文件随项目目录存在） | 密钥一旦随备份/分发/上传泄露，攻击者可伪造签名 APK 实施升级劫持 |
| H7 | `manifest.json:16-18` | mp-weixin `"setting": { "urlCheck": false }` 关闭合法域名校验 | 若随正式发布，客户端可请求任意域名（配合反编译篡改可做钓鱼/数据劫持），且微信审核对非白名单域名有限制 |
| H8 | 全项目（缺失） | 无首次启动隐私政策弹窗 + 同意记录，仅「我的→关于」深层页有入口 | App 上架（Android 隐私合规、iOS 商店）与微信小程序均要求首次收集信息前弹窗征得同意，存在上架驳回与监管风险 |
| H9 | `pages/about/legal-content.uts:16,146,167,97,198-201` | 用户协议/隐私政策含 `[运营主体名称]`/`[云服务商名称]`/`[监管部门名称]`/`[生效日期]`/`[主体名称占位]` 等未填写占位符 | 上架审核必然要求真实运营主体、联系方式、生效日期，占位符导致审核驳回；也是法律合规瑕疵 |
| H10 | `pages/wardrobe/index.uvue:115`、`pages/search/index.uvue:137`、`pages/favorites/index.uvue:111` vs `pages/home/index.uvue:199` | `onPageScroll` 签名不统一：三个页面写 `function onPageScroll(top: number)`，首页写 `function onPageScroll(e: UniScrollEvent)`；前者把滚动值当 number 直接使用 | uni-app x 中 `onPageScroll` 回调实参为滚动事件对象，`top` 实为事件对象时 `top > 300` 判断在部分平台恒假/报错，返回顶部按钮可能失效 |
| H11 | 8 个页面直连 services（`pages/search/index.uvue:125`、`pages/product/detail.uvue:84,98`、`pages/brand/index.uvue:26`、`pages/brand/detail.uvue:63`、`pages/purchase/import.uvue:47-48`、`pages/purchase/edit.uvue:72`、`pages/share/create.uvue:103`） | 页面直接 import `@/services/*` 绕过 store 层；而 `stores/ai-import-store.uts` 恰好为 AI 导入准备了 store 却无人使用 | 同一应用两种数据流（store 中介 vs 页面直连）并存，loading/error/缓存/登录态规则混乱，AI 导入的 store 层成为死代码 |

### 中风险（M1–M26）

| # | 位置 | 问题简述 | 影响 |
|---|---|---|---|
| M1 | `stores/home-feed-store.uts:237` | Feed `loadMore` 无上限追加 `_state.allItems = [..._state.allItems, ...page.items]`，模块级单例永不释放 | 持续上拉内存无限增长（URL/字段常驻），低端 Android 易 OOM |
| M2 | `components/layout/MainLayout.uvue:39-44` + home/search/wardrobe/favorites 4 页 | `@scroll` 事件每帧触发，`onScroll` 每帧 emit → 页面每帧写 `lastScrollTop.value`（值每帧不同）→ 整页响应式重渲染 | 滚动时无谓的每帧重渲染，是 App 端滚动耗电/卡顿主因之一；`lastScrollTop` 仅回顶时使用 |
| M3 | `pages/community/index.uvue:174-180`、`pages/wardrobe/index.uvue:175`、`pages/favorites/index.uvue:164` | `onShow`/`onPageShow` 每次切 tab 触发网络请求（圈子 2 个、收藏逐条拉详情），无 TTL 节流（对比 profile 页有 30s TTL） | 频繁切 tab 产生多余流量与请求压力 |
| M4 | `pages/purchase/edit.uvue:147-160`、`pages/budget/index.uvue:66-68`、`pages/wardrobe/edit.uvue:121` | 金额/预算输入无上限校验：`parseFloat("1e309")`→`Infinity`，`Infinity > 0` 为 true，`Math.round(Infinity*100)` 入库；负数静默转 0；衣橱价格单位「元」与订单「分」不统一 | Infinity/超大数值入库后 `toFixed`/进度条渲染异常；跨模块金额单位换算易错位 |
| M5 | `pages/reminder/edit.uvue:214-219,238` | 日期选择器 2 月固定 29 天（非闰年可选 2/29）、年份固定当前年（12/31 建次年提醒年份错）、`initDateTimePicker:221-231` 对非法日期无容错（parseInt 产出 NaN 下标） | 提醒日期错位（2/29 溢出到 3/1、跨年尾款提醒年份错误） |
| M6 | `stores/content-library-store.uts:357-376,382-404` | 收藏乐观更新与远程回填/刷新竞态：回填回调按 productId 匹配第一个 entry，取消→重收可能写错 itemId；`refreshRemoteFavorites` 服务端快照整体覆盖可能与本地乐观收藏并发 | 「收藏了但刷新后消失」、itemId 错位导致取消收藏失效 |
| M7 | `pages/profile/index.uvue:158-171` + purchase/wardrobe/reminder store fetch | 切账号/登出瞬间多 store 并发 fetch 无请求序号防护 | 旧账号请求晚返回会覆盖新账号状态（数据串号） |
| M8 | `pages/home/index.uvue:245`、`pages/discover/index.uvue:136`、`pages/purchase/detail.uvue:177` | 路由 URL 参数 `category`、`purchaseDate` 未 `encodeURIComponent` | 值含 `&`/`?`/空格时参数被拆解污染，跳转目标错误 |
| M9 | `utils/notify.uts:39-58` + `stores/reminder-store.uts:210,288-315` | `uni.createPushMessage` 无取消/去重接口；编辑提醒、`syncPurchaseReminders` 反复调度同一条目 | 同一提醒多次编辑叠加多条相同通知，删除提醒后已调度通知不撤销，通知重复轰炸 |
| M10 | `theme/use-theme.uts:265-266` + `pages/preferences/appearance.uvue:36-37` | `isDark`/`themeMode` 用**普通对象 getter** 间接读 reactive `_state` 字段，vapor 下依赖收集是否生效存疑 | 若失效，外观页 AppSwitch 状态、所有使用 `isDark.value` 的组件（StatusChip:20、profile:179 等）切主题后不刷新——需真机验证 |
| M11 | `config/runtime.uts:85-86` | access/refresh token 明文存 uni storage | root/越狱设备可直接读取，refresh token 泄漏可长期维持会话 |
| M12 | `stores/reminder-store.uts:38,58,63,74`、`stores/wishlist-store.uts:305` | `new Date().toISOString().split('T')[0]` 取的是 **UTC 日期** | UTC+8 本地 0:00-7:59 之间「今日提醒/逾期判断」算成前一天 |
| M13 | `services/sync/local-sync-queue.uts:27-28` | `op.retryCount = parseInt(...) ?? 0`：parseInt 失败返回 NaN，`??` 对 NaN 不生效；`op.status = readString(...) ?? SYNC_PENDING`：readString 恒返回 string，`??` 永不生效 | storage 污染时 retryCount 变 NaN 回写，重试逻辑异常；空字符串 status 覆盖默认值 |
| M14 | `utils/feedback.uts:11` | `showFeedback` 每次调用新建 1.8s `setTimeout`，连续触发时 timer 堆积 | 高频调用（点赞连点）累积数十个 timer，轻微内存滞留 |
| M15 | `services/sync/local-sync-queue.uts:17-23`、`budget-store.uts:43-44`、`notification-center-store.uts:87-89` | 批量 `setStorageSync` 无 try/catch 容错 | storage 配额满时抛异常中断入队/保存流程 |
| M16 | `stores/home-feed-store.uts:23-29`（formatPrice）/ `domain/purchase-presenter.uts:67-69`（formatCents）/ `domain/wish-presenter.uts:75-78`（formatPrice） | 金额格式化 3 套实现，结果不一致（`¥128` vs `¥128.00`），且 UI 工具函数放在 store 层被 7 个页面 import | 同一金额在不同页面展示不一致；工具方法错位 |
| M17 | `domain/purchase-presenter.uts:37-53`、`domain/reminder-presenter.uts:90-115`、`stores/home-feed-store.uts:32-66`、`utils/notify.uts:25-33`、`domain/wish-presenter.uts:80-87` | 日期格式化 5 处散落实现 | 重复代码、行为不一致、难维护 |
| M18 | `stores/wardrobe-store.uts`/`purchase-store.uts`/`wishlist-store.uts`/`reminder-store.uts` | 4 个 store 重复同一模式：fetch 模板、「远程直写+失败入队」12+ 次、`mapRemoteXxx` 逐字段手写映射 4 份；`services/platform/api-client.uts:169-211` 5 个 `apiXxxAuthorized` 方法逻辑雷同 | 改动一处需同步 4-5 处，易漏改引入不一致 |
| M19 | `pages/home/index.uvue:37-156` | `#ifdef MP-WEIXIN`（scroll-view）与 `#ifndef MP-WEIXIN`（list-view）**两套几乎相同的模板**，约 120 行重复 | 任何卡片样式修改要改两处，极易漏改导致平台表现不一致 |
| M20 | `components/base/AppEmptyState.uvue`、`AppBadge.uvue`、`AppTag.uvue`、`AppButton.uvue`、`components/layout/TabLayout.uvue`、`AppPageContainer.uvue`、`components/business/WardrobeCard.uvue`、`PurchaseCard.uvue` | 8 个组件零 import 引用（已全项目 grep 验证） | 死代码随包打包；与 V3 组件（PageState 等）功能重叠，易误用 |
| M21 | `stores/ai-import-store.uts`、`pages/dev/device-diagnostics.uvue`（378 行）、`pages/dev/feed-spike.uvue`（376 行） | `useAiImportStore()` 零引用；两个 dev 测试页未在 pages.json 注册（仅 `pages/dev/design-system-v3` 注册于 pages.json:178，且注释自称「不进入正式路由」） | 合计 750+ 行测试代码随主包打包（小程序主包体积），无法路由访问 |
| M22 | 13 个 store（如 `wardrobe-store.uts:123-124`） | 每个 store 维护 `uni.$emit(CHANGE_EVENT)`，但全项目 `uni.$on`/`uni.$off` 匹配 **0 处** | 伪事件总线死代码，误导后续开发者以为有事件驱动刷新；未来误用 `uni.$on` 未 `$off` 还会引入真实泄漏 |
| M23 | `pages/home/index.uvue:279-283`、`pages/profile/index.uvue:178-239`、`pages/product/detail.uvue:231-299`、`pages/community/index.uvue:201-216` 等全页面 | 样式对象一律 `computed((): any => ...)` + 魔法 rpx（如 product/detail.uvue:265 步骤条 `Math.round(257*...)`），未落 theme token | 类型全 any、色值/尺寸魔法数散落、深色切换需逐处改 computed、V2/V3 两套 token 并存（`theme/tokens/responsive.uts`） |
| M24 | `pages/profile/index.uvue:123-153`、`pages/community/index.uvue:181-194` | 页面直接操作 storage（8 个缓存 key 清理）、用 `uni.getStorageSync('community_view')` 跨页传参 | 存储实现泄漏到 UI 层；跨页传参方式脆（无类型、易残留脏值） |
| M25 | `stores/preferences-store.uts:143` | 偏好远程上报固定 `themeMode: 'system'` | 无论用户实际主题，上报数据失真，多端同步后主题不一致 |
| M26 | `stores/content-library-store.uts:382-404,471-495` | 多端（手机+小程序）本地收藏/关注与服务端快照无冲突合并策略 | A 端本地新收藏可能被 B 端 `refreshRemoteFavorites` 服务端旧快照覆盖丢失 |

### 低风险（L1–L14）

| # | 位置 | 问题简述 | 影响 |
|---|---|---|---|
| L1 | 5 个编辑页（`pages/wardrobe/edit.uvue:143,145`、`share/create.uvue:171,186`、`reminder/edit.uvue:337,347`、`purchase/edit.uvue:190`、`budget/index.uvue:72`）+ `pages/dev/feed-spike.uvue:205` | 保存成功后延迟 `navigateBack` 的 `setTimeout` 未清理 | 页面随即卸载，泄漏窗口极小，低风险 |
| L2 | `pages/product/detail.uvue:197-218` | `loadDetail` 于 `onMounted` 发起，页面卸载后 resolve 仍写已销毁实例的 ref（无卸载标志位） | 极小的幽灵写入，App 端偶发 |
| L3 | home/discover/favorites/notification 混用 `onPageShow`，其他页用 `onShow`；home 同时挂 onMounted+onReady+onLoad+onPageShow | 生命周期风格不统一 | 刷新时机行为不一致，易引入时序 bug |
| L4 | `services/platform/api-client.uts:240-258` | `readFileAsArrayBuffer` 将整图读入内存上传（大图数 MB） | 一次性占用，低风险 |
| L5 | `theme/use-theme.uts:39-51` | Web 端依赖 `getAppBaseInfo().hostTheme`（支持存疑）、无系统主题监听 | Web 端跟随系统深色大概率失效 |
| L6 | `pages.json:197-228` tabBar list | 无 `darkIconPath`（mp-weixin.darkmode:true 已开） | 微信深色模式 tabBar 仍浅色图标，对比度差 |
| L7 | `pages/about/legal-content.uts:113-118` | 隐私政策宣称不收集设备标识，但 `session-store.uts:124` 采集 `deviceId` | 政策与实现需核对授权提示 |
| L8 | `scripts/upload.js:5-9` | 构建脚本硬编码小程序 appid `wx976f673896c8b565` 与服务器私钥路径 `/home/admin/.../.wechat/private.key`（私钥文件已被 .gitignore 忽略，仅路径泄露） | 路径信息泄露服务器目录结构，脚本分发需脱敏 |
| L9 | `stores/home-feed-store.uts:23-29` | `formatPrice` 对 NaN：`NaN <= 0` 为 false，最终渲染 `¥NaN` | 接口字段类型漂移时展示脏数据 |
| L10 | `stores/preferences-store.uts:31`、`services/content/feed-service.uts:71-74`、`search-service.uts:25` | storage 迁移数据形状无类型守卫；响应 `data` 非数组时静默空结果 | 掩盖协议错误（不崩溃但数据为空） |
| L11 | `App.uvue:35`、`utils/tab-navigation.uts:2-9`、`uni.scss`（76 行模板变量）、`stores/sync-store.uts:35` | `onAppHide(() => {})` 空回调；条件编译两分支代码完全相同；uni.scss 模板残留；`_state.online = true` 恒真 | 死代码/模板残留 |
| L12 | `types/sort.uts`（38 行）、`domain/clothing-category.uts`（51 行） | 零引用类型/常量文件；`CATEGORY_LABELS_CLASS` 与 `CATEGORY_LABELS` 同一映射定义两遍；store 却用魔法字符串 `currentSort: 'newest'` | 死代码 + 分类映射 3 份重复（wardrobe-store:32、wardrobe/index:128、clothing-category 未用） |
| L13 | `pages/wardrobe/index.uvue:150-158` vs `stores/home-feed-store.uts:78-89` | 瀑布流图片高度哈希函数复制两份（同一算法） | 重复代码，注释已自述一致，属可合并 |
| L14 | `stores/purchase-store.uts:81-107` | `toRemotePayload` 双写 `totalCents`/`totalAmount`（legacy 兼容） | 接口契约双写，字段不一致时静默脏数据 |

### 已达标项（正面确认，无问题）

- `setInterval` 全部正确清理（community/index、community/mine 的 60s 时钟在 onHide/onUnload 清理）
- 无 `uni.$on`/`addEventListener` 泄漏；`theme/use-theme.uts:166-192` 的 `onOsThemeChange` 成对 `off`
- 无循环依赖；全部 66 处 `v-for` 均有 `:key`
- 搜索 400ms 防抖 + `searchSequence` 过期请求丢弃；Feed `_requestSeq` 竞态防护；`loadMore` 防重入
- 图片全量 lazy-load（AppImage 默认 + v3 卡片）；storage 读取不在渲染中执行
- 401 单飞刷新（`api-client.uts:133-177`）、JSON.parse 均有 try/catch、Promise 链普遍有 .catch
- 运行时代码无 `console.log` 打印 token/用户信息；无 web-view/rich-text/eval/注入面

---

## ② 逐项修复方案（可直接落地）

> 以下每项给出修改文件、改动点与代码思路。标注「短=短期快速修复（当天可完成）」/「中=中期」。

### H1 同步队列无限堆积（高危）

- **修改**：`services/sync/local-sync-queue.uts`
- **方案**（中）：
  1. 增加重试上限 + TTL 淘汰：`flushRemote` 失败分支中 `if (op.retryCount >= MAX_RETRY(3) || now - op.createdAt > 7d) { removeOperation(ids[i]); continue }`（丢弃前可写一条失败日志 key）。
  2. 补全 7 类实体的重放实现，或在 `replayOperation` 对不支持实体**显式声明为「终态失败→可淘汰」**：把 `return false`（永久保留）改为 `return true`（视为已处理/跳过）并配合第 1 条淘汰，避免下次 App 前台恢复重读。
  3. `writeOperation`/`writeIds` 增加 try/catch（见 M15）。
- **验证**：离线连发 5 条 post_like/budget → 重启 App → `readPendingOperations()` 为空，storage key 全部清除。

### H2 商品链接正则 `\\d` 双重转义（高危，运行级 bug）

- **修改**：`services/ai/ai-import-service.uts:27`
- **方案**（短）：
  ```ts
  const patterns = [/id=(\d+)/, /itemId=(\d+)/, /goods_id=(\d+)/, /[?&]id=(\d+)/]
  ```
- **验证**：`parseCommerceLink('https://item.taobao.com/item.htm?id=12345678')` 应得 `productId='12345678'`。

### H3 小程序端 system 深色模式无系统监听（高危，已知痛点）

- **修改**：`theme/use-theme.uts`
- **方案**（中）：
  1. 在 `enableSystemThemeListener` 增加 MP-WEIXIN 分支：
     ```ts
     // #ifdef MP-WEIXIN
     uni.onAppThemeChange?.(() => { syncFromGlobal(); applySystemChrome(); syncTabBarChrome() })
     // #endif
     ```
     （uni-app x 支持 `uni.onThemeChange`；App 端已用 `onOsThemeChange`，小程序端按框架实际 API 二选一，需查 `uni-app-x/types`。）
  2. `getSystemDark` 的 MP-WEIXIN 分支保持 `hostTheme` 作为初始化读取，监听负责后续刷新。
  3. Web 端降级为仅支持手动三态（见 L5）。
- **验证**：微信开发者工具「渲染模式→深色」，appearance 页切「跟随系统」，返回首页色值实时变化。

### H4 通知跳 tabBar 页误用 navigateTo（高危）

- **修改**：`pages/notification/index.uvue:63-68`
- **方案**（短）：统一路由出口：
  ```ts
  function openNotice(id: string, target: string) {
    notices.markRead(id)
    if (target === '') return
    const tabPages = ['/pages/home/index', '/pages/discover/index', '/pages/favorites/index', '/pages/community/index', '/pages/profile/index']
    if (tabPages.indexOf(target) >= 0) openPrimaryTab(target)
    else uni.navigateTo({ url: target })
  }
  ```
- **验证**：构造一条 `actionTarget='/pages/favorites/index'` 通知，点击应切到收藏 tab。

### H5 首页瀑布流全量重建（高危）

- **修改**：`stores/home-feed-store.uts:318`（getter）与 `:164-190`（masonryBlocks）
- **方案**（中）：
  1. 增加缓存签名：`let _blocksCache: MasonryBlock[] | null = null; let _blocksSig = ''`。
  2. `masonryBlocks()` 改为 `buildBlocks()`，签名 `= `${_state.currentChannel}|${_state.allItems.length}|${prefs.buildPrefSignature()}|${blacklistVersion}``，签名不变时返回 `_blocksCache`，`loadFirstPage/loadMore/setChannel/toggleLike/toggleSave` 写数据后清空缓存。
  3. 页面侧 `store.masonryBlocks` 改为 `computed(() => store.masonryBlocks)`（getter 缓存语义）。
- **验证**：滚动 100 次 profile 火焰图，masonryBlocks 仅在数据变更时执行。

### H6 release.keystore 位置（高危，运维）

- **方案**（短）：将 `release.keystore` 移出项目目录（如 `C:\Users\dddd\Desktop\keystores\`），本地备份 keystore 密码，git 保持忽略；不在报告中包含任何密码/别名。

### H7 mp-weixin urlCheck（高危）

- **修改**：`manifest.json:16-18`
- **方案**（短）：发布前将 `urlCheck` 改为 `true`，并在微信公众平台配置 request/uploadFile 合法域名（`/api/*` 对应服务器域名）；开发期可用「开发环境不校验」开关。

### H8 首次启动隐私弹窗（高危，合规）

- **方案**（中）：新建 `components/base/PrivacyDialog.uvue`，`App.uvue onLaunch` 检查 `v2_privacy_agreed` 未同意则展示；同意写 storage；「不同意」退出。内容引用 `legal-content.uts` 现有条款。小程序端配合 `wx.getPrivacySetting`/`wx.requirePrivacyAuthorize`（微信隐私保护指引）使用（需条件编译）。

### H9 法律文本占位符（高危，合规）

- **修改**：`pages/about/legal-content.uts` 全部占位符（:16,97,146,167,198-201）
- **方案**（短）：由运营方补充真实运营主体名称、统一信用代码/联系方式、生效日期、云服务商名称；代码侧可抽常量 `const LEGAL_ENTITY = '...'` 统一替换。

### H10 onPageScroll 签名不统一（高危）

- **修改**：`pages/wardrobe/index.uvue:115`、`pages/search/index.uvue:137`、`pages/favorites/index.uvue:111`
- **方案**（短）：统一为 `function onPageScroll(e: UniScrollEvent) { const top = e.detail.scrollTop; ... }`（与 home/index:199 一致），并核对 `UniScrollEvent` 类型来自 `uni-app-x` 全局类型。
- **验证**：三个页面下拉后 BackToTop 按钮显示；App/小程序真机各验一次。

### H11 页面绕过 store 直连 services（高危，架构）

- **方案**（中）：分批收敛——优先将 `purchase/import.uvue` 迁到 `ai-import-store`（store 已存在），`search/brand/product` 页面补轻量模块级 store 或统一复用现有 store 的 loading/error 语义；短期至少统一封装 `services/content/*` 为带缓存/错误封装的函数，禁止页面直接 `uni.request`。

### M1 Feed 无限增长（中）

- **修改**：`stores/home-feed-store.uts:237`
- **方案**（短）：`if (_state.allItems.length > 200) _state.allItems = _state.allItems.slice(_state.allItems.length - 200)`（截断最旧），配合 hasMore 逻辑。

### M2 scroll 事件每帧触发（中）

- **修改**：`components/layout/MainLayout.uvue:39-44` + 4 个页面
- **方案**（短）：MainLayout `onScroll` 内节流——记录 `lastEmit = Date.now()`，`now - lastEmit >= 80ms` 才 `emit('scroll', top)`；页面侧 `onPageScroll` 仅更新 `lastScrollTop`（改为非响应式普通变量或节流写 ref），避免每帧触发响应式更新。

### M3 onShow 重复请求（中）

- **修改**：`pages/community/index.uvue:174-180`、`pages/wardrobe/index.uvue:175`、`pages/favorites/index.uvue:164`
- **方案**（短）：复用 profile 页 30s TTL 模式——模块级 `let lastFetchAt = 0`，`Date.now() - lastFetchAt < 30000 && 已有数据` 则跳过网络请求。

### M4 金额/数值边界校验（中）

- **修改**：`pages/purchase/edit.uvue:147-160`、`pages/budget/index.uvue:66-68`、`pages/wardrobe/edit.uvue:121`
- **方案**（短）：统一数值校验函数（可放 `utils/`）：
  ```ts
  export function parseMoneyStr(raw: string, max: number = 9999999): number {
    const v = parseFloat(raw.trim())
    if (isNaN(v) || !isFinite(v)) return 0
    if (v < 0) return 0
    if (v > max) return 0
    return Math.round(v * 100)
  }
  ```
  purchase 金额 `isFinite(total)` 判断 + 上限；衣橱价格与订单统一「分」语义或至少注释明确单位。

### M5 提醒日期选择器（中）

- **修改**：`pages/reminder/edit.uvue:214-219,238`
- **方案**（短）：
  1. `getDaysInMonth` 用 `new Date(year, month, 0).getDate()` 计算当月天数（含闰年），删除固定 29。
  2. picker 增加年份列，`onDateTimeChange` 用选择的年份，不再固定 `new Date().getFullYear()`。
  3. `initDateTimePicker` 对 `parseInt` NaN 结果做 `isNaN` 兜底。

### M6 收藏乐观更新竞态（中）

- **修改**：`stores/content-library-store.uts:357-376`
- **方案**（中）：回填回调改为「按 productId 匹配且 `itemId==''` 的第一条」并记录本次操作的 `opSeq`；`refreshRemoteFavorites` 改为与本地未同步条目合并（服务端快照 ∪ 本地待同步），或用 `syncFavoriteIds` 对账。

### M7 切账号并发 fetch（中）

- **修改**：purchase/wardrobe/reminder store 的 fetch
- **方案**（中）：各 store 增加 `_fetchSeq`，fetch 前后比对，过期丢弃；登出时统一 `++_fetchSeq`（在 `session-store` 登出路径调用）。

### M8 路由参数编码（中）

- **修改**：`pages/home/index.uvue:245`、`pages/discover/index.uvue:136`、`pages/purchase/detail.uvue:177`
- **方案**（短）：所有 query 参数统一 `encodeURIComponent()`。

### M9 本地通知去重（中）

- **修改**：`utils/notify.uts:39-58` + `stores/reminder-store.uts`
- **方案**（中）：`scheduleReminderNotification` 增加 dedupe key 参数（如 `reminder-${id}`），`createPushMessage` 的 `payload` 中带 key；App 端本地 push 无法撤销时，改为「先查询已推送、命中同 key 不重复调度」（依赖 push 模块能力），或降级为编辑时先 `clearPushMessage`（uni-app x 若支持）；至少对同一 reminder 的 `scheduleFor` 增加防重入（调度前比对上次调度时间戳）。

### M10 isDark/themeMode vapor 追踪（中，需真机验证）

- **修改**：`theme/use-theme.uts:265-266`
- **方案**（中）：改为直接暴露 `_state` 上的响应式字段，或验证后提供 Vue `computed` 包装：
  ```ts
  import { computed } from 'vue'
  export const isDark = computed(() => _state.isDark)
  export const themeMode = computed(() => _state.themeMode)
  ```
  注意 vapor 模块级 computed 需确认有活跃 effect scope（项目注释已说明模块级 ref/computed 不可用），若不可行则保持 getter 但**验证页面切主题刷新**，并在外观页 `setThemeMode` 后显式 `nextTick` 强制刷新已打开页面。

### M11 token 明文存储（中）

- **方案**（中）：改用 `uni.setStorageSync` 前加密（如 AES，密钥内置）或转用安全存储插件（UTS 插件）；短期至少缩短 refresh token 有效期、登录后清理旧 token。

### M12 UTC 时区差一天（中）

- **修改**：`stores/reminder-store.uts:38,58,63,74`、`stores/wishlist-store.uts:305`
- **方案**（短）：改为本地日期：
  ```ts
  function localToday(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  ```
  可放 `utils/` 供 5 处共用（与 M17 一并收敛）。

### M13 retryCount/status 解析（中）

- **修改**：`services/sync/local-sync-queue.uts:27-28`
- **方案**（短）：
  ```ts
  const r = parseInt(readString(key(id, 'retry')))
  op.retryCount = isNaN(r) ? 0 : r
  const s = readString(key(id, 'status'))
  op.status = s === '' ? SYNC_PENDING : s
  ```

### M14 feedback timer 堆积（中）

- **修改**：`utils/feedback.uts:11`
- **方案**（短）：模块级单例 timer：
  ```ts
  let hideTimer: number | null = null
  // showFeedback 内：if (hideTimer != null) clearTimeout(hideTimer); hideTimer = setTimeout(...)
  ```

### M15 storage 写无容错（中）

- **修改**：`local-sync-queue.uts:17-23`、`budget-store.uts:43-44`、`notification-center-store.uts:87-89`
- **方案**（短）：`writeOperation` 包 try/catch，失败时返回 false 并跳过该 op（不中断队列其余操作）。

### M16/M17 金额/日期格式化收敛（中）

- **方案**（短→中）：新建 `utils/format.uts`，统一 `formatPriceCents(cents)`（含万单位，与现有 feed 语义一致）、`formatDate/formatRelativeTime/formatDeadline/localToday`；删除三套实现，7 个页面 import 改指向 utils；`domain/*-presenter` 只保留纯实体。

### M18 store CRUD 模板重复（中）

- **方案**（中）：抽 `domain/repositories` 公共 `createWriteGuard`（远程直写 + 失败入队）与 `mapRemote` 工具；`api-client` 5 个 Authorized 方法合并为一个 `apiAuthorized(method, path, payload?)` 内部 dispatch。

### M19 首页条件编译双写（中）

- **方案**（中）：把瀑布流卡片主体抽为 `components/v3/FeedMasonryList.uvue`（内部 list-item 布局差异用 props `platform-list` 或条件编译收敛到组件内部），home 页仅保留容器差异；短期至少把卡片 `<view v-for="item in block.left">` 两列模板抽成子组件 `FeedColumn.uvue`。

### M20/M21 死代码清理（中）

- **方案**（短）：删除 8 个零引用组件、`pages/dev/device-diagnostics.uvue`、`pages/dev/feed-spike.uvue`；将 `pages/dev/design-system-v3` 移出 pages.json（或加注释 + 打包前脚本剔除）；删除 `stores/ai-import-store.uts` 或将其接入 `purchase/import.uvue`（推荐接入，见 H11）。

### M22 伪事件总线（中）

- **方案**（短）：删除 13 个 store 的 `uni.$emit` 与 CHANGE_EVENT 常量（无监听者，纯死代码）。若未来需要跨 store 通知，改用显式依赖（store A 调 store B 的 action）或 pinia 式 subscribe。

### M23 样式系统落地 token（中）

- **方案**（中）：将页面 `computed((): any => ...)` 中重复的色值/尺寸收敛到 theme token（`theme/tokens/responsive.uts` 现有 V3 体系），补删 V2 重复 token；`product/detail.uvue:265` 的 257 魔法宽度提取常量并注释；长期用类型 `Styles` 替代 `any`。

### M24 页面直读 storage（中）

- **方案**（中）：profile 缓存清理改为调用 store/service 的封装方法；community 跨页传参改用 store（`community-store` 记录选中 post）或 URL query 编码。

### M25 偏好上报硬编码主题（中）

- **修改**：`stores/preferences-store.uts:143`
- **方案**（短）：改为 `themeMode: getThemeMode()`（从 `theme/use-theme.uts` 读当前实际模式）。

### M26 多端收藏冲突（中）

- **方案**（中）：`refreshRemoteFavorites` 合并策略：本地待同步（未回填 itemId 或本地队列存在 pending favorite）条目并入服务端快照后再写回；或收藏删除走服务端权威 + 本地乐观回滚。

### 低风险项 L1–L14 修复要点

- L1：编辑页 `setTimeout` 前判断页面存活（`getCurrentPages()` 非空）或统一用 `onUnload` 清理。
- L2：`product/detail.uvue` 增加 `let unmounted = false; onUnload(() => { unmounted = true })`，resolve 后判空。
- L3：统一基准为 `onLoad + onPageShow`（App 与小程序均稳定），home 页收敛为 onPageShow 单一数据源。
- L4：上传前 `uni.getFileInfo` 判断大小，>2MB 提示压缩（`uni.compressImage`）。
- L5：Web 端仅支持手动三态 + `prefers-color-scheme` 媒体查询兜底。
- L6：为微信 tabBar 生成深色图标并配置 `darkIconPath`。
- L7：隐私政策补设备标识说明或改用 `getSystemInfoSync` 不带 deviceId 的字段。
- L8：`scripts/upload.js` 的 appid/路径改环境变量读取，私钥路径去绝对化。
- L9：`formatPrice` 开头 `if (isNaN(cents) || cents <= 0) return ''`。
- L10：`feed-service/search-service` 对 `data` 做 `Array.isArray` 类型守卫，非数组抛业务错误。
- L11：删除空回调、`tab-navigation.uts` 冗余条件编译、uni.scss 模板变量；`sync-store` 的 online 字段接入真实网络状态或移除。
- L12：`wardrobe-store` 使用 `types/sort.uts` 的 `SortType`，删除 `clothing-category.uts` 重复映射。
- L13：抽出共享 `utils/masonry.uts` 的 `hashImageHeight(id)` 供 home/wardrobe 共用。
- L14：与后端确认字段契约后删除 legacy 双写；保留时加注释并测试一致性。

---

## ③ 架构层面长期优化建议

### 短期快速修复（1–2 天，全部可当天验证）

1. H2 正则 bug、H4 通知跳转、H8 隐私弹窗、H9 占位符（依赖运营提供文案）、H6 keystore 移出、H7 urlCheck。
2. H10 onPageScroll 签名统一、M4 数值上限、M5 日期选择器、M8 参数编码、M12 本地时区、M13/M14/M15 解析与容错、M25 主题上报。
3. M20/M21/M22 死代码清理（组件、dev 页、事件总线）。

### 中长期重构方案（2 周+）

1. **统一数据流**：确立「页面 → store → repository/service → api-client」单向依赖；消灭 8 处页面直连 services；`ai-import-store` 接入或删除；store 增加 loading/error/缓存/TTL 标准语义。
2. **同步层重设计**：`local-sync-queue` 升级为「重试上限 + 过期淘汰 + 实体重放能力表（entityType→endpoint 映射）」；UI 提供同步状态入口（手动触发/进度提示）。
3. **主题系统事件化**：主题状态变更统一经显式事件（store 内 subscribe 或自实现发布订阅）广播给所有已打开页面（App 用 `uni.$emit` 全局 + 页面 `uni.$on` 配对 `uni.$off`，或直接依赖 reactive 追踪），替换现在的「onShow 兜底刷新」；补齐 MP-WEIXIN/Web 系统主题监听。
4. **样式系统 token 化收尾**：全页面魔法 rpx/hex 收敛到 theme tokens，删除 V2 token 残留；样式类型从 `any` 收窄。
5. **presenter 归位**：`domain/` 仅保留纯实体与 repo，`presentation/` 统一承载展示模型与格式化工具；display model（WardrobeDisplayModel）从 store 迁出。
6. **隐私与安全**：接入隐私弹窗 SDK（uni 官方/开源）、token 加密存储、按环境变量管理构建脚本敏感信息；发布前跑安全门禁（无硬编码密钥、urlCheck=true）。
7. **包体积**：dev 页/零引用组件出主包，评估分包（首页/列表大图静态资源压缩），结合 `optimize-subpackage` 技能。

---

## ④ 额外建议

### 潜在隐藏 Bug（未在 ① 单列、值得关注）

1. **`toISOString` 时区系列**（M12）：除 reminder/wishlist 外，`pages/reminder/edit.uvue:223` 也用 `now.toISOString().split('T')[0]` 初始化日期，同一时区 bug。
2. **`purchase/edit.uvue` 金额**：`parseFloat` 未校验 `isFinite`，且 `deposit > paid`、`deposit > total` 等业务约束无校验（数据一致性隐患）。
3. **`isFavorite>=0` 哨兵值**（`wishlist-store.uts:213`）：用 -1 表示「未传」，语义晦涩，接口变化时易误判。
4. **notification mock 文案**：`notification-center-store.uts:51` 含「V2.1 后端就绪体验已开启」过期版本号文案，发布版会暴露测试信息。
5. **`deviceId` 生成**：`local-sync-queue.uts:34` 用 `Date.now() + Math.random()`，卸载重装后 deviceId 变化，服务端按设备统计可能失真（可改用持久化 UUID）。
6. **`home-feed-store.uts:209-210`**：`await nextTick()` 后再比 seq，若 nextTick 期间页面卸载，仍可能写入已卸载 store 实例——store 是模块单例不受影响，但 `notifyChanged` 无监听者（M22）。
7. **`pages/community/index.uvue` 时钟**：`startClock` 在 onShow 重复调用时若未先 stop，可能叠加多个 interval（需核对 onShow 内是否先 `stopClock`）。

### 后续开发规范优化方案

1. **生命周期规范**：页面统一 `onLoad + onPageShow` 基准；`onLoad` 只做参数/初始化，`onPageShow` 做数据刷新；禁止 `onMounted` 触发网络请求（除非单次详情页）。
2. **样式规范**：禁止页面内魔法 rpx/hex；一律引用 theme tokens；样式对象用 `computed` 仅在依赖响应式色值时使用。
3. **v-for 性能规范**：v-for 内禁止函数调用创建对象（样式对象提取为 computed 缓存或常量），所有列表带 `:key`（已达标保持）。
4. **工具方法收敛**：金额/日期/导航/请求统一入 `utils/`，通过 code review 门禁防止重复实现（可在 `scripts/check.js` 增加「禁止 store 内 export 格式化函数」类静态断言）。
5. **错误处理规范**：所有异步入口必须有 catch + 用户可感知反馈；storage 写包 try/catch；接口返回先判 `Array.isArray` 与字段类型。
6. **响应式追踪验证**：vapor 下任何「间接读 reactive 的 getter 暴露」必须真机验证（如 M10 isDark），并在 commit message 记录验证平台。
7. **门禁扩展**：`scripts/check.js` 增加正则可执行检查（如扫描 `\\d` 在正则字面量、扫描占位符 `[xxx占位]`、扫描 `navigateTo` tabBar 页路径），防止高危问题回归。

---

## 附：审计数量统计

| 等级 | 数量 |
|---|---|
| 高危 | 11 |
| 中风险 | 26 |
| 低风险 | 14 |
| 合计 | 51 |

> 声明：本报告为只读静态审计结论，所有「文件:行号」基于 `origin/main @ 074185e`。修复落地需在 HBuilderX 干净编译 + 各平台真机/模拟器验证后合入。
