# 前端评审 + 审计 + 改动汇总（2026-09-13 ~ 09-14）

> 范围：`pages/` 35 个页面 + `components/` 41 个组件 + `theme/` `presentation/` `stores/` `domain/` `services/` 关键路径。
> 时间跨度：2026-09-13（截图评审首轮 ~ 第三批）、2026-09-14（第四批 ~ 第七批 + 全量审计）。
> 交付 commit：`fc46638`「refactor: 截图评审二轮落地 + 前端审计修复（9/13-9/14）」= 65 文件，+1651 / −505。
> 门禁状态：全程 `npm run verify` 6/6 通过。

---

## 一、总览

| 维度 | 评分 | 说明 |
|---|---|---|
| 视觉规范与主题体系 | 90 | 设计令牌齐全；深浅双主题；`initPageTheme` 35 页 100% 覆盖 |
| 组件复用与一致性 | 85 | V3 组件体系完整；FeedBlock/FeedColumn 各自写了一套 outfit 覆层（待合并） |
| 页面覆盖与状态完整性 | 85 | 主要数据页加载/空/错误三态齐全 |
| 交互细节（安全区/返回/长按） | 80 | 12 个叠加层页面返回拦截完整；底部浮层留白是系统性薄弱点 |
| 工程质量（测试/类型/规模） | 60 | 最大短板：仅 3 个测试文件；6 个页面超 350 行 |

**一句话结论**：设计层已相当完整，可直接继续做功能；风险在工程侧（测试近乎为零）与"看不见但一碰就出错"的底部浮层留白。

---

## 二、主题与深浅双主题收口

- **TabBar 选中色**：`syncTabBarChrome` 的 `selectedColor` 由写死 `brand[600]` 改为主题 token（浅 #D45F7E / 深 #E47A96）。这是"深色下底部导航选中态和其他几个不一样"的根因——原生 tabBar 与应用内选中态原本不是同一个颜色。
- **主题 token 全量扫描**：45 处 `brand[500]/brand[600]` → `n.value.iconActive`；26 个文件的模块级对象字面量改为 `computed`；清理 8 个文件的失效 `brand` import；给 AppFab 补 `n`。
- **深色主文字**：`neutralDark.text` #F7F3F4 → **#E8E3E4**（对标 Material3 / GitHub / X 的浅色文字取值，暖黑底约 14:1）。
- **BackToTop 深色修复**：圆底写死 `rgba(0,0,0,0.35)`，深色暖黑底上几乎不可见 → 深色改 `surfaceRaised` + 发丝描边，浅色保持原样。
- **`initPageTheme` 全仓审计**：8 个页面从不调用它（about/legal、editorial/detail、privacy/index、purchase/detail、purchase/import、reminder/edit、search/index、share/create），已补齐。后三个原本无任何生命周期钩子，改用 `onShow`。
  - 教训：原生控件（picker-view / tabBar）按「页面」读 appTheme，每个页面都必须 `initPageTheme`。

---

## 三、日期选择器：回退系统弹层

- **决策**：用户拍板"系统弹层本来就是正常的"，放弃自绘 `picker-view` 方案。
- **`components/v3/DateField.uvue`**：由自绘 picker-view 底部面板（约 200 行）改为 `<picker mode="date">` 包装（约 90 行），触发行观感不变（88rpx 高、16rpx 圆角、日历图标）。
- **`pages/reminder/edit.uvue`**：5 列自绘面板 → 拆成「日期」`<picker mode="date">` + 「时间」`<picker mode="time">` 两行；删除约 100 行死代码（`showDatePicker` / `dateTimePickerVal` / `pickerYear*` / `initDateTimePicker` / `onDateTimeChange` / `confirmDateTime` + 面板样式），失效的 `isDark` / `zIndex` / `brand` import 一并移除。
- **`pages/purchase/edit.uvue`**：删除 3 个 `showXxxDate` 状态 + `onBackPress` 拦截（弹层由系统自己开关，不再由页面托管）。
- **已知取舍**：系统弹层遵循 `manifest.json` 的 `darkmode: true`（跟随**系统**深浅），"App 深色 + 系统浅色"时仍会偏白——原生弹层固有行为，token 覆盖不到。将来真要 100% 可控，只有完全自绘的宫格选择器一条路（不再用 `picker-view`）。
- **年份范围**：DateField 过去 15 年 ~ 未来 5 年（能补录历史订单）；提醒日期 ±5 年（编辑旧提醒年份必须选得回来）；回填越界值夹端点、默认落今年。

---

## 四、衣橱：形制字段 + 款式词表

