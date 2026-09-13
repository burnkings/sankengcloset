# 三坑绮橱 · 优化待办与修复记录

> 生成日期：2026-09-11（第二轮更新：低风险项已全部本地修完）
> 来源：本轮 UI 走查修复过程中**实测确认**的问题（含已修与未修），不是猜测清单。
> 用途：① 已修问题与门禁规则的记录，防止回退；② 剩余待办（均为需要视觉决策或架构改动、不宜顺手改的项）。
> 若把剩余项交给其他 Agent：先读 §0 约束与 §4 验收方式。

---

## 0. 仓库边界（先读）

- 仓库：`sankengcloset`（uni-app **x** / uvue + uts，非 Vue2 版 uni-app）
- 不得修改：后端契约（`domain/platform/api-contract.uts`）、Store 数据结构、Mock 登录逻辑
- 不得修改：`unpackage/`、`vendor`、构建产物、密钥
- 不得恢复：首页 Dashboard / 统计卡 / 快捷入口、"坑面分类"入口、大面积粉色 Hero、emoji 当图标
- 设计基线：`docs/design/DESIGN-SYSTEM-V3.md`（唯一生效的视觉规范）
- 任何改动前先跑一遍：

```bash
node scripts/check-source-gates.js   # 必须 3 组全 PASS
node --test tests/*.test.cjs         # 必须 20/20
```

> 注意：`scripts/check-source-gates.js` 已在 CI（`.github/workflows/v3-source-gates.yml`）对 PR 强制运行。
> 本轮新增了 5 条 uvue 绑定规则（见 §3），**新代码必须通过，不要用 `// eslint-disable` 类手段绕过**。

---

## 1. P0 — 会影响用户的功能缺陷

> 2026-09-11 第二轮更新：原 P0 中 4 条**低风险项已在本地修完**（见 §3 表格），下面只保留仍未修的。

### 1.1 金额格式化仍有 4 套实现（0 值语义已统一）

- 现状：`formatPriceCents`（6 处）、`formatCentsYuan`（9 处）、`formatPriceOrZero`（新增，汇总场景）、`pages/profile/index.uvue` 的 `formatAmount`（私有一份）
- 已修部分：新增 `utils/format.uts` 的 `formatPriceOrZero()`，**明确规定汇总/合计场景 0 值显示 `¥0`**；`pages/purchase/index.uvue` 的「本月已支付/待付尾款」已改用它
- 仍待统一：`pages/profile/index.uvue` 的 `formatAmount` 是第 4 份私有实现（整数取整、无万级），建议并入 `formatPriceOrZero`；14 处页面内联手写 `¥${...}` 也应逐步收敛
- 注意：`utils/format.uts` 头部注释明确写了「保留两种金额语义（既定 UI 行为，**禁止一刀切**）」——卡片语义与订单语义**不要**合并，只需消灭重复的第 3、4 份实现

### 1.2 `reminder/edit.uvue` 的提醒类型仍是 8 个标签平铺两行

- 位置：`pages/reminder/edit.uvue` 第 13、16 行（`typeOptions.slice(0,4)` / `slice(4)`）
- 现状：数组前 4 个恰是**时间驱动**（尾款 / 上新发售 / 到货提醒 / 穿搭计划），后 4 个是**活动驱动**（拍照日程 / 整理衣橱 / 蹲新品 / 打卡），但界面上没有任何分组提示
- 建议：加两行小标题（或用 SegmentedControl 先切"时间/活动"再选类型），默认只展开时间驱动组
- 验收：用户在不看文档的情况下能理解"这两行是两类提醒"

### 1.3 `getSafeBottomInset()` 算式错误（已修，保留说明以免回退）

见 §3。

### 1.4 收藏页信息密度（转入 P1）

见 §2.2。

---

## 2. P1 — 一致性与可达性

### 2.1 术语三套并存

| 概念 | 现用词 |
|---|---|
| 同一份订单数据 | **消费日志** / **购买记录** / **订单** |
| 同一份愿望数据 | **收藏** / **待购** / **心愿单（wish）** |

