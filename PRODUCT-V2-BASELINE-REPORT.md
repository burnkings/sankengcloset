# Product V2 Engineering Baseline Report

> 日期: 2026-07-14
> 项目: 三坑绮橱 AppX (`/home/admin/projects/sankengcloset`)
> 范围: 只读盘点，不修改任何文件

---

## 一、项目基本信息

### 1.1 技术栈

| 项目 | 值 | 来源 |
|------|-----|------|
| 框架 | UniApp X (非传统 uni-app) | `manifest.json` 字段 `uni-app-x` |
| Vue 版本 | vue 3.4.21 + Pinia 2.1.7 | `package.json` |
| 编译器版本 | HBuilderX 5.21 | `unpackage/dist/build/app-android/manifest.json` → `compilerVersion: "5.21"` |
| Vapor 模式 | **未启用** — 无 `vapor` 配置项 | `manifest.json`, `vite.config.js` 均无相关配置 |
| UTS 语言 | `.uts` 文件用于 domain/store/theme 层 | 全量 `.uts` 源文件 |
| 页面文件格式 | `.uvue` (UniApp X 专用) | 所有 pages/ 和 components/ |
| 样式方案 | JS 内联样式对象 (无 CSS/SCSS 文件) | 所有 `.uvue` 文件的 `<script setup>` |
| 构建工具 | Vite + `@dcloudio/vite-plugin-uni` | `vite.config.js` |
| 路径别名 | `@` → `./src` | `vite.config.js` |

### 1.2 目标平台

| 平台 | 配置 | 状态 |
|------|------|------|
| 微信小程序 | `manifest.json` → `mp-weixin.appid: wx976f673896c8b565` | 可编译，有 dist 产物 |
| Android | `platformConfig.json` → `targets: ["APP-ANDROID", "MP-WEIXIN"]` | 有 build 产物目录，已知兼容性问题 |
| iOS | `manifest.json` 有 `app-ios` 段但为空 | 未配置，未构建 |

### 1.3 构建命令

| 命令 | 用途 | 来源 |
|------|------|------|
| `uni build -p mp-weixin` | 微信小程序编译 | `package.json` → `scripts.build:mp-weixin` |
| HBuilderX CLI: `./cli launch mp-weixin --project ... --compile true` | 实际编译入口 | `/home/admin/scripts/build-and-upload.sh` |
| HBuilderX CLI: `./cli launch app-android --project ...` | Android 编译 | `.hbuilderx/launch.json` → `type: uni-app:app-android` |

### 1.4 微信小程序最近构建

- **编译产物目录**: `unpackage/dist/dev/mp-weixin/` (存在，有完整 wxml/wxss/js/json)
- **上传脚本**: `/home/admin/scripts/build-and-upload.sh` (编译→patch-vendor.py→校验→miniprogram-ci上传)
- **最近版本**: v1.3.0 (从 memory 记录确认)
- **patch-vendor.py**: 修复 HBuilderX 5.21 alpha 的 `defineStore` 未打包 bug，每次编译后必须执行

### 1.5 Android 最近构建

- **build 产物目录**: `unpackage/dist/build/app-android/` (存在，含 `.uniappx/android/` 子目录)
- **dev 产物目录**: `unpackage/dist/dev/app-android/` (存在)
- **编译器版本**: 5.21
- **已知 Android 兼容性问题** (从 memory 和 src 文件确认):
  - UTS 禁止 `||` 解构 string union → 已改用 class 常量
  - `computed` 必须 `(): any` 返回类型 → 已在所有 computed 中添加
  - `string union type` 不可用 → 已改用 `class` 常量 (如 `SortType`)
  - `.uvue` 文件不允许 `export`，常量必须放 `.uts` → 已遵守
- **Android 暂停修复**，MVP 优先

---

## 二、当前导航与页面

### 2.1 pages.json 路由 (根目录，当前版本，13 页面)

| # | 路径 | 类型 | 功能 |
|---|------|------|------|
| 1 | `pages/home/index` | **TabBar** | 首页 Dashboard (仪表盘) |
| 2 | `pages/wardrobe/index` | **TabBar** | 衣橱管理 |
| 3 | `pages/purchase/index` | **TabBar** | 消费记录列表 |
| 4 | `pages/purchase/detail` | 普通页 | 消费记录详情 |
| 5 | `pages/purchase/edit` | 普通页 | 消费记录编辑/新增 |
| 6 | `pages/profile/index` | **TabBar** | 我的 (个人中心) |
| 7 | `pages/wishlist/index` | 普通页 | 心愿单/种草清单 |
| 8 | `pages/wishlist/detail` | 普通页 | 心愿详情 |
| 9 | `pages/wishlist/edit` | 普通页 | 心愿编辑/新增 |
| 10 | `pages/reminder/index` | 普通页 | 提醒列表 |
| 11 | `pages/reminder/edit` | 普通页 | 提醒编辑/新增 |
| 12 | `pages/dev/ui-playground` | 开发页 | UI 组件展示场 |
| 13 | `pages/dev/page-playground` | 开发页 | 页面架构测试 |

### 2.2 TabBar 配置

```
Tab 1: 首页   → pages/home/index    (selectedColor: #FF4D7E)
Tab 2: 衣橱   → pages/wardrobe/index
Tab 3: 消费   → pages/purchase/index
Tab 4: 我的   → pages/profile/index
```

