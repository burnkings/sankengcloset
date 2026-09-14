# 纯前端设计完善度审计 — 2026-09-14

> 范围：`pages/` 35 个页面 + `components/` 41 个组件 + `theme/` `presentation/` `stores/` 关键路径。
> 方法：全量静态扫描（主题覆盖、硬编码色、空态、安全区、叠加层拦截、字号、文件规模）+ 逐页结构核对。
> 门禁状态：`npm run verify` 6/6 通过。

---

## 一、总评：**84 / 100**

| 维度 | 得分 | 说明 |
|---|---|---|
| 视觉规范与主题体系 | 90 | 设计令牌齐全（colors / typography / spacing / radius / z-index / responsive），深浅双主题，页面级 `initPageTheme` 已 100% 覆盖；扣分在少数硬编码色与个别组件未接 token |
| 组件复用与一致性 | 85 | V3 组件体系完整（卡片 / chip / 弹层 / 骨架 / 空态），但存在少量重复实现（FeedBlock 与 FeedColumn 各自写了一套 outfit 覆层） |
| 页面覆盖与状态完整性 | 85 | 主要数据页都有加载 / 空 / 错误三态；静态页（设置/条款）无空态属正常 |
| 交互细节（安全区 / 返回 / 长按 / 选中态） | 80 | `swipeBackAsBackPress` + `onBackPress` 对 12 个含叠加层页面覆盖完整；但**底部固定栏的留白是系统性薄弱点**（已发现并修 2 处） |
| 工程质量（测试 / 类型 / 文件规模） | 60 | **最大短板**：仅 3 个测试文件；`(): any` 是 UTS 约束下的既定写法（可接受），但 6 个页面超过 350 行 |

**一句话结论**：设计与视觉层已经相当完整，可以直接继续做功能；真正的风险在**工程侧**（测试几乎为零）和**底部浮层留白**这类"看不见但一碰就出错"的细节。

---

## 二、给后端的字段契约（形制）

你说后续按前端内容补后端，这里是前端**已经在用的契约**，照此实现即可对接：

| 项 | 值 |
|---|---|
| 接口 | `GET/PUT/POST /api/v1/me/wardrobe` |
| 字段名 | `silhouette`（string，缺省 `""`） |
| 语义 | 汉服的**形制 / 年代**，与 `style`（部件/衣型）**并列、不是父子** |
| 取值（前端词表） | `宋制` / `明制` / `唐制` / `晋制` / `秦汉` / `现代改良`（允许自由文本，前端 ChipPicker 末枚可自定义） |
| 生效条件 | 仅当 `category == 'HANFU'` 时前端展示与提交；其他坑向一律为空串 |
| 前端现状 | `WardrobeItem.silhouette` + `WardrobeUpdateData.silhouette` 已落地；`mapRemoteWardrobe` 已读 `silhouette` |
| 未加该字段的后果 | 本地能存，**同步即丢**（写入走 `/api/v1/me/wardrobe`，服务端未识别的字段会被丢弃） |

同一批还需要的旧字段（若后端尚未支持，同样会丢）：`style`（部件）已在用。

---

## 三、缺陷清单

### P0 · 本次审计发现并**已修复**

| # | 位置 | 问题 | 处理 |
|---|---|---|---|
| 1 | `pages/favorites/index.uvue` | 多选态浮起删除栏（≈148rpx）后，页面只留默认安全区 40rpx → **最后一行卡片被盖住** | 新增 `pageBottomSpacer` computed，多选时传 `188rpx` 给 `MainLayout` |
| 2 | `components/base/BackToTop.uvue` | 圆底写死 `rgba(0,0,0,0.35)`，深色下在暖黑底上**几乎不可见** | 深色改 `surfaceRaised` + 发丝描边，浅色保持原样 |

### P1 · 建议尽快处理

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 3 | `pages/editorial/detail.uvue` | **全文 0 处 `n.value`**：自身样式完全没有主题响应式（目前只有图片上的白字，侥幸没出问题） | 后续给它加任何正文/卡片颜色时，必须改为 `computed(() => ({ ..., color: n.value.text }))`；建议现在就把 `heroTitle/heroDesc` 之外的样式统一走 token |
| 4 | 测试覆盖 | 35 个页面 / 41 个组件，**只有 3 个测试文件**（本轮刚补了提醒逾期 5 个用例） | 按优先级补：① 各 store 的 CRUD + 同步重放 ② 价格格式化（双价降级）③ 分组/筛选纯函数 ④ 组件关键交互（MonthPicker、ChipPicker） |
| 5 | 大文件 | `reminder/edit` 558 行、`favorites` 545 行、`product/detail` 512 行、`search` 460 行 | 拆出「表单段组件」与「样式模块」；样式集中到文件尾部已有约定，可进一步按区块注释分组 |
| 6 | `pages/budget/index.uvue:288` | 字号 `18rpx`（≈9px），低于可读下限 | 提到 ≥20rpx；预算页是"管理决策档"，信息密度高但也不能牺牲可读性 |
| 7 | 组件重复 | `FeedBlock` 与 `FeedColumn` 各写了一套 outfit 覆层样式（含 `rgba(0,0,0,0.3)` 硬编码） | 抽成共享常量或合并为一个组件；覆层色统一到一个 token（如 `n.value.scrim`） |

