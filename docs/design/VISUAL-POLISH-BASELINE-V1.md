# 三坑绮橱 视觉精修基线 v1

> 地位：DESIGN-SYSTEM-V3 的**精修层补充**，不推翻 V3 任何条款；V3 已定义的 token 直接引用，本文只补"零件级取值表"和"增量 token"。
> 日期：2026-09-12 ｜ 依据：对 pages/home、discover、favorites、purchase、wardrobe、reminder、budget、profile、product/detail 及 components/ 全部 24 个组件的源码审计。
> 密度分档：**内容浏览档**（首页/发现/收藏/圈子/详情/专题）与**管理决策档**（购买/订单/提醒/衣橱/预算/设置）共用同一套 token，差别只在信息量与留白比例。凡涉及间距/行高的条款，均给两档取值。

---

## A. 增量 token（只增不改，兼容影响见每条）

| # | 位置 | 新增 | 取值 | 兼容影响 |
|---|---|---|---|---|
| A1 | animation.uts | `press` | `{ opacity: '0.86', duration: duration.fast, easing: easing.easeOut }` | 纯新增，零影响（V3 §8 已定性 160ms/0.86，只是落成 token） |
| A2 | colors.uts | `imageScrim` 浅/深 | 浅 `rgba(0,0,0,0.35)` / 深 `rgba(0,0,0,0.45)` | 纯新增；收敛当前 5 种遮罩写法时逐点替换，无行为变化 |
| A3 | spacing.uts | `v3Spacing.sectionGapCompact` | `'24rpx'` | 纯新增，管理决策档组间距专用 |
| A4 | spacing.uts | `v3Spacing.listRowHeight` | `'96rpx'` | 纯新增；ListRow 从 104 收敛到 96 时引用它 |
| A5 | responsive.uts | 修正 `PRODUCT_CARD_WIDTH_V3` 注释与实际口径 | 双列卡宽统一 **353rpx**（feedGutter 16 + 353 + 12 + 353 + 16 = 750，V3 §3.3 原文） | 有影响：当前 token 值 337 与注释 353 自相矛盾；收藏页/骨架/NoteCard 用 337+pageGutter32 口径。统一后这些页双列从 337 变 353、边距从 32 变 16，需同批改并截图验证 |

**强调色使用规则（基线级）**：浅色 `brand.primary` / 深色 `#E47A96` 的自适应读取，全项目统一走 `n.value.iconActive`（已是自适应 token）。**禁止模块级 const 固化 `brand.primary`**——效果等同缓存主题色的红线。当前 8 处固化（ReleaseCard/SectionHeader/PageState/ChannelTabs/FilterChips/SegmentedControl/AppSwitch/AppImage）全部按此整改。

---

## B. 通用零件 token 级定义

### B1 Feed 卡（ProductCard / NoteCard / ReleaseCard / EditorialCard）— 内容浏览档

| 部位 | 取值 |
|---|---|
| 容器 | 无外盒、无阴影、无描边；图与文字直接落 `n.value.bg` |
| 图宽/高 | 双列 353rpx 宽；商品 353×470（3:4）；穿搭按数据源比例元数据（3:4 或 4:5），同数据源内一致 |
| 图圆角 | `v3Radius.feedImage` = 12rpx（ReleaseCard/EditorialCard 大图用 `largeImage` = 16rpx） |
| 图片组件 | 一律 `AppImage`（占位 `n.value.bgTertiary` + 失败重试），禁用原生 `<image>` |
| 信息区 | paddingTop 12rpx；品牌 caption 22/400/textSecondary → 标题 cardTitle 28 两行 → 状态（最多一枚）→ 价格 |
| 标题字重 | **统一 600**（当前 ProductCard/NoteCard 用 500、ReleaseCard/EditorialCard 用 600，收敛到 token 值 600） |
| 价格 | price 30/600/`n.value.text`；仅"已降价"场景可用 `brand.strong`，正文场景不用品牌色 |
| 收藏钮 | 图右上；图标 44rpx + 触控底 72rpx（当前 64 底 + 36 图标，双项不达标） |
| 纵向间距 | `v3Spacing.cardVerticalGap` = 28rpx（四张卡当前都是字面量 28，改走 token） |
| Overlay | 图上压字层统一 `imageScrim`（A2）；只盖底部 ~35%，不压暗整图 |

