# 三坑绮橱 前端视觉评审 · 改动汇总（截至 2026-09-13）

> 本文是三轮真机截图评审的**合并账本**：评了什么、真改了哪些代码、哪些拍板项已落地、哪些还悬着。
> 逐页细节与精确方案见原始评审文档：
> - `docs/design/SCREENSHOT-REVIEW-2026-09-12.md`（第一轮，25 张）
> - `docs/design/SCREENSHOT-REVIEW-2026-09-13.md`（第二轮+竞品拆解 26 张 / 第三轮 15 张）

---

## 一、三轮评审做了什么

| 轮次 | 素材 | 核心产出 |
|---|---|---|
| 第一轮 09-12 | 25 张（15 页 × 浅/深） | 逐页看图说话 + P0×5/P1×6/P2×8 分级 + 19 条方案 + 5 项拍板 |
| 第二轮 09-13 | 23 张浅色 + 3 张竞品长图 | 竞品拆解（吸收/抛弃清单）+ 7 项已修核对 + 9 条新发现 + 旧账状态 |
| 第三轮 09-13 下午 | 15 张（表单/详情/深色） | 9 项已修核对 + 7 条新发现（R3-1~R3-7）+ 落地复核（以源码为准） |

**竞品拆解结论（一句话）**：竞品长处全在输入效率（chips 化、默认值、快速选择），短处全在信息组织（平铺零层级、色语义乱、主操作埋没）。我们的信息架构已领先，要补的是**表单输入效率**这一课。

---

## 二、Kimi 实际改动的代码（按评审决策批量落地）

> 门禁：`npm run verify` 6/6 全绿。行号见对应评审文档，此处只列文件与改法。

### 2.1 视觉/组件层（无需拍板部分，全部落地）

| 条目 | 级别 | 文件 | 改法 |
|---|---|---|---|
| 商品卡状态 chip 竖排（文字逐字竖排） | P0 | `components/v3/StatusChip.uvue` | 文字加 `whiteSpace:'nowrap'`，窄容器不再竖排（首页/收藏共用） |
| FAB 压列表末行 | P0 | `utils/window-info.uts` + 提醒/衣橱/购买 3 页 | 新增 `px2rpx()` / `getFabBottomSpacer()`，底部留白自适应（旧 216rpx=108px < FAB 距底 112px+safeBottom，真机会压） |
| 购买页 chips 末项截断"已\|" | P1 | `components/v3/FilterChips.uvue` | 根因 `paddingRight:'32rpx'` 被 `props.gutter` 覆盖成 0 → 改 `chipTrailing = max(gutter,32rpx)` |
| 浏览历史"×"文本符 | P1 | `pages/history/index.uvue` | AppIcon close 32rpx + 外层 88rpx 热区 |
| 选中胶囊实底玫粉白字（两套选中语言） | P1 | `components/v3/SegmentedControl.uvue`、`pages/ranking`、`pages/reminder/edit`、`pages/feedback` | 删 ranking 实底特例，统一「浅粉底 surfacePink + 玫粉字 iconActive semibold」；实底玫粉只留底部 CTA |
| 品牌目录关注/已关注主次倒置 | P1 | `pages/brand/index.uvue`、`pages/discover/index.uvue` | 关注=浅粉底+玫粉字；已关注=`bgSecondary`+`textTertiary` |
| 关于页品牌名出现三次 | P2 | `pages/about/index.uvue` | 删黑色粗体名称行，字标下直接接版本号；移除未用的 APP_NAME import |
| 收藏卡"未设置"+"尾款 9月21日"矛盾 | P2 | `pages/favorites/index.uvue` | 有发售信息显示发售状态，确无才显示"未设置" |
| 购买价格 placeholder "0" | P2 | `pages/wardrobe/edit.uvue` | 改「¥ 输入价格」 |
| 关联商品"+" / 关联衣物"›" 两图标 | P2 | `pages/reminder/edit.uvue` | 统一 chevron-right |
| 尺码自由文本 | P1 | 新增 `components/v3/ChipPicker.uvue` | chips 单选 S/M/L/XL/均码 + 自定义；历史非预设值自动回填自定义 |
| 型别字段 | P1 | `pages/wardrobe/edit.uvue` | **采纳 A**：chips 单选 JSK/OP/SK/背带/衬衫 + 自定义，复用已有 `style` 字段，不改接口 |
| 颜色 chips 词表 | P2 | 同上 ChipPicker | 生成/白/黑/绀/sax/粉/红/棕 + 自定义 |

### 2.2 用户直接下的需求（4 条 + 2 拍板通过）

| 需求 | 文件 | 改法 |
|---|---|---|
| 深色模式改回两开关且反相关联（用户明确只要 2 态） | `pages/preferences/appearance.uvue` | 深色开→跟随系统自动关；深色关→跟随系统自动开，恒为一开一关。代价：无法锁浅色。`light` 旧值归一为 `system` |
| 多选删除统一交互（长按进入→勾选→底部删除(N)→二次确认） | `pages/wardrobe/index`、`pages/favorites/index`、`stores/*` | 衣橱/收藏新增长按多选；收藏新增 `favorite-store.removeFavorites()` 即时剔除；编辑页删除改先确认 |
| 购买记录单选按钮占首行 | `pages/purchase/index.uvue` | card 改 row：勾选框贴最左列，内容 `flex:1` |
| ChipPicker 组件 | `components/v3/ChipPicker.uvue` | chips 单选 + 末枚自定义展开；props items/modelValue/customLabel/placeholder，v-model 即用 |