建议：先定一份词汇表（`docs/product/`），再全局替换文案。**不要**只改一处 UI，会加剧混乱。

### 2.2 收藏页信息密度仍高于首页

- `pages/favorites/index.uvue` 单个商品卡仍有 4 行（标题 / 品牌+坑向 / 销售状态+价格 / 待购+发售提醒），首页卡是 3 行
- 建议：收藏是**决策池**，与首页"浏览流"职责不同 —— 改单列紧凑行（缩略图 + 标题/品牌 + 价格 + 右侧提醒按钮），点击目标更清晰，也避免瀑布流下挂交互行导致的行高参差
- 验收：收藏页单卡信息行 ≤ 2 行，且「开启提醒」仍是独立可点区域（热区 ≥ 88×88rpx）

### 2.3 首页两套 Feed 实现

- `pages/home/index.uvue` 存在 `#ifdef MP-WEIXIN` 的 `scroll-view` 分支与 App 的 `list-view` 分支
- 风险：两套渲染路径会随时间漂移（分页、下拉刷新、骨架屏逻辑重复）
- 建议：抽公共的 feed 数据/分页 hook，两个分支只保留容器差异

---

## 3. 本轮已修（请勿回退，并作为回归用例）

| 问题 | 位置 | 说明 |
|---|---|---|
| **13 个未定义样式名导致 App 崩溃** | `pages/product/detail.uvue` | `pitChip` 等编译期不报错、渲染即 `ReferenceError`，已全部补齐 |
| **`library` 漏声明（同类崩溃）** | `pages/reminder/edit.uvue` | 用了 `library.favoriteProducts` 但没写 `const library = useContentLibraryStore()` |
| `scroll-x` 不被 `<scroll-view>` 支持 | `pages/product/detail.uvue` | 改用 `direction="horizontal"` |
| `:lines` 属性 / `maxLines` 样式无效 | `pages/product/detail.uvue` | 统一为 `:style` 的 `lines`（全站现有 25 处，分布在 15 个文件） |
| **7 个页面提示静默失效** | `components/layout/DetailLayout.uvue` | `showFeedback` 依赖 `<AppFeedbackToast />`，此前只挂在 `MainLayout`，DetailLayout 系 7 个页面（含意见反馈、编辑资料）所有提示都不显示 |
| 底部留白层层叠加 | `theme/tokens`、`MainLayout`、8 个页面 | 全局 200rpx + 页面自备 spacer，实测叠加到 340rpx+；现由 `MainLayout` 的 `bottom-spacer` 单一出口控制 |
| 4 个页面漏调 `initPageTheme()` | purchase/edit、wardrobe/edit、purchase/index、reminder/index | 深色模式下 token 与原生 appTheme 不刷新 |
| 22 个未使用的 import | 11 个文件 | 已清理 |
| `safeParam` 三份私有副本 | → `utils/route-params.uts` | 另将 `brand/detail`、`editorial/detail` 两处裸 `decodeURIComponent` 改为调用它（畸形编码不再打断 `onLoad`） |
| `getSafeBottomInset()` 算式错误 | `utils/window-info.uts` | 原用 `windowHeight - safe.bottom`，Tab 页恒得 0；改为 `screenHeight - safe.bottom`。影响 `AppFab` / `BackToTop` / 商品详情底部栏 |
| `pages.json` 双份 tabBar | `pages.json` | 合并为单份并规范化缩进；已逐字段比对：34 个路由、5 个 tab 项、globalStyle 完全一致 |
| 浮岛 TabBar 死 token | `theme/tokens/responsive.uts` | 删除 `TAB_BAR_HEIGHT` / `TAB_BAR_HEIGHT_NUM` / `TAB_ICON_SIZE` / `TAB_LABEL_FONT` / `TAB_BAR_SAFE_BOTTOM`（全站零引用），并注明与原生 TabBar 不符的原因 |
| `reminder/edit` 重复实现与死数据 | `pages/reminder/edit.uvue` | `getTypePlaceholder()` → 统一取 `domain/reminder.uts` 的 `TYPE_PLACEHOLDERS`；删除 `typeOptions[].color` 死字段与 `TYPE_COLORS` 导入 |
| `purchase/index` 死计算属性 | `pages/purchase/index.uvue` | 删除未被引用的 `formattedTotal` / `formattedRemaining` |
| 汇总金额 0 值语义 | `utils/format.uts`、`pages/purchase/index.uvue` | 新增 `formatPriceOrZero()`：汇总/合计场景 0 显示 `¥0`，不再出现空白格 |
| 模块顶层隐式 I/O | `stores/content-library-store.uts` | `reload()` 从模块顶层移入首次 `useContentLibraryStore()`；import 该模块不再读 storage（已确认无任何文件绕过 facade 直读 state） |