### B2 列表行（ListRow / ManagementRow）— 两档取值

| 部位 | 内容浏览档 | 管理决策档 |
|---|---|---|
| 行高 | minHeight 96rpx（`listRowHeight`，A4） | 纯文字行 96rpx；带缩略图/双信息行 112rpx（`managementRowMinHeight`） |
| 水平 padding | `listGroupHorizontal` 28rpx | 同左 |
| 垂直 padding | 16rpx | 12–16rpx（紧凑可扫） |
| 标题 | body 28/500/text，一行 | cardTitle 28/500/text，一行 |
| 副信息 | meta 24/400/textSecondary，一行 | 状态+时间一行，**时间用 meta 24/500/textSecondary 独立权重**（不与状态挤同色同重） |
| 金额列 | — | 28/600 右对齐；待付 `semantic.error`、已结清 `semantic.success`、中性 `text` |
| 缩略图 | — | 80×96rpx，圆角 12，右距 16rpx |
| 右侧 | 箭头 或 一个主状态，二选一 | 同左 |
| 热区 | ≥88rpx | ≥88rpx |

### B3 列表组（ListGroup）— 两档取值

| 部位 | 内容浏览档 | 管理决策档 |
|---|---|---|
| 容器 | `n.value.surface` + `v3Radius.listGroup` 20rpx + 无阴影 | 同左 |
| 组内分区 | 1rpx `n.value.divider`（8% 发丝线），末行不画 | 同左 |
| 组间距 | `sectionGap` 40rpx | **`sectionGapCompact` 24rpx**（A3），靠分组标题+发丝线分区，不靠大留白 |
| 分组标题 | sectionTitle 32/600 + titleToContent 20 | meta 24/600/textSecondary 小号分组标题 + 12rpx 到内容 |

现行 ListGroup 组件即标准答案（白底+20rpx+无阴影+内部分割线），**禁止页面绕开它自堆白卡**（当前 purchase/reminder/profile 工具格均违规）。

### B4 按钮 — 两档同形，仅密度不同

| 类型 | 取值 |
|---|---|
| 主按钮 | `n.value.iconActive` 实底 + textInverse 字，高 88，圆角 `v3Radius.button` 16，字 28/600；按压底 `brand.strong`；禁用 = bgTertiary 底 + textDisabled 字；加载 = 指示器+锁定 |
| 次按钮 | `bgSecondary` 底 + text 字，同高同圆角，不描边 |
| 文字按钮 | `n.value.iconActive` 字 28/500；外层容器补到 88rpx 热区（禁止裸 `<text>` 当按钮） |
| 危险按钮 | `semantic.error` 文字或浅底；仅最终确认可实底 error |
| 规则 | 同一视图最多一个主按钮；七态（默认/按压/禁用/加载）必须全 |

### B5 筛选 Chip 与频道（FilterChips / ChannelTabs / SegmentedControl）

- Chip：高 56、paddingX 22、圆角 `v3Radius.capsule`（**唯一胶囊来源**，清理 9999 字面量/`radius.full`/`999` 三种野写法）；默认 bgSecondary+textSecondary；选中 surfacePink+`n.value.iconActive` semibold。
- 频道：文字+4rpx 指示条，指示色 `n.value.iconActive`（当前 ChannelTabs 固化 brand.primary）。
- 二级筛选选中只用"浅底+深字"，不用纯白字大色块（V3 §5.7）。

### B6 状态徽标（StatusChip）

- 沿用 6 语义键 + `statusColors/statusColorsDark`（深色处理已是全库标杆，不动）。
- 时间状态映射（补全缺失映射，落到 feed-presenter 一处）：在售→positive、预售→pending、**尾款待付→pending（文案区分）**、即将发售→initial、**截团临近→pending**、已售罄/已下架/已截团→neutral、已过期→error。
- 状态必须有文字，不只靠颜色（V3 §3.1）。

### B7 页头与导航

- 一级页：pageTitle 40/700；紧凑标题区高 96rpx（`navTitleHeight`）。
- 二级页：navTitle 34/600 + 返回；Navbar 与内容分区用 1rpx `divider` 发丝线（当前 home navbar 仅靠纯色，滚动无层级）。
- SectionHeader：sectionTitle 32/600/text + titleToContent 20；右侧动作文字 28/500/`n.value.iconActive`，动作容器热区 88rpx（当前 64rpx 不达标）。
- 底部安全区：读真实 safe-area-inset，禁止写死 34rpx（当前 BottomActionBar 违规）。