### 2.3 全面屏手势返回（叠加层吞手势）— 13 页补 onBackPress

- 给所有带叠加层页面加页面级 `onBackPress`（先关最上层叠加层 → return true；否则 false）。
- 已加：wardrobe/edit、reminder/edit、purchase/detail、wardrobe/index、reminder/index、purchase/index、favorites、budget、discover、about、profile、community/index、share/create。
- **iOS 侧滑真相（重要）**：uni-app x 支持页面级 `swipeBackAsBackPress: true`，把侧滑转成 onBackPress → iOS 侧滑也能拦（代价：侧滑从拖拽动画变一次性返回）。已给这 13 页开启。经典 uni-app 无此字段，只有 `popGesture` 可禁。
- 已知遗留：未保存离开确认挂在 onBackPress 的 `options.from == 'backbutton'` 分支，对 navigateBack 放行避免死循环。

### 2.4 第三轮遗留补齐

- `reminder/edit`、`wardrobe/edit` 抽出 `hasUnsavedChanges()` + onBackPress 的 `from=='backbutton'` 分支，未保存离开确认覆盖手势返回。
- 商品详情页删除「商品简介」板块（含 description ref）。
- 衣橱多选态标题保持「选择单品」（命名规则：选择 + 模块实体名）。

### 2.5 仓库

- 已推 GitHub（公开）：`git@github.com:burnkings/sankengcloset.git`，提交 `2b1ea4f`（73 改 + 18 新增）。
- HTTPS 到 github.com 被沙箱代理挡死，**SSH 可用**；`.gitignore` 已加 `.workbuddy/`、`.hermes/` 不进公开仓库。

---

## 三、拍板项状态

| # | 取舍点 | 结论 |
|---|---|---|
| 旧1 | 浅色白卡边界 | **A 已落地**：源码本就 1rpx 描边（ListGroup/榜单卡/品牌卡/工具格/衣橱卡），保持 |
| 旧2 | 管理页金额颜色 | **A 已落地**：衣橱 ¥128 已是中性黑 600 |
| 旧4 | 商品卡价格行 | **仍待你答**：A 保留「定金+全款」双价 / B 全款主价+定金降级小字（倾向 B） |
| 旧5 | 发现页榜单卡 | **3-B 已落地**：加线性图标做视觉锚 |
| 原5 | 关于页 logo | **5-B 已落地**：换玫粉字标 |
| 新1 | 型别字段 | **A 已落地**：JSK/OP/SK/背带/衬衫+自定义 |
| 新2 = N5 | 购买页付款进度条 | **半落地**：订单详情有"付款进度 31%"，购买列表进度条仍无标注。待你定 A 加标注 / B 去掉（倾向 A） |
| 新3 | 颜色 chips 词表 | **已落地**：生成/白/黑/绀/sax/粉/红/棕+自定义 |

> 深色模式设置：先按评审改过三态单选，后用户明确要求回退为两开关反相关联（只有 2 态），已落。

---

## 四、仍未修 / 悬而未决

| # | 问题 | 级别 | 状态 |
|---|---|---|---|
| R3-1 | 日期选择器两套：系统 picker（确定系统蓝）/自绘 picker（确定玫粉但深色下浅色弹层刺眼） | P1 | 待统一收进自绘 DateField（`n.value.surface` 底 + 24rpx 圆角 + `iconActive` 确定） |
| R3-2 | 订单详情文本赘余：已付已付 / 截止截止 / 无日期又显示"—" | P1 | 待 label/value 去重 + 无日期行 v-if |
| R3-3 | 提醒"今天"组里混着"已过期"条目，分组语义打架 | P2 | 待过期实时移入"已过期"组 |
| R3-4 | 提醒过期条目的红色✓圆圈，勾/红语义叠加读不出 | P2 | 待勾选用 iconActive，过期未完用空心 error 描边 |
| R3-5 | 商品详情（深）相关动态卡文字溢出裁切 | P2 | 待限两行 + overflow hidden |
| R3-6 | 商品详情（深）占位亮粉/亮紫刺眼 | P2 | 待占位底色 token 化 `n.value.bgSecondary` |
| R3-7 | 编辑购买记录坑向显示错误（汉服显示 JK 选中） | — | 数据回填逻辑 bug，非视觉，待查 |
| 旧账 | 深色下"即将发售"chip 浅底白补丁 | P1 | StatusChip initial 没走 statusColorsDark，待修 |
| 旧账 | 消费日志月份切换归属 | P2 | 源码已符合（monthBar 在流水区），未改 |
| 旧4 | 商品卡价格行双价降级 | P1 | 仍待拍板 |

---

## 五、本轮沉淀的组件 / 约定（复用价值）

- **`components/v3/ChipPicker.uvue`**：表单枚举字段统一用（型别/颜色/尺码已用），禁写裸文本输入或页面级重复 chip 样式。
- **横向 scroll-view**：必须 `:show-scrollbar="false"`（带冒号布尔），内容放得下优先不用滚动容器。
- **叠加层页面**：必须写 `onBackPress` 拦截；iOS 需 `swipeBackAsBackPress: true`。
- **主题色**：一律 `computed` 返回 `n.value.*`，模块级常量会导致深色不刷新。
- **选中态语言**：全 App 统一「浅底 surfacePink + 玫粉字 iconActive」；实底玫粉只用于底部 CTA / 复选勾选态。
