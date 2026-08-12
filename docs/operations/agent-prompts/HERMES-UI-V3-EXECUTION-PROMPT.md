# Hermes 执行提示词：三坑绮橱全局 UI V3 统一

你现在负责《三坑绮橱 / Sankeng Closet》的全局 UI V3 统一改造。先完整读取仓库和本提示词，不要重新规划产品，不要恢复 Dashboard 或衣橱管理工具首页。

## 仓库与边界

- 仓库：`burnkings/sankengcloset`
- 工作分支：从 `agent/upload-current-fix-20260806` 最新提交新建 `agent/design-system-v3-20260812`
- 审计基线：`5458f14f9ae4e1a76cd154ea5eb21ad3f16ba18a`；执行前重新 fetch 并记录真实 HEAD，如已变化则以新 HEAD 为基线说明差异
- 不修改 `main`
- 不 force push
- 不合并 PR
- 不改后端契约、Store 数据结构或当前 Mock 登录逻辑
- 不修改 `vendor`、`dist`、`unpackage`、构建产物或密钥

## 唯一设计基线

先把随提示词提供的《三坑绮橱 Design System V3.0》保存为：

`docs/design/DESIGN-SYSTEM-V3.md`

本文件是唯一生效的设计规范。所有页面、组件、视觉状态和验收必须逐条对照该文档。

视觉方向：参考小红书的图片优先、双列浏览、低噪声容器、搜索与频道前置，但不复制品牌红、图标、文案或像素。三坑绮橱使用暖白画布、莓玫主色和三坑专属内容结构。

## 不得恢复

- 首页 Dashboard、统计、快捷入口、“坑向分类”入口。
- 大面积 Hero、水平统计胶囊、白色长卡片堆叠。
- emoji 图标/占位、硬编码颜色、空点击函数。
- 假商品、假穿搭、假降价、假 OCR、假 Token。
- 站内支付、购物车、立即补尾款等交易误导。

## 当前必须覆盖的 28 个用户页面

```text
pages/home/index.uvue
pages/discover/index.uvue
pages/favorites/index.uvue
pages/community/index.uvue
pages/community/mine.uvue
pages/profile/index.uvue
pages/notification/index.uvue
pages/search/index.uvue
pages/share/create.uvue
pages/product/detail.uvue
pages/editorial/detail.uvue
pages/wardrobe/index.uvue
pages/wardrobe/edit.uvue
pages/budget/index.uvue
pages/purchase/index.uvue
pages/purchase/detail.uvue
pages/purchase/edit.uvue
pages/purchase/import.uvue
pages/wishlist/index.uvue
pages/wishlist/detail.uvue
pages/wishlist/edit.uvue
pages/reminder/index.uvue
pages/reminder/edit.uvue
pages/preferences/index.uvue
pages/preferences/appearance.uvue
pages/preferences/notification.uvue
pages/about/index.uvue
pages/about/legal.uvue
```

一级导航保持：`首页 / 发现 / 收藏 / 圈子 / 我的`。不要重新加入绮灵 AI 一级 Tab；AI 辅助继续出现在商品决策、订单导入和其他真实情境入口。

## 执行方式

### Phase 0：只读盘点与截图基线

1. 读取 `AGENTS.md`（如存在）、`pages.json`、全部 28 个页面、`components/base/**`、`components/v2/**`、`theme/**`。
2. 全仓搜索：Hero、`V2StatsCard`、emoji、硬编码颜色、`gap`、`calc()`、CSS Grid、浏览器 API、空事件函数。
3. 输出引用关系，尤其是 `theme/components/hero.uts`、`card.uts`、`toolbar.uts`。
4. 记录当前分支 SHA 和工作区状态。

### Phase 1：V3 Token 与组件

1. 按 V3 文档统一颜色、字体、间距、圆角、阴影、响应式尺寸。
2. 首页/圈子 Feed gutter 16rpx、双列 gap 12rpx、固定列宽 353rpx；普通页面 gutter 32rpx。
3. 建立非版本化组件：`PageHeader`、`SectionHeader`、`ChannelTabs`、`FilterChips`、`SegmentedControl`、`ListGroup`、`ListRow`、`SummaryStrip`、`StatusChip`、`AppSwitch`、`ProductCard`、`NoteCard`、`ReleaseCard`、`EditorialCard`、`ManagementRow`、`FormSection`、`DateField`、`FeedSkeleton`、`PageState`、`BottomActionBar`、`BottomSheet`。
4. 更新基础组件视觉；`AppTag` 删除 emoji 能力；`AppIcon` 覆盖所有正式图标。
5. 新建 `pages/dev/design-system-v3.uvue`，展示浅/深主题、全部组件和 loading/empty/error/disabled。