### B8 空态 / 错误态 / 骨架屏

- PageState 构成（现行结构即标准）：AppIcon 64 linear + iconLight → 标题 body 28/500/text → 描述 meta 24/400/tertiary（口语化文案，"还没有反馈记录哦"语气）→ 一个主动作（B4 主按钮）。空态可居中，其余左对齐。
- **每个请求型页面七态清单**：首屏骨架 / 下拉保留旧内容 / 加载更多指示 / 空（一句原因+一个动作）/ 错误（说明对象+重试）/ 离线 / 图片失败保比例。discover、purchase、reminder、wardrobe、budget 当前缺错误态，discover 连骨架都没有。
- 骨架屏铁律：**与真实布局同参数**——同边距、同列宽、同列距、同纵向节奏。当前 FeedSkeleton 列距 44rpx vs 真实 12rpx，加载完成瞬间"缩缝"，必须改。

### B9 分割线

- 行内分割一律 1rpx `n.value.divider`（8% 发丝线）；容器外描边才用 `n.value.border`。
- **线只画一次**：归属组件（ListRow/ListGroup），页面不再叠加（当前 profile 设置区双重线 = 2rpx）。
- 末行不画线，判断逻辑收进组件（当前 discover/favorites 弹窗末行多线）。

### B10 按压态与动效

- 所有可点元素：`@touchstart` → `press`（A1：opacity 0.86，150ms easeOut）或底色沉一档（surface→bgSecondary），`@touchend`/`@touchcancel` 恢复。列表滚动中不做缩放。
- BottomSheet 滑入 250ms easeOut；Switch 位移 150ms；chip/频道切换 150ms opacity。
- 只动 opacity/位移/尺寸，不做花哨位移；animation.uts 当前全仓 0 引用，精修后至少按压、弹层、开关三处落地。

### B11 深色模式

- 层次：bg → surface → surfaceRaised 三级抬升，不用纯黑纯白（token 已具备）。
- 阴影：深色下改用 `shadowDark` 或 1rpx `border` 描边（当前 BottomSheet 阴影/遮罩深色无适配）。
- 强调色：一律 `n.value.iconActive`（浅 #D45F7E / 深 #E47A96），见 A 条规则。
- 图片：内容图保持原色不降亮（V3 §9）；但**占位/失败底色必须 token 化**（product/detail 两处 `#F2F2F2` 深色下发光）。
- 图标：AppIcon 颜色烘焙在 SVG 里深色不变色——精修期先在调用点用 `isDark` 换色或换图标资源，长期方案另行评估。
-  pastel 底（reminder TYPE_COLORS、budget 分类点）必须有 DARK 对照表，禁止浅色 hex 直出。

### B12 数值纪律

- 4rpx 网格；散值（2/5/6/10/14/18/30/98/337 等）清零。
- 字号只用 v3FontSize 十档；禁 18/26；最小 caption 22（2xs 20 仅限计数器等极次要标签）。
- 圆角只用 v3Radius 刻度 + capsule；禁 14/30/32 半高字面量（圆形一律 capsule 9999）。
- 层级四要素规则：相邻信息层级必须在"字号/字重/颜色"中**至少差两项**，禁止只拉一档字号。
- 金额格式化统一入口（当前 `¥` 直拼 / `formatCentsYuan` / `formatPriceOrZero` 三套并存，wardrobe 还有疑似分/元单位 bug）。

---

## C. 诊断表

严重度：**P0** 正常使用直接可见的粗糙/错误；**P1** 同类元素不一致；**P2** 可更优。