**注意**: WishList、Reminder 不在 TabBar 中，通过页面内导航进入。

### 2.3 subPackages

**无** — 所有页面在主包中。

### 2.4 各页面完成度详情

| 页面 | 行数 | 完成度 | 入口 | 依赖 | 备注 |
|------|------|--------|------|------|------|
| `pages/home/index.uvue` | 576 | ✅ 完整 | TabBar | `useHomeStore` | Hero + 消费概览 + 快捷入口 + 种草/提醒/收藏卡片。数据为 **Mock** (setTimeout + 硬编码) |
| `pages/wardrobe/index.uvue` | 329 | ✅ 完整 | TabBar | `useWardrobeStore` | 分类统计条 + Chip 筛选 + 搜索 + 排序 + Grid/List 视图切换 |
| `pages/purchase/index.uvue` | 228 | ✅ 完整 | TabBar | `usePurchaseStore` | 消费统计条 + 状态筛选 Chip + PurchaseCard 列表 |
| `pages/purchase/detail.uvue` | 308 | ✅ 完整 | navigateTo | `usePurchaseStore` | 消费详情展示 + 操作按钮 |
| `pages/purchase/edit.uvue` | 309 | ✅ 完整 | navigateTo | `usePurchaseStore` | 表单编辑/新增 |
| `pages/profile/index.uvue` | 66 | ⚠️ **占位** | TabBar | 无 Store | 仅显示头像+昵称+本地账户标签，无功能入口 |
| `pages/wishlist/index.uvue` | 378 | ✅ 完整 | navigateTo | `useWishListStore` | Hero + 预算条 + 状态筛选 + WishCard 网格 |
| `pages/wishlist/detail.uvue` | 368 | ✅ 完整 | navigateTo | `useWishListStore` | 心愿详情 + 状态流转 + 转消费记录 |
| `pages/wishlist/edit.uvue` | 268 | ✅ 完整 | navigateTo | `useWishListStore` | 表单编辑/新增 |
| `pages/reminder/index.uvue` | 507 | ✅ 完整 | navigateTo | `useReminderStore` | Hero(今日焦点) + 统计胶囊 + 筛选 + ReminderCard 列表 |
| `pages/reminder/edit.uvue` | 285 | ✅ 完整 | navigateTo | `useReminderStore` | 表单编辑/新增 |
| `pages/dev/ui-playground.uvue` | 417 | ✅ 开发工具 | 手动 | Theme 全量 | 展示所有 Design Token、组件变体、Grid、Dialog |
| `pages/dev/page-playground.uvue` | 335 | ✅ 开发工具 | 手动 | 组件全量 | 全屏/嵌套/横排/Grid/长列表/安全区验证 |

### 2.5 白屏/占位/Mock/未完成标记

| 页面 | 状态 | 详情 |
|------|------|------|
| `pages/profile/index.uvue` | ⚠️ **占位** | 66 行，仅一个用户卡片，无功能入口（无设置/数据管理/关于等） |
| `pages/home/index.uvue` | ⚠️ **Mock 数据** | `useHomeStore.fetchDashboard()` 使用 `setTimeout(500)` + 硬编码数据 (衣物 12、种草 8、消费 368 等)，**未接入真实 Store** |
| `pages/dev/*` | ℹ️ 开发工具 | 不影响用户，可保留或移除 |

### 2.6 src/ 目录 vs 根目录

| 差异 | 根目录 (当前) | src/ (旧版) |
|------|--------------|-------------|
| pages.json 页面数 | 13 | 9 |
| 缺失页面 | — | wishlist/detail, wishlist/edit, reminder/index, reminder/edit |
| 缺失 Store | — | `reminder-store.uts` |
| 缺失 Domain | — | `reminder.uts`, `reminder-presenter.uts`, `reminder-repo.uts` |
| 缺失组件 | — | `AppEmptyState.uvue`, `AppTag.uvue` |
| 缺失 Theme | — | `theme/components/`, `theme/tokens/view-style.uts` |

**结论**: 根目录是当前活跃源码；`src/` 是历史快照，缺少 Reminder 模块和部分组件。`@` 别名指向 `./src` 但 HBuilderX 编译实际使用根目录文件。

---

## 三、状态与数据层

### 3.1 Store 清单 (Pinia, defineStore)

| Store | 文件路径 | 行数 | 职责 |
|-------|----------|------|------|
| `useHomeStore` | `stores/home-store.uts` | 70 | 首页 Dashboard 聚合数据 (Mock) |
| `useWardrobeStore` | `stores/wardrobe-store.uts` | 151 | 衣橱 CRUD + 分类/搜索/排序/视图切换 |
| `usePurchaseStore` | `stores/purchase-store.uts` | 134 | 消费记录 CRUD + 状态筛选 + 统计 |
| `useWishListStore` | `stores/wishlist-store.uts` | 291 | 心愿单 CRUD + 状态流转 + 转消费记录 |
| `useReminderStore` | `stores/reminder-store.uts` | 218 | 提醒 CRUD + 今日/本周/逾期筛选 |

### 3.2 Repository 清单 (数据访问层)

