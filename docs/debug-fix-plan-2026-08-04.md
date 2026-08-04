# 三坑绮橱 调试版 App 修复计划（2026-08-04）

基线：commit 501a67f（用户压缩包导入，70 文件未提交修改已入库）
目标：修复调试版 App 12 个问题，修复后用户重打包验证。

## 执行分工

- 简单/中等（MiMo 2.5）：问题 3、6、7、8、9、12
- 困难/复杂（MiMo 2.5 Pro）：问题 1+4（导航栏重设计）、2（深色跨页审计）、5（Tab 架构）、10（搜索框）、11（服务端搜索）

## 通用铁律（所有子代理必须遵守）

1. 这是 **UniApp X** 项目（.uvue/.uts），不是 Flutter，禁止生成 .dart/.vue
2. `.uvue` 文件**禁止用 write_file 整体覆写**（会删 template 区），只能用 patch 工具做片段编辑
3. 改完 .uvue/.uts 后检查重复 const：`grep -n '^const .* = ' <file> | cut -d' ' -f2 | sort | uniq -d`
4. 不要 git commit，只改文件，由主 agent 统一 review + commit
5. 禁止猜测：每个修复点用 grep/read 证明现状，改完用 grep 验证
6. 不删除 CSS 类而不补 inline style（破坏布局）；深色模式必须保持 n.value 响应式

---

## 问题 1 + 4：导航栏图标分散不规整 + 选中态碎片卡片 + 选中区域过小

难度：困难（Pro）

### 根因（已确认）

`components/layout/AppBottomNav.uvue`：
- 激活药丸 `activePillStyle`：96rpx × 72rpx、top:10rpx、absolute 定位 → 悬浮在图标背后呈"碎片卡片"感，且尺寸过小（选中区域 72rpx vs 栏高 112rpx）
- TAB_ICON_SIZE=36rpx、TAB_LABEL_FONT=18rpx（theme/tokens/responsive.uts:86-88）→ 图标小、标签小，视觉分散
- 图标 `mode="aspectFit"` + 各图标源图宽高比不一致 → 视觉不规整
- 容器 `justifyContent: 'space-between'` + 每项 flexGrow:1 flexBasis:0 → 理论上等宽，但图标/标签组合在小尺寸下显松散

### 修复要求

