# Product V2 Gate 0 Visual Rebuild Report

---

## isDark 根因与修复

**文件**: `components/base/AppImage.uvue`, `components/base/AppCard.uvue`

**根因**: 两个组件使用 `isDark.value` 但只导入了 `n`（computed neutral ref）。`isDark` 未导入导致运行时 ReferenceError。

**修复**:
- AppImage: `isDark.value ? neutralDark.bgTertiary : neutralLight.bgTertiary` → `n.value.bgTertiary`
- AppCard: `isDark.value ? neutralDark.surface : neutralLight.surface` → `n.value.surface`
- AppImage: `isDark` 现在仅存在于 `theme/use-theme.uts`（定义处）

## AppImage 空 src 行为

**修复前**: `v-if="src"` 条件判断不严格，空字符串可能通过。失败态使用 `🖼️` emoji。
**修复后**:
- `v-if="src !== ''"` — 空 src 不渲染 image 标签
- 空 src 或加载失败：显示中性骨架（`n.value.bgTertiary` 背景 + `rgba(0,0,0,0.05)` 脉冲）
- 错误态使用 `!` 文字图标，不用 emoji
- 不会报错，不会大面积空白

## 旧/新 TabBar 对比

| 旧四 Tab | 新五 Tab |
|----------|----------|
| 首页 | 首页 |
| 衣橱 | **发现** |
| 消费 | **绮灵AI** |
| 我的 | **收藏** |
| — | **我的** |

- 旧衣橱/消费页保留为二级路由（`pages/wardrobe/index`, `pages/purchase/index`）
- 不删除用户数据
- "我的"页预留"管理中心"入口

## 微信胶囊适配方案

**AppNavbar.uvue 重写**:
- 读取 `uni.getMenuButtonBoundingClientRect()` 获取胶囊位置
- 右侧操作区 `paddingRight = capsuleRight - windowWidth + capsuleWidth + 8px`
- 左侧：品牌标识"三坑绮橱"（左对齐，不居中）
- 中间：紧凑搜索框
- 右侧：消息文字按钮，自动避开胶囊
- StatusBar 高度：`sysInfo.statusBarHeight`
- 旧 `wx.getSystemInfoSync` 兼容处理

## Demo 图片资产清单

| 文件 | 尺寸 | 比例 | 用途 |
|------|------|------|------|
| static/demo/prod-01.png | 300x400 | 3:4 | JK 格裙 |
| static/demo/prod-02.png | 300x400 | 3:4 | Lolita JSK |
| static/demo/prod-03.png | 300x400 | 3:4 | 汉服马面 |
| static/demo/prod-04.png | 300x400 | 3:4 | 衬衫 |
| static/demo/prod-05.png | 300x400 | 3:4 | KC 头饰 |
| static/demo/prod-06.png | 300x400 | 3:4 | 宋裤 |
| static/demo/outfit-01.png | 300x375 | 4:5 | 甜系 JK 全套 |
| static/demo/outfit-02.png | 300x375 | 4:5 | 哥特 Lo 茶会 |
| static/demo/event-01.png | 400x225 | 16:9 | 月光曲定金开售 |
| static/demo/event-02.png | 400x225 | 16:9 | 宋制套装尾款 |

- 纯色 PNG，Python 脚本生成
- 无外部依赖，无网络请求
- 本地 static/ 目录，编译时自动复制到 mp-weixin 产物

## 首页 Feed 卡型

| 卡型 | 比例 | 布局 | 内容 |
|------|------|------|------|
| ProductCard | 3:4 | 双列 | AppImage + 品牌 + 标题(2行) + 价格 + 角标 |
| EventCard | 16:9 | 单列 | AppImage + overlay(类型标签 + 时间 + 标题 + 品牌) |
| OutfitCard | 4:5 | 单列 | AppImage + overlay(标题 + 副标题) |
| PostCard | 16:9 | 单列 | AppImage + info(标签 + 来源 + 标题 + 品牌) |

- 所有卡片使用 AppImage 组件
- lazy-load 开启
- aspectFill 裁切模式
- 骨架/错误回退内置

## 编译结果

```
HBuilderX: 5.21.2026071110-alpha
页面数: 17 (原14 + 3新Tab页)
编译: SUCCESS
patch-vendor: 5 stores patched
上传: v2.0.0 SUCCESS
```

## 微信开发者工具控制台

**服务器侧静态验证**: PASS
- isDark 仅存在于定义文件
- 所有 Store defineStore 绑定正确
- require 路径全部解析
- 无 Web DOM API 引用

**待用户验证**:
- [ ] 首页首次进入无红色报错
- [ ] isDark 报错消除
- [ ] 首页可见真实图片
- [ ] 5 Tab 全部存在
- [ ] 旧衣橱/消费不在 TabBar
- [ ] 顶部文字不被胶囊遮挡

## 已知未验证项

- [ ] Android App Vapor 模式
- [ ] iOS / Harmony
- [ ] 图片在真机上的加载性能
- [ ] 频道切换在真机上的流畅度

---

*版本: v2.0.0*
*分支: feature/v2-phase1b-content-home*
*Commit: d219cf5*
*上传: 2026-07-15*