| # | 页面或组件 | 密度档 | 问题 | 严重度 | 违反条款 | 建议改法 | 对齐原则 |
|---|---|---|---|---|---|---|---|
| 1 | 全站 | 两档 | 按压态 0 覆盖；animation token 全仓 0 引用，所有状态变化瞬时跳变 | P0 | B10 | 落地 press token，按"组件层先行"逐批加 touchstart/end | 新 App：短促物理感动效 |
| 2 | purchase/index | 管理 | cardAmountRow/cardRemaining/cardTotal 样式写好了但模板没渲染——订单卡无金额、无日期 | P0 | B2 | 接回模板：金额右对齐、待付红/结清绿、下个日期独立行 | 管理档：金额强语义 |
| 3 | budget/index | 管理 | 分类圆点 8 个硬编码 hex 深色零适配；进度条 `#E8956A`；18/26rpx 非标字号；保存钮 72rpx | P0 | B11/B12/B4 | 收敛 categoryColors+DARK 对照；预警色走 semantic；字号归档；88rpx | B：克制；深色另一套设计 |
| 4 | ReleaseCard | 内容 | 6 处硬编码色 + 模块级固化 brand.primary；"已结束"按钮仍可点、无禁用态 | P0 | B1/B4/B11 | 走 n.value+isDark；加禁用视觉并拦截 emit | B：深色另一套设计 |
| 5 | home/index | 内容 | `<style>`+class 违规（L272-282）；行内错误文本完全无样式（L55/L81） | P0 | 工程约束/B1 | 样式移回 script 对象；错误行按 meta 24/error 语义补样式 | 工程红线 |
| 6 | NoteCard | 内容 | 点赞 emit 无 @tap 绑定（不可点）+ heart 三元死分支；原生 image 无失败态；标题无两行限制 | P0 | B1 | 修绑定与死分支；换 AppImage；lines:2 | 可用性优先 |
| 7 | discover/index | 内容 | 无骨架、无错误态，品牌区空时静默留白；日历翻月无 loading | P0 | B8 | 补骨架/错误/空三态 | V3 §7 状态完备 |
| 8 | FeedSkeleton | 内容 | 列距 44rpx vs 真实 12rpx，骨架→内容"缩缝"；无 28rpx 纵向节奏 | P0 | B8 | 与真实 Feed 同参数重写 | 骨架同形 |
| 9 | ListRow | 管理 | 行高 104（96/112 之外的第四套值）；图标容器圆角 14（刻度外孤值） | P1 | B2/B12 | 96rpx + 12rpx | 节奏统一 |
| 10 | 遮罩 | 两档 | 同语义 5 种写法（0.35黑/0.45暖黑/0.3黑/n.value.overlay/BackToTop 0.35） | P1 | B11/A2 | 统一 imageScrim + n.value.overlay 两个入口 | B：克制统一 |
| 11 | 强调色 | 两档 | brand.primary 模块级固化 8 处 vs n.value.iconActive 自适应 2 处，两派并存 | P1 | A 规则/B11 | 全部收敛 n.value.iconActive | B：深色另一套设计 |
| 12 | 胶囊圆角 | 两档 | 9999 字面量 / radius.full / v3Radius.capsule / 999 四种来源 | P1 | B5/B12 | 统一 v3Radius.capsule | 节奏统一 |
| 13 | 图片组件 | 两档 | AppImage（有骨架+重试）vs 原生 image（NoteCard/ReleaseCard/EditorialCard/ManagementRow） | P1 | B1 | 全部换 AppImage | 小红书：图片是主角 |
| 14 | 触控热区 | 两档 | 88/72/64 三规格并存；ProductCard 收藏、SectionHeader 动作、BottomSheet 关闭、wardrobe 筛选均 <88 | P1 | B4/B7 | 统一 ≥88rpx | 可用性 |
| 15 | 双列口径 | 内容 | 首页 353+16 边距 vs 收藏 337+32 边距 vs 骨架 337+44 缝，三套并存 | P1 | B1/A5 | 统一 353+16（V3 §3.3 原文），收藏/骨架同批改 | 小红书：双列节奏 |
| 16 | 卡标题字重 | 内容 | ProductCard/NoteCard 500 vs ReleaseCard/EditorialCard 600 | P1 | B1 | 统一 600 | 层级四要素 |
| 17 | 分割线 | 管理 | ListRow 恒画线 + profile 页面再画 = 双重 2rpx 线；末行去线两个标准 | P1 | B9 | 线归组件、末行判断内置；页面删自绘线 | B：发丝线 |
| 18 | reminder/index | 管理 | "已过期"用 textTertiary 灰化（最该跳出的信息被降噪）；行高 136>112；整卡 pastel 染色噪音大 | P1 | B2/B6 | 过期 error 色+SummaryStrip 高亮；112rpx；染色收敛为左侧色条或图标色 | 三坑参数 5：时间状态强语义 |
| 19 | product/detail | 内容 | 同一状态显示两遍；占位 `#F2F2F2`×2 深色发光；区块间距 ~16≠sectionGap 40；计数器死黑 | P1 | B1/B11/B12 | 状态去重；占位 token 化；间距归 token；计数器走 overlay | 深色另一套设计 |
| 20 | wardrobe/index | 管理 | 金额格式化三套并存+疑似分/元单位 bug；筛选热区 56/72<88；卡价格 24rpx 弱于 price 30 | P1 | B12/B4/B2 | 统一格式化入口修单位；热区 88；价格 30/600 | 管理档：金额强语义 |
| 21 | profile/index | 管理 | settingShell total=9 写死（未登录多一条悬空线）；头像白边深色突兀；GRID_WIDTH 335 自造口径 | P1 | B9/B11/B12 | total 改计算值；边框走 token；对齐双列 353 口径 | B：克制 |
| 22 | PageState/BottomSheet | 两档 | 模块级固化品牌色+#FFFFFF；阴影深色无适配；弹层直出直进无动画；遮罩未走 n.value.overlay | P1 | B7/B10/B11 | 样式改 computed；阴影 shadowDark；250ms 滑入 | 深色另一套+动效 |
| 23 | AppIcon | 两档 | 图标颜色烘焙在 SVG，深色不变色 | P1 | B11 | 调用点 isDark 换资源（长期方案另议） | 深色另一套设计 |
| 24 | purchase/reminder | 管理 | 底栏删除区近乎逐行复制（含同样的 `#FFFFFF` 违规） | P1 | B4 | 抽 BottomActionBar 危险位公共用法 | 节奏统一 |
| 25 | discover/index | 内容 | rpx 脱网集中地（6/10/18/30/98/337/2/5）；负 margin -32 出血 hack；文本 glyphs ‹ › 当箭头 | P2 | B12 | 散值归网格；横滑用标准容器；换 AppIcon | 现代 App 精细度 |
| 26 | home/index | 内容 | noticeDot 6rpx、marginLeft 14rpx、750rpx/240/252 魔数；navbar 无发丝线 | P2 | B12/B7 | 散值归 token；navbar 加 divider | 精细度 |
| 27 | favorites/index | 内容 | 死分支 `'开启提醒'` 两分支相同；提醒钮裸 text 热区小；死样式空对象；品牌/动态 tab 无加载错误态 | P2 | B4/B8 | 修死分支；文字按钮按 B4 包 88 热区；补两态 | 状态完备 |
| 28 | product/detail | 内容 | 主图 aspectFit 大面积留白；标题 32 用 fontSize.base 而非语义档 | P2 | B1 | 评估 aspectFill（3:4 商品图）；标题归 sectionTitle 语义 | 三坑参数 4：图片权重 |
| 29 | home/favorites | 内容 | 回顶逻辑逐行重复实现 | P2 | 工程 | 抽公共 composable | 工程整洁 |
| 30 | 正面确认 | 两档 | favorites 文字层级（同字号靠字重+颜色双区分）、ListGroup、StatusChip 深色适配、product/detail priceLarge 价格层级——即为基线标准答案 | — | — | 保持，作为其他页面整改参照 | — |

---

## D. 建议执行顺序（待确认后动代码）

1. **批次 1 · 通用零件（组件层，全局受益）**：press token + 按压态落地到 ProductCard/ListRow/FilterChips/SectionHeader/PageState/BottomSheet；FeedSkeleton 同形修正；ListRow 高度/圆角收敛。
2. **批次 2 · 一级 Tab 页**：home（去 style 块、错误行样式、navbar 发丝线）→ discover（三态+散值）→ favorites（死分支、热区、双列口径）。
3. **批次 3 · 管理页**：purchase（金额行接回）→ reminder（过期语义+行高）→ budget（hex 收敛+深色）。
4. **批次 4 · 深色模式与动效收口**：强调色 iconActive 统一、遮罩 scrim 统一、阴影 shadowDark、BottomSheet/Switch 动效。

每批 ≤3 个页面/组件，改完跑 `npm run verify` 保持 6/6。