按设计稿「三坑绮橱-UI优化设计」浮岛胶囊规范重做 AppBottomNav：
1. 图标统一放大（44-48rpx），五图标视觉等高居中，aspectFit 不变
2. 激活态改为**整项背景胶囊**（覆盖图标+标签区域，高 88-96rpx、圆角 9999rpx），不要悬浮碎片
3. 选中态配色：浅色 `neutralLight.surfacePink`(#FCEFF2) + 文字 brand[700]；深色 `n.value.surfaceWarm` + brand[300]，保持 isDark 响应式
4. 非激活项文字 n.value.textTertiary，图标保持原 PNG（static/tabbar/tab-*.png）
5. 激活图标仍用 tab-{id}-active.png
6. 保持浮岛容器样式（left/right 24rpx、bottom safeBottom+16、圆角 56rpx、阴影）
7. 完成后 grep 验证无重复 const、无 write_file 破坏

---

## 问题 2：深色模式不能跨页面显示 + 返回导航页变回跟随系统

难度：困难（Pro）

### 根因（部分已确认 + 需审计）

- **已确认**：7 个页面存在硬编码浅色值，深色下不生效：
  `grep -rln "#FBF6F3\|#FFFFFF\|#F0E8E2\|#FCEFF2" pages/` → purchase/index、wishlist/index、community/index、reminder/index、ai/index、dev/v2-visual-lab、dev/feed-spike
  （如 reminder/index.uvue:75 `borderColor: '#F0E8E2'` 硬编码浅色描边）
- **疑点**：tab 切换用 `uni.redirectTo`（utils/tab-navigation.uts）→ 页面销毁重建，主题初始化链路可能闪回 system；需要验证 storage 键 'v2_theme_mode' 写入/读取在 Android App 上的行为
- use-theme.uts 三态逻辑本身正确（reactive + getter + storage）

### 修复要求

1. 按 `references/dark-mode-audit-pattern.md` 全仓审计硬编码浅色 → 全部改 n.value 响应式或 semantic 色
2. 页面 onLoad/onShow 的 initPageTheme 保持幂等；确认无任何路径把 themeMode 重置回 'system'
3. 配合问题 5（switchTab）消除页面重建导致的主题闪回
4. 深色下所有页面背景/卡片/文字/分割线/输入框均生效

---

## 问题 3：设置偏好里去掉深色模式选择

难度：简单（MiMo 2.5）

### 根因（已确认）

`pages/preferences/index.uvue` 第 8-24 行「外观」区块：themeOptions 三选一（跟随系统/浅色/深色）radio。

### 修复要求

1. 删除整个「外观」section（V2SectionHeader"外观"、hintText、radioRow、themeDivider 及对应样式函数 radioItem/radioOuter/radioInner/radioLabel、themeOptions/currentTheme/onThemeChange）
2. 保留坑向偏好 + 内容偏好 + 重置
3. 删除后 grep 确认无残留引用（setThemeMode/themeOptions/currentTheme）
4. 深色切换保留在"我的"页（toggleDarkMode），用户通过那里固定深色

---

## 问题 5：每次切换导航栏每个页面刷新

难度：困难（Pro）

### 根因（已确认）

`utils/tab-navigation.uts`：APP 平台 `openPrimaryTab` 用 `uni.redirectTo` → 每次切 Tab 销毁当前页并重建 → onMounted 重新拉数据（首页 loadFirstPage、我的页 onShow 全量 reload）→ 全页刷新效果。
小程序端用原生 switchTab（页面保活）所以无此问题。

### 修复要求

1. pages.json 增加 `// #ifdef APP` 的 tabBar 块（5 个 tab 页：home/discover/ai/community/profile），加 `"custom": true`（隐藏原生 tabbar UI，仅注册页面保活）
2. `openPrimaryTab` APP 分支改 `uni.switchTab({ url })`
3. AppBottomNav 保持自定义浮岛渲染（#ifdef APP 页面内）
4. 页面 onShow 的重载逻辑加防抖/去重（我的页 onShow 全量 reload：session.reload/library.reload/fetchPurchases/fetchItems/fetchItems 改为 store 内已加载则跳过或 TTL）
5. 验证：pages.json 语法（含注释）、无页面路径错误

---

## 问题 6：我的里坑向偏好无法选择

难度：简单（MiMo 2.5）

### 根因（已确认）

`stores/preferences-store.uts` DEFAULT_PIT_TYPES = `['JK','LOLITA','HANFU']`（大写英文），但 UI（pages/preferences/index.uvue:120）chips 是 `['JK','Lolita','汉服']`。
- 首次加载：JK 显示选中，Lolita/汉服显示未选中（indexOf 大小写不匹配）
- 点 Lolita：添加 'Lolita' → 变选中；再点：删除 'Lolita' 但 'LOLITA' 仍在 → 看起来"选不中/删不掉"
- 同理 '汉服' vs 'HANFU'

### 修复要求

1. DEFAULT_PIT_TYPES 改为 `['JK', 'Lolita', '汉服']`（与 UI 文案完全一致）
2. readPreferences 迁移旧值：'LOLITA'→'Lolita'，'HANFU'→'汉服'（大小写/中文归一）
3. togglePitType 逻辑不变，验证 toggle 后 isPitSelected 正确
4. grep 验证无其他 'LOLITA'/'HANFU' 与 UI 标签混用

---

## 问题 7：某些保存按钮看不见 + 文字白色

难度：简单（MiMo 2.5）

### 根因（已确认）

- `components/base/AppButton.uvue` soft 变体：`bg: brand[300] (#E891A8 浅玫) + text: white` → 浅粉底白字，几乎不可见（line 53）
- `pages/reminder/index.uvue:86` FAB：`backgroundColor: brand[300]` + 白色 add-active 图标 → 低对比
- `pages/community/index.uvue:17-18` V2Segmented variant="text" activeColor=brand[300] → 选中文字浅粉（此条属问题 9，一并修）

### 修复要求

1. AppButton soft 变体：文字改深色（brand[700] 或 #7A2030），保留浅粉底；或底改 brand[500]+白字（按设计稿柔和按钮规范：浅底深字）
2. reminder/index FAB：底色改 brand[500]/brand[600]（白图标）或浅底+brand[700] 图标
3. 检查其他使用 brand[300] 做底/选中色的按钮/FAB（grep `brand\[300\]` pages/ components/）
4. 保持 dark 模式可用（深色下 brand[600] 底）

---

## 问题 8：提醒无法添加 + 提醒/愿望单有模板数据删不掉

难度：简单（MiMo 2.5）

### 根因（已确认）

- `domain/repositories/wishlist-repo.uts` `initMockData()`（line 187-201）：**无 mockOnline 守卫**，storage 为空时无条件写入 6 条模板心愿（w1-w6）
- `stores/wishlist-store.uts:137` fetchItems 每次调 initMockData
- `domain/repositories/reminder-repo.uts` initMockData（line 104-124）有 mockOnline 守卫，但用户调试版若此前 mockOnline=true 运行过，r1-r5 已写入 storage 且永不清理
- 「无法添加提醒」：与问题 7 相关（FAB 不可见/低对比），另外需验证 pages/reminder/edit.uvue 保存链路（save → store.addItem → repo.add 正常）

### 修复要求

1. wishlist-repo initMockData 加 mockOnline 守卫（或直接删除该函数与调用）
2. 两个 repo 增加**清理存量模板数据**逻辑：loadAll 时过滤已知模板 ID（r1-r5 / w1-w6）或首次升级时删除
3. 删除 stores 中 fetchItems 里的 initMockData 调用
4. 验证：清空 storage 后首次进入不再出现模板数据；手动删除真实条目后不复活
5. 验证提醒添加链路：edit 页 save → store.addItem → repo.add → storage 持久化

---

## 问题 9：某些页面标签选中效果看不见（同保存按钮）

难度：简单（MiMo 2.5）

### 根因（已确认）

- `pages/community/index.uvue:17-18`：V2Segmented `variant="text"` + `activeColor=brand[300]`（#E891A8 浅粉）→ 选中文字几乎看不见
- `pages/reminder/index.uvue:17`：V2Segmented `variant="soft"` + `activeColor=brand[300]` → 选中 chip 浅粉底+浅粉字（chipText soft 分支 active 用 activeColor）
- V2Segmented 组件 text 变体默认 active 色也是 brand[300]（components/v2/V2Segmented.uvue:59）

### 修复要求

1. community 两处 activeColor 改 brand[600]/brand[700]
2. reminder 页 activeColor 改 brand[600]
3. V2Segmented 组件默认值 brand[300] → brand[600]（text 与 soft 分支）
4. grep 验证无其他 brand[300] 作选中文字色的地方

---

## 问题 10：搜索页搜索框特别简陋（UI 样式掉了？）

难度：困难（Pro）

### 根因（已确认）

`pages/search/index.uvue` 搜索框 = AppInput 直接塞进 AppNavbar 的 #default slot（centerStyle），80rpx 高、bgTertiary(#EDE8E9) 纯灰圆角矩形，无设计稿的搜索框视觉（无品牌色、无阴影、icon 挤在左上 flex-start）。设计稿搜索框应是圆角胶囊 + 搜索图标 + 浅粉/白底 + 阴影的完整样式。

### 修复要求

1. 按设计稿重做搜索框视觉：AppInput 或包一层容器——圆角胶囊（radius.full）、白底/浅粉底、左侧搜索 icon 居中、高度 72-80rpx、细边框或阴影
2. 保持 AppNavbar 布局（左返回、右取消、中间输入），输入聚焦态边框 brand 色
3. 深色模式适配（n.value 响应式）
4. 不要改动搜索逻辑

---

## 问题 11：搜索"洛丽塔"没有任何变化

难度：困难（Pro）

### 根因（已确认）

- 前端搜索页（pages/search/index.uvue）**只做客户端过滤**：`results = sourceItems.filter(...)`，数据源 `store.allItems` = 首页 feed 缓存（上限 60 条，且 MAX_CACHED_ITEMS 裁剪）
- 数据库分布 94% OTHER / 2.6% JK / 2.4% LOLITA / 1% HANFU → 60 条缓存里基本没有 LOLITA 商品 → 搜"洛丽塔"永远空结果
- **后端已有搜索接口**：`GET /api/v1/search`（sankengcloset_service/src/routes/content.ts:74 → repository.searchProducts），前端未使用

### 修复要求

1. 前端新增搜索服务调用（services/content/ 或直接 api-client）：`GET /api/v1/search?q=<keyword>&cursor=&limit=20`，参考 feed-service.uts 的 mapFeedItem 复用（或抽公共 mapper）
2. 搜索页改为：输入防抖（300-500ms）→ 调服务端搜索 → 渲染结果；关键词为空清空结果
3. 保留"最近搜索/热门搜索"区块（keyword==='' 时展示）
4. 先确认后端 searchQuerySchema 字段名（q?keyword?）与返回结构（success 包装 items + nextCursor/hasMore），与后端对齐
5. 结果卡片复用 V2ProductCard，点击进详情（已有 onResultTap）
6. 错误态/加载态处理，深色适配

---

## 问题 12：首页上拉加载更多无法加载剩余数据

难度：简单-中等（MiMo 2.5）

### 根因（已确认）

`stores/home-feed-store.uts` `loadMore()`（line 203-229）：
- 每次追加后若 `merged.length > MAX_CACHED_ITEMS(60)`：按 createdAt **降序**排序后 `slice(0, 60)` 保留最新 60 条
- feed 接口按 offset 分页（feed-service.uts:58 `offset = pageIndex*20`），越往后页数据越旧 → 新追加的旧数据**每次都被裁剪丢弃** → 页面数量永远不增长，但 hasMore 仍为 true → 永远显示"上拉加载更多"却加载不出新数据（滑到约 3 屏=60 条后出现）

### 修复要求

1. 移除 MAX_CACHED_ITEMS 裁剪逻辑（中小型应用 60 条上限没必要，YAGNI），或改为：追加后直接保留全部（可设更高上限如 500）
2. 顺带核对后端 cursor 语义：前端传数字 offset，后端是否按 cursor 数字偏移分页（查 sankengcloset_service/src/routes/content.ts feedQuerySchema + repository.listFeed）——若 cursor 应为不透明 ID 需修正
3. 加载更多错误时 hasMore 保持原值、可重试
4. 验证：滑到底持续加载出第 4、5 屏数据；"已显示全部"在有尽时出现

---

## 修复后验证清单

1. grep 无重复 const、无 write_file 破坏（template 完整）
2. 无 mock/模板数据残留（r1-r5/w1-w6/initMockData 调用）
3. 无 brand[300] 选中色残留
4. HBuilderX CLI 编译 app-android 通过（若服务器可行）
5. git commit（主 agent 统一提交）+ 报告

## 涉及文件清单

components/layout/AppBottomNav.uvue、utils/tab-navigation.uts、pages.json、theme/tokens/responsive.uts、
theme/use-theme.uts、stores/preferences-store.uts、pages/preferences/index.uvue、pages/profile/index.uvue、
components/base/AppButton.uvue、pages/reminder/index.uvue、pages/reminder/edit.uvue、pages/community/index.uvue、
components/v2/V2Segmented.uvue、domain/repositories/wishlist-repo.uts、domain/repositories/reminder-repo.uts、
stores/wishlist-store.uts、stores/reminder-store.uts、stores/home-feed-store.uts、pages/search/index.uvue、
services/content/（新增搜索）、pages/ai/index.uvue、pages/purchase/index.uvue、pages/wishlist/index.uvue