### 新增门禁规则（`scripts/check-source-gates.js` 第 5 节）

1. 模板 `:style="裸标识符"` 必须在脚本中声明
2. `<scroll-view>` 不得用 `scroll-x` / `scroll-y`（自动跳过 `#ifdef MP-WEIXIN` 区块）
3. `<text>` 不得用 `:lines` 属性；样式不得用 `maxLines`
4. import 进来的绑定必须被使用（拦住漏写声明 / 漏调初始化）
5. 调用 `showFeedback` 的页面必须有提示宿主（`MainLayout` / `DetailLayout` / 自挂 `AppFeedbackToast`）

---

## 4. 验收方式（每个任务都要做）

```bash
node scripts/check-source-gates.js   # 3 组全 PASS
node --test tests/*.test.cjs         # 20/20
```

**必做真机冒烟**：uni-app x 的很多错误编译期不报、只在渲染到该节点时抛错（本轮 13 个未定义样式名就是这么漏过去的）。至少覆盖：

```text
商品详情（含同款式 / 相关动态 / 底部固定栏）
提醒事项（内容多时滚到底）
新建提醒（切全部 8 个类型标签 + 打开关联商品 / 关联衣物选择器）
意见反馈（提交后是否有提示）
编辑资料（保存后是否有提示）
购买记录（本月无消费时是否显示 ¥0）
收藏（卡片左右文字是否贴边框、提醒按钮可点）
我的（我的工具 / 系统设置图标规格是否一致）
```

---

## 5. 任务拆分（已完成状态截至 2026-09-11 第二轮）

| # | 任务 | 主要文件 | 风险 | 状态 |
|---|---|---|---|---|
| 1 | 修 `getSafeBottomInset()` 算式 | `utils/window-info.uts` | 低 | ✅ 已修 |
| 2 | 合并 `pages.json` 双份 tabBar | `pages.json` | 低 | ✅ 已修 |
| 3 | 浮岛 token 去留 | `theme/tokens/responsive.uts` | 低 | ✅ 已删（如日后做浮岛导航，连同实现一起新增） |
| 4 | `content-library-store` 去掉模块级 `reload()` | `stores/content-library-store.uts` | 中 | ✅ 已修（改为首次取 handle 时初始化） |
| 5 | `reminder/edit` 去重复实现 + 删死字段 | `pages/reminder/edit.uvue` | 低 | ✅ 已修 |
| 6 | `reminder/edit` 提醒类型分组 | `pages/reminder/edit.uvue` | 低 | ⬜ 待做 |
| 7 | 汇总金额 0 值语义 | `utils/format.uts` | 低 | ✅ 已修 |
| 8 | 消除第 4 份金额实现（`profile` 的 `formatAmount`） | `pages/profile/index.uvue` | 低 | ⬜ 待做（注意别破坏 335rpx 卡片内的排布） |
| 9 | 术语统一（先出词汇表再替换） | `docs/product/` + 全站文案 | 中 | ⬜ 待做 |
| 10 | 收藏页改单列决策卡 | `pages/favorites/index.uvue` | 中 | ⬜ 待做（视觉变更，需走查） |
| 11 | 首页 Feed 两分支抽公共 hook | `pages/home/index.uvue`、`stores/home-feed-store.uts` | 中高 | ⬜ 待做 |

> 6 与 8 都是一次会话内可安全完成的低风险项；9-11 建议拆独立 PR 逐项走查。