- **汉服「形制」字段已加**（用户确认后端据此前端补）：
  - `WardrobeItem.silhouette` + `WardrobeUpdateData.silhouette` + `mapRemoteWardrobe` 远端读取 + 编辑页 ChipPicker（仅汉服显示，词表 宋制/明制/唐制/晋制/秦汉/现代改良），离开汉服坑向自动清空。
  - **维度结论**：形制与部件是**正交并列**维度，不做父子层级（马面裙 = 部件「马面裙」 × 形制「明制」；旋裙 = 下裙 × 宋制）。仅展示顺序上形制在前。
  - ⚠️ **仍需后端字段 `wardrobe_items.silhouette`**，否则本地能存、同步即丢。
- **款式词表随坑向切换**：JK 水手服/衬衫/格裙/百褶裙/马甲/领结/鞋/小物、LOLITA JSK/OP/SK/背带/衬衫/外套/鞋/包/发饰/小物、汉服 上衣/下裙/褙子/马面裙/短袄/披帛/鞋/配饰、其他 上衣/下装/连衣裙/外套/鞋/包/配饰。
  - 标签统一叫「款式」（用户否掉「型别」），换坑向自动清空不合法款式。
  - **「其他」类目已删**：坑向=其他时无预设词表，走自由输入（避免逼用户乱选坑向、污染统计）。
- **JSK/OP 口径（Lolita）**：型别是「规格 / SKU 属性」不是「分类标签」，一个链接卖 JSK+OP → 详情页并列 chip 正确；列表卡不展示型别；衣橱侧保持单值 ChipPicker。后端字段约定 `product_variants.style_name`。

---

## 五、榜单入口重构

- **删掉解释副行**：发现页三张榜单卡（热榜/上新榜/收藏榜）原本「图标独占一行 + 名称 + 提示语（大家在看/最近收录/心动收藏）」三行松散堆叠。用户判断"把入口当说明文案用"不是主流做法 → 改为**图标 + 名称横排**，卡高 124 → 104rpx。
- **热榜图标**：曾试图加 `flame` 火焰图标（认为更直观），用户指出"热榜"已表意、同义图标多余 → 删除 `flame.svg` / `flame-active.svg`，回退 `sparkles`。
- **名次徽标升级**：前三名实底金属圆盘 + 白字（冠军 64rpx），四名后去底纯数字。
- **榜单口径修正**：热榜改「x 人浏览」、收藏榜改「x 人收藏」（原来两处都用 favoriteCount，且热榜错写成"人收藏"）。新增 `RankingItem.viewCount` → ranking-service 映射 → mock 补值。

---

## 六、商品详情与商品卡

- **去「可选」前缀**：规格区的款式 / 颜色 / 尺码（用户拍板不要"可选"二字）。
- **删卖点标签行**：与「发售信息 → 当前状态」重复，数据保留给筛选；品牌行改 `flexWrap` + 统一 12rpx 间隔。
- **9 处模块级 `brand[...]` → `n.value.iconActive`**（track 用 `bgTertiary`），移除未用 `brand` import。
- **双价降级（旧4-B）**：新增 `formatPricePrimary` / `formatPriceSecondary`，`ProductCard` 加 `priceSubText`，5 个调用方接上；定金小字改挂**状态 chip 下方（左列）**，与主价形成左右两列。
- **商品卡定金空洞修复**：原 `marginBottom` 28rpx + 8rpx ≈ 36rpx 空白是"中间很大空白"主因 → 新增 `ProductCard.marginBottom` 属性（默认 28rpx），收藏页传 `0`。
- **商品详情底部留白**：`actionSpacer` 按操作栏真实高度算（旧值 62px < 栏高，卡片被压住）。
- **屏蔽品牌动作面板（方案 D）**：商品详情导航栏加 `#right` 插槽（more 图标 88rpx 热区）→ `showActionSheet`：分享商品 + 屏蔽/恢复该品牌；品牌行只在"已被屏蔽"时显示「已屏蔽·恢复」胶囊，未屏蔽不占位。
- **卡片价格统一品牌粉**：`ProductCard.priceStyle` 与 `wardrobe.cardPrice` 由 `n.value.text` → `n.value.iconActive`。未动购买记录列表金额（金额+状态语义，带红/灰区分，改了会丢区分度）。

---

## 七、搭配度整体下线

- 删除 `services/ai/wardrobe-compatibility-service.uts`；商品详情移除搭配度卡与全部相关 computed / 样式 / import。
- `check-v24-remote-runtime.js` 移除 3 条旧契约断言（否则门禁会红）。
- 原因：原算法是启发式 v1（白送分 + 布尔命中 + 纯关键词、不用图片），不适合以百分比上线；真做需 CLIP/SigLIP 向量 + 搭配语料 + 后端排期，等排期重做。
- 恢复方式：`git checkout <删除前的 sha> -- services/ai/wardrobe-compatibility-service.uts`。

---

## 八、收藏页多选态底栏留白修复（审计发现 P0-1）