完成 Phase 1 后单独提交并运行三个现有静态门禁；失败先修复再进入页面。

### Phase 2：五个一级页面

按顺序逐页改造并分别提交：

1. 首页：品牌/通知、搜索、推荐/新品/预约/降价/穿搭；商品双列，发售/专题单列；删除首页坑向分类和一切管理统计。
2. 发现：搜索、专题、趋势、品牌/日历入口；不重复首页商品 Feed。
3. 收藏：商品/穿搭/品牌/合集；复用相同卡片；支持取消与撤销；Mock 只写本地。
4. 圈子：推荐/最新/JK/Lolita/汉服双列笔记；唯一发布入口；空/错/离线不白屏。
5. 我的：紧凑个人头部、我的内容、管理中心、设置支持；保留 Mock 内测本机数据标识。

### Phase 3：内容与详情页

改造搜索、通知、商品详情、编辑专题、发布、我的动态。商品详情底部固定为：`收藏 / 设置提醒 / 前往官方渠道`；外跳后由用户确认是否记录购买。

### Phase 4：管理中心

改造衣橱、愿望单、购买、提醒、预算及其全部详情/编辑/导入页。

- 用 `SummaryStrip`/分组列表替代大统计卡。
- 订单金额继续输入元、存储分、展示元。
- 保存、订单导入、心愿转订单、订单入橱全部防重复。
- 未配置 OCR 时只进入手动补全，不伪造成功。
- 提醒编辑移除 `👗 / ✓ / ✕ / ›` 等文本符号。

### Phase 5：偏好、关于与清理

改造内容偏好、外观、通知、关于、协议。外观必须为跟随系统/浅色/深色三态。

新增 V3 规范已提交且全仓引用清零后，执行：

```bash
git rm docs/design/DESIGN-LANGUAGE-V2.md
git rm Product-V2-Gate0-Visual-Rebuild-Report.md
git rm Product-V2-Responsive-Visual-System-Report.md
git rm pages/dev/v2-visual-lab.uvue
```

`ui-playground` 和 `page-playground` 先迁移仍有价值的测试，再删除旧视觉内容或合并进 `design-system-v3`。保留 `feed-spike` 与 `device-diagnostics`。

旧组件和 `theme/components/hero.uts` 只能在 `rg` 证明引用为零后删除；`card.uts`、`toolbar.uts` 同理。同步删除 `pages.json` 中失效路由。

历史产品/技术报告保留，但在文件顶部加“历史报告，不具备当前视觉规范权”，不得大范围重写历史正文。

## UniApp X / Android 红线

- App 使用 Vapor + `list-view/list-item`；微信使用分页 `scroll-view`/页面滚动。
- 长列表明确像素高度，不用 `height: 0 + flex`。
- 关键布局不用 CSS Grid、`gap`、`calc()`。
- 主 `v-for` 放在 App `list-item` 复用层，稳定 key，复用时清内部状态。
- 不在 computed 中反复创建 Store。
- 不使用 DOM、Window、localStorage 等浏览器 API。
- 不批量替换 UTS 语法；复杂返回显式类型。
- 所有页面处理状态栏、微信胶囊、TabBar 和底部手势安全区。

## 提交策略

- Phase 1 一个提交。
- 五个一级页面每页一个提交。
- 内容页、管理中心按闭环拆分提交。
- 清理旧文档和零引用组件单独提交。
- 每个提交只含本阶段相关文件，禁止压成一个巨型提交。

## 每阶段验证

```bash
node scripts/check-v24-remote-runtime.js
node scripts/check-v25-android-beta.js
node scripts/check.js
```

最后必须另行记录：

- 微信小程序真实编译与真机。
- Android release 编译、真机启动、深色切换、页面返回。
- 首页 30/100/300 卡滚动、图片失败、弱网、滚动位置恢复。
- 320/360/375/390/414/430px 等效宽度浅/深色截图。

静态检查不能冒充微信编译或 Android 真机通过。

## 最终输出

1. 当前分支、基线 SHA、最终 SHA。
2. 每阶段提交清单。
3. 新增/修改/删除文件清单。
4. 28 个页面逐项完成表。
5. 全仓旧视觉引用清零证据。
6. 三个静态门禁结果。
7. 微信与 Android 的独立验证结果。
8. 未验证事项和剩余风险。

完成后先报告并等待确认；不修改 main，不合并 PR。