### P2 · 打磨项

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 8 | `pages/privacy/index.uvue` | 没用 `DetailLayout`/`MainLayout`，结构与其余页面不一致 | 统一走 DetailLayout，减少自定义导航与安全区处理 |
| 9 | 硬编码白 `#FFFFFF`（15 处） | 绝大多数是"彩色底/图片上的白字"，**合理**；但 `PageState.actionTextStyle`、`ReleaseCard` 两处需确认底色始终是深色 | 保持现状，仅在新增时确认底色 |
| 10 | `RankingCard` 金属色写死 | `#C9A227 / #9AA0A6 / #B0703C` 是名次徽标，**刻意不随主题** | 保持；注释已说明"金银铜是通用名次语义" |
| 11 | 未引用图标 24 组 | `static/icons/` 下有 24 组图标当前未被代码引用 | 等榜单/功能图标方案定稿后一次性清理（其中部分是候选） |
| 12 | `(): any` 泛滥（product/detail 36 处） | UTS 下样式对象必须 `any`，属既定写法 | 可接受；但建议样式区加统一区块注释，方便后续抽离 |

---

## 四、逐页审核（35 页）

图例：✅ 良好 / ⚠️ 有小问题或建议 / ❗ 有缺陷

| 页面 | 行数 | 布局 | 主题响应式 | 三态 | 备注 |
|---|---|---|---|---|---|
| about/index | 124 | DetailLayout | 7 | — | ✅ 含弹窗，返回拦截已覆盖 |
| about/legal | 77 | DetailLayout | 4 | — | ✅ |
| brand/detail | 186 | DetailLayout | 9 | 5 | ✅ 关注/屏蔽状态本轮已理顺 |
| brand/index | 88 | DetailLayout | 7 | 5 | ✅ |
| budget/index | 296 | MainLayout | 21 | 2 | ⚠️ 18rpx 字号过小 |
| community/detail | 109 | MainLayout | 3 | 4 | ✅ |
| community/index | 290 | MainLayout | 9 | 7 | ✅ |
| community/mine | 90 | MainLayout | 3 | 2 | ⚠️ 空态偏弱，建议补"还没有发布"插画态 |
| discover/index | 336 | MainLayout | 23 | 5 | ✅ 榜单入口本轮重构 |
| editorial/detail | 141 | MainLayout | **0** | 2 | ❗ 无主题响应式样式 |
| favorites/index | 545 | MainLayout | 24 | 8 | ✅ 底部留白已修；文件偏大 |
| feedback/index | 209 | DetailLayout | 14 | 0 | ⚠️ 表单页无空态可接受；建议加提交失败的明确提示 |
| help/index | 62 | DetailLayout | 4 | — | ✅ |
| history/index | 114 | MainLayout | 5 | 4 | ✅ |
| home/index | 273 | MainLayout | 7 | 5 | ✅ |
| notification/index | 110 | MainLayout | 7 | 3 | ✅ |
| preferences/appearance | 66 | DetailLayout | 3 | — | ✅ |
| preferences/blacklist | 47 | DetailLayout | 3 | 2 | ✅ |
| preferences/index | 71 | MainLayout | 7 | — | ✅ |
| preferences/notification | 123 | DetailLayout | 6 | — | ✅ |
| privacy/index | 85 | **无** | 11 | — | ⚠️ 未用统一布局 |
| product/detail | 512 | MainLayout | 36 | 6 | ✅ 本轮清理较多；文件偏大 |
| profile/edit | 80 | DetailLayout | 6 | — | ✅ |
| profile/index | 268 | MainLayout | 16 | 0 | ⚠️ 未登录态建议补更明确的引导 |
| purchase/detail | 367 | DetailLayout | 18 | 4 | ✅ |
| purchase/edit | 305 | MainLayout | 13 | 0 | ✅ 本轮做了金额/日期分组隔离 |
| purchase/import | 172 | MainLayout | 13 | — | ✅ |
| purchase/index | 246 | MainLayout | 21 | 4 | ✅ |
| ranking/index | 125 | DetailLayout | 2 | 4 | ⚠️ 自身样式少（主要靠 RankingCard），可接受 |
| reminder/edit | 558 | MainLayout | 27 | 1 | ⚠️ 最大文件，建议拆分 |
| reminder/index | 270 | MainLayout | 20 | 4 | ✅ |
| search/index | 460 | MainLayout | 12 | 4 | ⚠️ 文件偏大 |
| share/create | 350 | MainLayout | 35 | 0 | ⚠️ 文件偏大；建议补保存中/失败态 |
| wardrobe/edit | 300 | MainLayout | 10 | 0 | ✅ 本轮加了形制字段 |
| wardrobe/index | 379 | MainLayout | 26 | 2 | ⚠️ 空态偏弱（2） |

**统计**：✅ 24 页 · ⚠️ 9 页 · ❗ 1 页 · 另 1 页（privacy）结构待统一。

---

## 五、其它建议（非缺陷，属"再上一个台阶"）

1. **先把测试补到能挡住回归**：本轮补的 `tests/reminder-overdue.test.cjs` 证明了这套 vm 加载器可行，建议按同样套路优先覆盖 `presentation/content/feed-presenter`（价格格式化）与各 store 的同步重放 —— 这两块改得最频繁，也最容易静默回归。
2. **给"管理决策档"页面统一一套表格/行间距规范**：购买、订单、预算、衣橱目前的间距/分隔线是各自写的，建议抽一组 `RowSpec`（高度 96rpx、发丝线、数值右对齐）。
3. **空态文案统一**：现在"暂无数据 / 暂无榜单数据 / 空空如也"多种写法并存，建议收敛到 `<模块>还空着 + 一句行动引导`。
4. **图标资产盘点**：`static/icons/` 有 77 个 SVG，其中 24 组未引用；建议保留一套"核心 24 枚"，其余随用随加，避免继续膨胀。
5. **深色专用资源的前置约定**：原生 tabBar 图标是编译期固定 PNG，将来若新增 tab，记得把选中态颜色固定为 `#D65378`（与文字 token `tabSelectedColor` 一致），否则又会出现"图标一个粉、文字另一个粉"。