- 多选态浮起的删除栏（≈148rpx）后，页面只留默认安全区 40rpx → 最后一行卡片被盖住。
- 新增 `pageBottomSpacer` computed，多选时传 `188rpx` 给 `MainLayout` 的 `bottom-spacer`。
- 系统性教训：新增任何 `position: fixed; bottom: 0` 底栏时，必须同步给 `MainLayout` 的 `bottom-spacer` 传足够高度（`PAGE_BOTTOM_SAFE_SPACER` 只有 40rpx，仅够安全区）。已踩过 `product/detail` 与 `favorites` 两次。

---

## 九、孤儿资源清理

- 删除 `static/tabbar/tab-ai.png` / `tab-ai-active.png`（换掉「绮灵AI」后的遗留）、`static/icons/flame.svg` / `flame-active.svg`。
- `tab-community-active.png` 修复：原是粗重填充版（2265 不透明像素 vs 其他 438~818，还混 339 个纯白像素）= "发亮"真凶；按仓库里的 `tab-community.svg` 描边版重新生成 PNG，与其余四个一致。
- `static/icons/` 仍剩 24 组未引用图标（含动态引用的 `sparkles`、榜单候选 `grid/database/bow/wardrobe/history`），建议等图标方案定稿后一次性清理。

---

## 十、全量前端审计（含 2 处 P0 已修）

- 审计文档：`docs/design/FRONTEND-AUDIT-2026-09-14.md`（总评 84/100、35 页逐页审核表、P0/P1/P2 缺陷清单、给后端的形制字段契约、5 条进阶建议）。
- **P0-1**：收藏页多选态底部留白（见第八节）。
- **P0-2**：BackToTop 深色不可见（见第二节）。
- 逐页审核：✅ 24 页 · ⚠️ 9 页 · ❗ 1 页（`editorial/detail` 全文 0 处 `n.value`，无主题响应式样式，加正文颜色即翻车）· `privacy/index` 未用统一布局。

---

## 十一、测试

- 新增 `tests/reminder-overdue.test.cjs`（5 用例）：当天宽限（今天到期即使时刻已过仍为"今天"）、提醒日已过 → 已过期、MISSED → 已过期 / DONE → 已完成（不混组）、未来分档、分组顺序 done 最后。
- 坑：vm 跨 realm 数组做 `deepStrictEqual` 会因原型不同报 "same structure but not reference-equal"，已在文件里注释说明（需 `for..of` 重建数组再断言）。

---

## 十二、给后端的字段契约（形制）

| 项 | 值 |
|---|---|
| 接口 | `GET/PUT/POST /api/v1/me/wardrobe` |
| 字段名 | `silhouette`（string，缺省 `""`） |
| 语义 | 汉服的**形制 / 年代**，与 `style`（部件/衣型）**并列、不是父子** |
| 取值（前端词表） | 宋制 / 明制 / 唐制 / 晋制 / 秦汉 / 现代改良（允许自由文本） |
| 生效条件 | 仅当 `category == 'HANFU'` 时前端展示与提交；其他坑向一律为空串 |
| 未加该字段的后果 | 本地能存，**同步即丢** |

同一批已在用的旧字段（若后端尚未支持同样会丢）：`style`（部件）。

---

## 十三、已知取舍与风险

1. **系统日期弹层跟随系统深浅**：App 深色 + 系统浅色时偏白，属原生行为，无法用 token 覆盖。
2. **模块级 brand 残留约 20 处**：购买详情/反馈/通知/偏好/品牌页/我的/社区等仍用 `brand[500/600]`，深色下不刷新（暖黑底对比度仅 2.7~3.3:1）。全站统一品牌粉应为 `n.value.iconActive`，待扫成主题 token。
3. **无真机/截图验证**：深色模式下的视觉修复（如 picker 白面板、tabBar 选中色一致性）靠代码推断 + 用户口头反馈确认，未逐项截图核对。
4. **搭配度下线**：相关能力暂时缺失，恢复需后端排期 + 向量模型。

---

## 十四、后续待办（P1，未随本次推送）

1. `editorial/detail` 接主题响应式（补 `n.value`）。
2. 测试覆盖：store CRUD + 同步重放、价格格式化（双价降级）、分组/筛选纯函数、MonthPicker/ChipPicker 交互。
3. 大文件拆分：`reminder/edit`(558) / `favorites`(545) / `product/detail`(512) / `search`(460)。
4. `budget/index:288` 字号 18rpx → ≥20rpx。
5. `FeedBlock` 与 `FeedColumn` 的 outfit 覆层（含 `rgba(0,0,0,0.3)` 硬编码）抽成共享 token。
6. 空态文案统一收敛到「`<模块>`还空着 + 一句行动引导」；图标资产盘点（77 个 SVG 中 24 组未引用）。