| Repository | 文件路径 | 行数 | 存储方式 | Mock 数据 |
|------------|----------|------|----------|-----------|
| `wardrobe-repo` | `domain/repositories/wardrobe-repo.uts` | 146 | `uni.getStorageSync('wardrobe_items')` | ✅ `initMockData()` |
| `wishlist-repo` | `domain/repositories/wishlist-repo.uts` | 194 | `uni.getStorageSync('wishlist_items')` | ✅ `initMockData()` |
| `purchase-repo` | `domain/repositories/purchase-repo.uts` | 113+ | `uni.getStorageSync('purchase_records')` | ✅ `initMockData()` |
| `reminder-repo` | `domain/repositories/reminder-repo.uts` | ~120 | `uni.getStorageSync('reminder_items')` | ✅ `initMockData()` |

**所有 Repository 均为纯本地存储**，无后端 API、无网络请求、无云端同步。

### 3.3 Presenter/ViewModel 清单

| Presenter | 文件路径 | 职责 |
|-----------|----------|------|
| `PurchasePresenter` | `domain/purchase-presenter.uts` (92 行) | `PurchaseRecord` → `PurchaseDisplayModel` (状态文字/颜色/金额格式化/进度百分比/逾期判断) |
| `WishPresenter` | `domain/wish-presenter.uts` (85 行) | `WishItem` → `WishDisplayModel` (状态/优先级/价格/来源文字映射) |
| `ReminderPresenter` | `domain/reminder-presenter.uts` (90 行) | `Reminder` → `ReminderDisplayModel` (类型/状态/时间/今日/本周/逾期判断) |

### 3.4 Entity/Type 清单

| Entity | 文件路径 | 字段数 | 关键字段 |
|--------|----------|--------|----------|
| `WardrobeItem` | `domain/wardrobe-item.uts` (31 行) | 18 | id, name, category(JK/LOLITA/HANFU/OTHER), style, brand, color, size, wearStatus, seasons[], images[], tags[], purchaseDate, purchasePrice, purchaseSource, note, isFavorite, isDeleted |
| `WishItem` | `domain/wish-item.uts` (139 行) | 16 | id, name, coverImage, brand, estimatedPrice, priority(HIGH/MEDIUM/LOW), status(WISH/WATCHING/DECIDED/PURCHASED/PAUSED/CANCELED), source(MANUAL/AI_IMPORT/DISCOVERY), wardrobeId, purchaseId, convertedAt, note, url, isFavorite, isDeleted |
| `PurchaseRecord` | `domain/purchase-record.uts` (71 行) | 16 | id, name, brand, shopName, category, totalAmount, depositAmount, paidAmount, remainingAmount, paymentStatus(PRE_ORDER/DEPOSIT_PAID/BALANCE_PENDING/COMPLETED/CANCELLED), purchaseDate, deadline, note, isFavorite, isDeleted |
| `Reminder` | `domain/reminder.uts` (93 行) | 12 | id, title, type(ARRIVAL/BALANCE/RELEASE/CUSTOM), remindDate, remindTime, relatedPurchaseId, relatedWishId, note, status(PENDING/DONE/MISSED), isDeleted |
| `ClothingCategory` | `domain/clothing-category.uts` (43 行) | 常量 | JK, LOLITA, HANFU, OTHER + 标签/Emoji 映射 |
| `SortType` | `types/sort.uts` (31 行) | 常量 | newest, priceHigh, priceLow, name |

### 3.5 数据模型与状态机

#### WishItem 状态机
```
WISH ──→ WATCHING ──→ DECIDED ──→ PURCHASED (终态)
  │         │           │
  ├─→ PAUSED ←┤         │
  ├─→ CANCELED          │
  └─────────────────────┘
PAUSED → WISH, WATCHING, CANCELED
CANCELED → WISH
PURCHASED → (终态，不可流转)
```

#### PurchaseRecord 状态
```
PRE_ORDER → DEPOSIT_PAID → BALANCE_PENDING → COMPLETED
                                              CANCELLED (任意阶段)
```

#### Reminder 状态
```
PENDING → DONE | MISSED (时间过期自动标记)
```

### 3.6 数据存储现状

| 数据类型 | 仅本地 | 后端 API | 同步机制 |
|----------|--------|----------|----------|
| WardrobeItem | ✅ `uni.getStorageSync` | ❌ 无 | ❌ 无 |
| WishItem | ✅ `uni.getStorageSync` | ❌ 无 | ❌ 无 |
| PurchaseRecord | ✅ `uni.getStorageSync` | ❌ 无 | ❌ 无 |
| Reminder | ✅ `uni.getStorageSync` | ❌ 无 | ❌ 无 |
| 用户信息 | ❌ 无持久化 | ❌ 无 | ❌ 无 |

### 3.7 Schema 版本与迁移

- **Schema 版本**: 无版本号，无迁移机制
- **数据格式**: 纯 JSON 序列化到 `uni.getStorageSync`
- **反序列化**: 每个 Repo 的 `loadAll()` 使用 `?? ` 运算符逐字段兜底默认值（隐式迁移）
- **Mock 数据位置**: 每个 Repo 文件内的 `initMockData()` 函数，首次加载时注入

---

## 四、UI 与设计系统

### 4.1 Design Tokens

| Token 类型 | 文件路径 | 内容概要 |
|------------|----------|----------|
| Colors | `theme/tokens/colors.uts` (162 行) | brand(蔷薇粉 #FF4D7E), accent(薰衣草紫 #8B5CF6), warm 色系, gradient, semantic, baseColors, neutralLight, neutralDark, categoryColors(JK/Lolita/汉服) |
| Typography | `theme/tokens/typography.uts` (58 行) | fontSize(xs~5xl), fontWeight(normal~extrabold) |
| Spacing | `theme/tokens/spacing.uts` (67 行) | spacing(0~10, 8rpx 步进), semanticSpacing(pageHorizontal 32rpx, navbarHeight 44px, safeBottom) |
| Radius | `theme/tokens/radius.uts` (38 行) | radius(xs~full), semanticRadius(button/card/dialog/tag/avatar 等) |
| Shadow | `theme/tokens/shadow.uts` (48 行) | shadow(xs~xl), 语义阴影(card/navbar/tabbar/button/dialog), shadowDark 全量暗色 |
| Z-Index | `theme/tokens/z-index.uts` (24 行) | 层级管理(base~safeTop 0~999) |
| Animation | `theme/tokens/animation.uts` (33 行) | duration(fast~slower), easing(6 种), transition(4 种预设) |
| ViewStyle | `theme/tokens/view-style.uts` (60 行) | 统一样式对象 class (替代 `as any`) |

### 4.2 布局系统

| 模块 | 文件路径 | 内容 |
|------|----------|------|
| Flex | `theme/layout/flex.uts` (36 行) | flexRow/RowCenter/RowBetween/RowAround/RowStart/RowEnd, flexColumn/ColumnCenter, flexCenter, flexFill, createFlex() |
| Grid | `theme/layout/grid.uts` (20 行) | createGrid()/createGridItem(), grid2/2Item, grid3/3Item, grid4/4Item |
| Spacing | `theme/layout/spacing.uts` (45 行) | gap(xs~xl), pad(xs~xl), pagePadding, cardPadding, safeBottom, createPadding(), createMargin() |

### 4.3 主题系统

| 模块 | 文件路径 | 内容 |
|------|----------|------|
| use-theme | `theme/use-theme.uts` | `isDark` ref + `n` computed (neutralLight/neutralDark 切换) |
| index | `theme/index.uts` | 统一导出所有 token + layout + use-theme |

**暗色模式**: Token 完整定义了 `neutralDark` 和 `shadowDark`，`n` computed 支持切换。所有页面使用 `n.value.xxx` 读取当前主题色。但 **无全局切换入口**（Profile 页无设置功能）。

### 4.4 可复用组件

| 组件 | 路径 | 行数 | 功能 | Product V2 复用性 |
|------|------|------|------|-------------------|
| `AppNavbar` | `components/base/AppNavbar.uvue` | 104 | 固定顶部导航栏，支持返回/标题/右侧 slot | ✅ 直接复用 |
| `AppCard` | `components/base/AppCard.uvue` | 55 | 通用卡片容器，支持 header/body/footer slot、elevated | ✅ 直接复用 |
| `AppButton` | `components/base/AppButton.uvue` | 88 | 5 变体(primary/secondary/outline/ghost/danger) + 3 尺寸 + disabled/loading | ✅ 直接复用 |
| `AppImage` | `components/base/AppImage.uvue` | 88 | 图片组件，lazy-load + skeleton 占位 + error 回退 | ✅ 直接复用，**Feed 场景关键** |
| `AppInput` | `components/base/AppInput.uvue` | 122 | 输入框，支持 v-model/clearable/prefix/suffix/error | ✅ 直接复用 |
| `AppTag` | `components/base/AppTag.uvue` | 132 | 4 变体(CHIP/CATEGORY/STATUS/PRIORITY) + active 状态 | ✅ 直接复用 |
| `AppDialog` | `components/base/AppDialog.uvue` | 121 | 模态弹窗，支持 title/message/cancel/confirm/overlay | ✅ 直接复用 |
| `AppLoading` | `components/base/AppLoading.uvue` | 49 | 加载指示器，支持 overlay 模式 | ✅ 直接复用 |
| `AppEmptyState` | `components/base/AppEmptyState.uvue` | 113 | 空状态占位，支持 icon/title/desc/action/secondary | ✅ 直接复用 |
| `MainLayout` | `components/layout/MainLayout.uvue` | 33 | 全屏 100vh + Navbar 固定 + scroll-view + 安全区 | ✅ 直接复用 |
| `DetailLayout` | `components/layout/DetailLayout.uvue` | 44 | 同 MainLayout 但内置 AppNavbar | ✅ 直接复用 |
| `TabLayout` | `components/layout/TabLayout.uvue` | 21 | 最简布局，无 scroll-view | ✅ 直接复用 |
| `WardrobeCard` | `components/business/WardrobeCard.uvue` | 289 | Grid/List 双模式，图片+分类角标+收藏+价格+穿着状态 | ⚠️ 需适配（与商品卡类似但字段不同） |
| `WishCard` | `components/business/WishCard.uvue` | 213 | 大封面+渐变遮罩+状态/优先级角标+品牌+价格 | ⚠️ 需适配（可作为收藏卡基础） |
| `PurchaseCard` | `components/business/PurchaseCard.uvue` | 166 | 状态条+名称+金额+进度条+日期 | ⚠️ 需适配（订单卡可参考进度条模式） |

### 4.5 Theme Components (样式模块)

| 模块 | 文件路径 | 行数 | 内容 |
|------|----------|------|------|
| Hero | `theme/components/hero.uts` | 142 | heroSection/Title/Sub, heroStatBar/Item/Num/Label/Divider, heroDataBar/Label/Value/Badge, HERO_COLORS, createHeroSection() |
| Card | `theme/components/card.uts` | 219 | cardContainer/WithAccent/AccentBar/Content, cardTopRow/DateRow/ActionRow, statusPill, timeBadge, doneBtn, coverWrap/gradientOverlay/overlayName, placeholderWrap, priorityCorner, favCorner |
| Toolbar | `theme/components/toolbar.uts` | 89 | toolbarSection, chipScroll/Row, sortBtn/Icon, favToggle/Text, createSortBtn/Icon() |

### 4.6 可复用于 Product V2 的组件分析

| V2 需求 | 可复用资产 | 需新增/修改 |
|---------|-----------|------------|
| 内容 Feed 卡 | `AppCard` + `AppImage` | 需新建 `ContentPostCard` (图文混排+互动栏) |
| 商品卡 | `WardrobeCard` (Grid 模式) + `AppImage` | 需新建 `ProductCard` (价格+品牌+收藏) |
| 频道 Tab | `AppTag` (CHIP 模式) | 需新建横向 Tab 组件（带下划线指示器） |
| 收藏状态 | `WishCard` + favCorner 样式 | 可直接复用 |
| 管理中心入口 | `AppCard` + `AppEmptyState` | 需新建管理中心页面 |

### 4.7 图片/列表/性能能力

| 能力 | 现状 |
|------|------|
| 图片加载 | `AppImage` 支持 `lazy-load`、skeleton 占位、error 回退 |
| 长列表 | 使用 `scroll-view scroll-y`，**无虚拟列表** |
| 骨架屏 | `AppImage` 内置 skeleton pulse，**无全局骨架屏组件** |
| 缓存 | `uni.getStorageSync` 纯 KV 存储，**无图片缓存策略** |
| 虚拟列表 | **不存在** — 所有列表是全量渲染 |

---

## 五、AI 与导入

### 5.1 当前实现状态

| 能力 | 状态 | 详情 |
|------|------|------|
| OCR | ❌ **不存在** | 无任何 OCR 相关代码、API 调用或第三方库 |
| 链接解析 | ❌ **不存在** | WishItem 有 `url` 字段但无解析逻辑 |
| 图片选择 | ❌ **不存在** | 无 `uni.chooseImage` / `uni.chooseMedia` 调用 |
| AI Import | ❌ **不存在** | `WishItem.source` 有 `AI_IMPORT` 常量，但无任何导入页面或逻辑 |
| 绮灵 AI | ❌ **不存在** | 无任何 AI 相关页面或 API |

### 5.2 数据模型中的 AI 预留

`domain/wish-item.uts` 中定义了：
```uts
export const SOURCE_MANUAL = 'MANUAL'
export const SOURCE_AI_IMPORT = 'AI_IMPORT'
export const SOURCE_DISCOVERY = 'DISCOVERY'
```

这些常量已定义但**无任何使用场景**。

### 5.3 外部依赖

- 无任何 AI/OCR/图片识别第三方库
- 无网络请求库 (axios/uni.request 等)
- 无图片选择/上传相关代码

---

## 六、测试与质量

### 6.1 可执行的命令

| 命令 | 存在 | 最近结果 |
|------|------|----------|
| `vue-tsc` | ❌ 无 tsconfig.json，无 vue-tsc 依赖 | 不可用 |
| `eslint` | ❌ 无 .eslintrc，无 eslint 依赖 | 不可用 |
| `prettier` | ❌ 无 .prettierrc，无 prettier 依赖 | 不可用 |
| `uni build -p mp-weixin` | ✅ `package.json` 有脚本 | 未验证（通过 HBuilderX CLI 执行） |
| Unit Tests | ❌ 无任何测试文件 | 不可用 |
| HBuilderX CLI 编译 | ✅ `/opt/HBuilderX/cli` | 通过 build-and-upload.sh 使用 |
| patch-vendor.py | ✅ 编译后必须执行 | 修复 defineStore 打包 bug |
| check-uts-compile.js | ✅ 编译校验脚本 | build-and-upload.sh 第 3 步 |

### 6.2 质量门禁现状

| 门禁 | 状态 |
|------|------|
| vue-tsc 0 errors | ❌ **不可执行** — 无 tsconfig.json |
| eslint 0 errors | ❌ **不可执行** — 无 eslint 配置 |
| prettier | ❌ **不可执行** — 无 prettier 配置 |
| 编译通过 | ✅ HBuilderX CLI 编译 + check-uts-compile.js |
| Android 云打包 | ⚠️ 有 build 产物但已知兼容性问题暂停修复 |

### 6.3 Git 状态

- **Git 仓库**: ❌ **不存在** — `/home/admin/projects/sankengcloset` 无 `.git` 目录
- **版本控制**: 未知/未验证
- **最近提交**: 不适用

### 6.4 Product V2 图片 Feed 最相关的 AppX/Android 风险

| 风险 | 严重度 | 详情 |
|------|--------|------|
| 无虚拟列表 | P0 | Feed 场景需大量图片卡片，全量渲染会导致性能崩溃 |
| scroll-view 性能 | P0 | AppX 的 scroll-view 在长列表场景下未验证性能上限 |
| 图片加载策略 | P1 | AppImage 仅支持 lazy-load，无预加载/渐进加载/CDN 缩略图策略 |
| Android 兼容性 | P1 | UTS 限制（无 string union、computed 返回类型等）增加开发成本 |
| 无网络层 | P0 | 零网络请求代码，Feed 需要 API 调用、分页、缓存、错误重试 |
| UTS 类型限制 | P1 | 复杂泛型/联合类型受限，API 响应类型定义可能需要 workaround |
| HBuilderX 5.21 alpha | P1 | 编译器 alpha 阶段，defineStore 需 patch-vendor.py 补丁 |
| 服务器资源 | P2 | 4G/2核/40G 服务器，开发环境资源有限 |

---

## 七、Product V2 迁移映射

### 7.1 旧模块 → V2 去向

| 旧模块 | 页面文件 | 判断 | 原因 |
|--------|----------|------|------|
| **Home (Dashboard)** | `pages/home/index.uvue` | **重做页面** | V2 首页改为内容 Feed，当前 Dashboard 仪表盘完全不适用。数据层 `useHomeStore` 需废弃重写 |
| **Wardrobe** | `pages/wardrobe/index.uvue` | **下沉到管理中心，复用数据层** | 衣橱管理功能保留但不再是 TabBar。`WardrobeItem` 数据模型 + `wardrobe-store` + `wardrobe-repo` 可直接复用 |
| **Purchase** | `pages/purchase/*.uvue` (3 页面) | **下沉到管理中心，复用数据层** | 消费记录保留。`PurchaseRecord` + `purchase-store` + `purchase-repo` 可直接复用 |
| **WishList** | `pages/wishlist/*.uvue` (3 页面) | **升级为一级"收藏"** | 数据层完全复用，页面需重做为收藏 Tab 的 UI。`WishItem` 模型需扩展（加入 Product/ContentPost 关联） |
| **Reminder** | `pages/reminder/*.uvue` (2 页面) | **下沉到管理中心** | 提醒功能保留。全部数据层可复用 |
| **Profile** | `pages/profile/index.uvue` | **重做为"我的"** | 当前仅 66 行占位页，需加入管理中心入口、设置、账号等 |
| **AI Import** | 不存在 | **全新开发** | 并入"绮灵 AI"和商品/收藏/订单情境入口 |
| **Dev Pages** | `pages/dev/*.uvue` (2 页面) | **保留** | 开发工具，不影响 V2 |

### 7.2 详细文件级映射

#### 可直接复用 (数据层 + Domain)

| 文件 | 路径 | 复用方式 |
|------|------|----------|
| `WardrobeItem` | `domain/wardrobe-item.uts` | 直接复用 |
| `WishItem` + 常量 | `domain/wish-item.uts` | 复用，可能需扩展字段 |
| `PurchaseRecord` | `domain/purchase-record.uts` | 直接复用 |
| `Reminder` | `domain/reminder.uts` | 直接复用 |
| `ClothingCategory` | `domain/clothing-category.uts` | 直接复用 |
| `wardrobe-repo` | `domain/repositories/wardrobe-repo.uts` | 直接复用 |
| `wishlist-repo` | `domain/repositories/wishlist-repo.uts` | 直接复用 |
| `purchase-repo` | `domain/repositories/purchase-repo.uts` | 直接复用 |
| `reminder-repo` | `domain/repositories/reminder-repo.uts` | 直接复用 |
| `PurchasePresenter` | `domain/purchase-presenter.uts` | 直接复用 |
| `WishPresenter` | `domain/wish-presenter.uts` | 直接复用 |
| `ReminderPresenter` | `domain/reminder-presenter.uts` | 直接复用 |
| `wardrobe-store` | `stores/wardrobe-store.uts` | 直接复用 |
| `purchase-store` | `stores/purchase-store.uts` | 直接复用 |
| `wishlist-store` | `stores/wishlist-store.uts` | 直接复用 |
| `reminder-store` | `stores/reminder-store.uts` | 直接复用 |
| `SortType` | `types/sort.uts` | 直接复用 |

#### 可直接复用 (UI 层)

| 文件 | 路径 | 复用方式 |
|------|------|----------|
| `AppNavbar` | `components/base/AppNavbar.uvue` | 直接复用 |
| `AppCard` | `components/base/AppCard.uvue` | 直接复用 |
| `AppButton` | `components/base/AppButton.uvue` | 直接复用 |
| `AppImage` | `components/base/AppImage.uvue` | 直接复用 |
| `AppInput` | `components/base/AppInput.uvue` | 直接复用 |
| `AppTag` | `components/base/AppTag.uvue` | 直接复用 |
| `AppDialog` | `components/base/AppDialog.uvue` | 直接复用 |
| `AppLoading` | `components/base/AppLoading.uvue` | 直接复用 |
| `AppEmptyState` | `components/base/AppEmptyState.uvue` | 直接复用 |
| `MainLayout` | `components/layout/MainLayout.uvue` | 直接复用 |
| `DetailLayout` | `components/layout/DetailLayout.uvue` | 直接复用 |
| `TabLayout` | `components/layout/TabLayout.uvue` | 直接复用 |
| Theme 全量 | `theme/**` | 直接复用 |

#### 复用数据层但重做页面

| 模块 | 数据层文件 | 页面文件 | 原因 |
|------|-----------|----------|------|
| Home | `stores/home-store.uts` (需废弃) | `pages/home/index.uvue` | V2 首页改为 Feed，HomeStore 需重写为 FeedStore |
| WishList→收藏 | `stores/wishlist-store.uts` (复用) | `pages/wishlist/*.uvue` (重做) | 升级为一级 Tab，UI 需完全重做为收藏风格 |
| Profile→我的 | 无 Store | `pages/profile/index.uvue` (重做) | 当前仅占位，需全新实现管理中心 |

#### 需要适配

| 文件 | 路径 | 适配内容 |
|------|------|----------|
| `WardrobeCard` | `components/business/WardrobeCard.uvue` | 可作为商品卡基础，需适配 Product 字段 |
| `WishCard` | `components/business/WishCard.uvue` | 可作为收藏卡基础，需适配 ContentPost/Product 关联 |
| `PurchaseCard` | `components/business/PurchaseCard.uvue` | 可作为订单卡参考，进度条模式可复用 |

#### 应废弃但暂时保留

| 文件 | 路径 | 原因 |
|------|------|------|
| `home-store.uts` | `stores/home-store.uts` | Dashboard 概念废弃，全部 Mock 数据，需重写 |
| `pages/dev/*` | `pages/dev/ui-playground.uvue`, `page-playground.uvue` | 开发工具，不影响 V2，可保留 |

---

## 八、Product V2 缺口

### 8.1 内容域现状

| 内容域 | 存在? | 详情 |
|--------|-------|------|
| **Brand** | ❌ 不存在 | `WardrobeItem.brand` 和 `WishItem.brand` 是字符串字段，无独立 Brand 实体/列表 |
| **Series** | ❌ 不存在 | 无系列概念 |
| **Product** | ❌ 不存在 | 无商品实体。WardrobeItem 是"已拥有衣物"，WishItem 是"心愿"，均非商品 |
| **ReleaseEvent** | ❌ 不存在 | `Reminder` 有 `type: RELEASE` 但无独立发售事件实体 |
| **Offer / PriceSnapshot** | ❌ 不存在 | `WishItem.estimatedPrice` 是单个估计值，无价格追踪 |
| **ContentPost** | ❌ 不存在 | 无内容/帖子/笔记实体 |
| **Outfit** | ❌ 不存在 | 无穿搭组合概念 |
| **Collection** | ❌ 不存在 | 无策展/合集概念 |
| **UserPreference** | ❌ 不存在 | 无用户偏好设置（暗色模式/通知/语言等） |
| **AIInsight** | ❌ 不存在 | 无 AI 分析/推荐实体 |

### 8.2 基础设施缺口

| 能力 | 现状 | V2 需求 |
|------|------|---------|
| **账号系统** | ❌ 无。Profile 页显示"本地账户·游客模式"，无登录/注册/微信登录 | V2 需要至少微信一键登录 |
| **后端** | ❌ 不存在。零网络请求代码 | V2 Feed/商品/收藏/用户 都需要后端 API |
| **同步** | ❌ 不存在。纯本地 uni.getStorageSync | V2 需要数据同步/冲突解决 |
| **内容运营后台** | ❌ 不存在 | V2 Feed 需要内容管理/审核/发布系统 |
| **埋点** | ❌ 不存在。`uniStatistics.enable: false` | V2 需要用户行为追踪 |
| **审核** | ❌ 不存在 | V2 UGC 内容需要审核机制 |
| **通知** | ❌ 不存在。Reminder 仅本地提醒，无推送 | V2 需要微信模板消息/订阅消息 |
| **搜索** | ⚠️ 仅本地内存搜索。`wardrobe-repo.search()` 在内存中 filter | V2 需要全文搜索/商品搜索 |
| **图片服务** | ❌ 不存在。`AppImage` 接受 URL 但无上传/CDN/缩略图服务 | V2 需要图片上传+CDN+多尺寸缩略图 |

---

## 九、最终汇总

### 9.1 现有资产 → Product V2 去向映射表

| 资产 | 类型 | 文件数 | V2 去向 | 工作量 |
|------|------|--------|---------|--------|
| WardrobeItem + Repo + Store | 数据层 | 3 | 管理中心直接复用 | 0 |
| WishItem + Presenter + Repo + Store | 数据层 | 4 | 收藏 Tab 复用+扩展 | S |
| PurchaseRecord + Presenter + Repo + Store | 数据层 | 4 | 管理中心直接复用 | 0 |
| Reminder + Presenter + Repo + Store | 数据层 | 4 | 管理中心直接复用 | 0 |
| ClothingCategory + SortType | 类型 | 2 | 直接复用 | 0 |
| AppNavbar/Card/Button/Image/Input/Tag/Dialog/Loading/EmptyState | Base 组件 | 9 | 直接复用 | 0 |
| MainLayout/DetailLayout/TabLayout | Layout 组件 | 3 | 直接复用 | 0 |
| WardrobeCard/WishCard/PurchaseCard | Business 组件 | 3 | 适配为商品卡/收藏卡 | M |
| Theme 全量 (tokens + layout + components) | 设计系统 | 14 | 直接复用 | 0 |
| Home 页面 | 页面 | 1 | **废弃重做** → 内容 Feed | L |
| Profile 页面 | 页面 | 1 | **废弃重做** → 我的+管理中心 | L |
| WishList 页面 (3) | 页面 | 3 | **重做** → 收藏 Tab | M |
| HomeStore | Store | 1 | **废弃重写** → FeedStore | M |
| pages.json | 路由 | 1 | **重写** → 新导航结构 | S |
| Brand/Product/Series/ContentPost/Outfit | 内容域 | 0 | **全新开发** | XXL |
| 账号/后端/同步 | 基础设施 | 0 | **全新开发** | XXL |
| AI Import/绮灵 AI | AI 功能 | 0 | **全新开发** | XL |

### 9.2 P0/P1/P2 风险表

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|----------|
| 无后端/账号系统 | **P0** | Feed/商品/收藏/用户全部需要后端 | V2 PRD 前必须确定后端方案 |
| 无虚拟列表 | **P0** | Feed 图片长列表性能不可用 | 需调研 AppX scroll-view 虚拟列表能力或 waterfall 组件 |
| 无网络请求层 | **P0** | 无法加载远程数据 | 需封装 uni.request + 拦截器 + 缓存 |
| 无图片服务 | **P0** | Feed 图片无法加载 | 需确定 CDN/图片托管方案 |
| 无内容域实体 | **P0** | Product/ContentPost 等核心实体缺失 | 需先建模再开发 |
| UTS 类型限制 | **P1** | 复杂 API 响应类型定义困难 | 使用 class + 手动反序列化 |
| HBuilderX 5.21 alpha | **P1** | 编译器 bug，需 patch-vendor.py | 关注正式版发布 |
| Android 兼容性 | **P1** | string union/computed 返回类型限制 | 已有 workaround 模式 |
| 无虚拟列表 + scroll-view | **P1** | 中长列表(100+)可能卡顿 | 需实测验证上限 |
| 无暗色模式切换入口 | **P2** | 主题系统完整但无 UI 入口 | V2 我的页面加入设置 |
| src/ 与根目录文件重复 | **P2** | 维护混乱 | V2 迁移时清理 src/ 目录 |
| 无 Git 版本控制 | **P2** | 无法回溯/协作 | 立即初始化 git |
| 开发服务器 4G/2核 | **P2** | 编译/打包可能资源不足 | 优化编译配置 |

### 9.3 开始 MVP PRD 和技术方案前，必须由产品方确认的 5 个问题

1. **后端方案选择**: 使用 UniCloud、自建 Node/Python 后端、还是第三方 BaaS (如 Supabase/Firebase)? 这直接决定 API 设计、账号系统、数据同步方案。

2. **Feed 内容来源**: 内容 Feed 的数据从哪来? 运营手动发布? 用户 UGC? 爬取外部平台? 还是 AI 生成? 不同来源决定 ContentPost 模型设计和审核需求。

3. **商品数据结构**: "三坑商品"的定义边界是什么? 是否需要对接外部电商平台(淘宝/闲鱼)的商品数据? 还是只管理用户自己收藏的商品信息? 这决定 Product 实体是否需要独立存在。

4. **"绮灵 AI"的 MVP 范围**: 第一版 AI 功能具体做什么? 仅图片识别推荐相似款? 智能穿搭建议? 还是对话式助手? 不同范围对应完全不同的技术栈和成本。

5. **用户体系与数据迁移**: 现有用户(游客模式)的本地数据如何迁移到 V2 的账号体系? 是否需要微信登录? 是否支持多设备同步? 这决定数据迁移策略和首版功能优先级。

### 9.4 Git 信息

| 项目 | 值 |
|------|-----|
| Git 仓库 | ❌ **不存在** — `/home/admin/projects/sankengcloset` 无 `.git` 目录 |
| 当前分支 | 不适用 |
| git status | 不适用 |
| 最近提交 | 不适用 |

### 9.5 关键判断依据汇总

| 判断 | 依据 |
|------|------|
| 无后端 | 搜索全部 `.uts`/`.uvue` 文件，无 `uni.request`、`fetch`、`axios` 等网络调用 |
| 纯本地存储 | 4 个 Repo 文件均使用 `uni.getStorageSync` / `uni.setStorageSync` |
| 无测试 | `find` 命令搜索 `*.test.*`、`*.spec.*` 无结果，无 jest/vitest/mocha 配置 |
| 无 lint | 无 `.eslintrc*`、`eslint.config.*`、`.prettierrc*`、`tsconfig.json` |
| Home Store Mock | `stores/home-store.uts` 第 44-62 行: `setTimeout(500)` + 硬编码数据 |
| Profile 占位 | `pages/profile/index.uvue` 仅 66 行，只有用户卡片，无功能 |
| 无 AI 实现 | 搜索全部源文件，无 OCR/API/图片识别相关代码 |
| 无 Git | `git log` 返回 `fatal: not a git repository` |
| Android 产物存在 | `unpackage/dist/build/app-android/` 目录存在且有 `.uniappx/android/` |
| 编译器版本 5.21 | `unpackage/dist/build/app-android/manifest.json` → `compilerVersion: "5.21"` |

---

> 报告完成。所有判断基于实际文件内容阅读，未基于文件名推测。标记为"不存在"的内容已通过全文搜索确认。
