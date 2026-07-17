# V2 Style Failure Audit — Phase 2A.2 Visual Foundation Gate

**日期**: 2026-07-15
**状态**: 审计完成，修复进行中

---

## 根因总结

**核心问题：所有页面样式通过 `:style` 内联绑定，编译产物 WXSS 全部为空（仅 2 行），导致真机运行时大量 CSS 属性失效。**

五个页面共享同一个根因链：

```
源码 .uvue 无 <style> 块
  → 所有样式通过 JS computed 返回 UTSJSONObject
    → 编译后 WXSS 仅包含 @import + :host
      → 内联 style="{{g}}" 绑定到 WXML
        → 微信小程序不支持 gap/calc/textOverflow 等属性在内联样式
          → 视觉效果崩溃
```

---

## 发现 1: WXSS 全部为空

### 源码 (discover/index.uvue)
```vue
<template>
  <view :style="pageWrap">
    <text :style="sectionTitle">分类浏览</text>
    ...
  </view>
</template>
<!-- 无 <style> 块 -->
```

### 编译后 WXSS (`unpackage/dist/dev/mp-weixin/pages/discover/index.wxss`)
```css
@import "../../uvue.wxss";
:host{display:flex;flex-direction:column}
```

**只有 2 行。所有五个一级页面的 WXSS 都是同样的 2 行。**

### 编译后 WXML (`unpackage/dist/dev/mp-weixin/pages/discover/index.wxml`)
```xml
<view style="{{ai}}">
  <text style="{{h}}">分类浏览</text>
  ...
</view>
```

所有样式通过 `{{变量}}` 绑定为 inline style。

### 真机表现
- 无 CSS 类可继承
- 微信小程序对内联样式的支持少于 `<style>` 块
- 多个属性在内联样式中被丢弃

**根因**: UniApp X VDOM 编译器将所有 `<style scoped>` 编译为数据绑定而非 WXSS 类选择器。

---

## 发现 2: gap 属性内联失效

### 源码
```typescript
const categoryRow = { ...flexRow, gap: GRID_GAP_REGULAR }  // gap: '24rpx'
const manageGrid = { ...flexRow, flexWrap: 'wrap', gap: GRID_GAP_REGULAR }
const channelRow = { ...flexRow, alignItems: 'center', height: CHANNEL_ITEM_HEIGHT }
// channelItem 之间有 gap 期望，但 channelRow 无 gap
```

### 编译后 JS
```javascript
const categoryRow = new UTSJSONObject(Object.assign(Object.assign({}, flexRow), 
  { gap: '24rpx' }))
```

### 真机表现
- 发现页分类卡之间无间距
- 管理中心卡片之间无间距（配合 calc 问题导致 2×2 变单列）
- 首页频道文字粘连
- 品牌标签云贴在一起

**根因**: 微信小程序不支持 `gap` 在内联 style 中。规范定义 `gap` 在 UniApp X 中是 WARNING 级别。

---

## 发现 3: calc() 内联失效

### 源码 (profile/index.uvue)
```typescript
const manageCard = {
  width: 'calc(50% - 12rpx)',
  ...flexRow, alignItems: 'center', gap: CARD_PADDING,
  ...
}
```

### 编译后 JS
```javascript
const manageCard = new UTSJSONObject(Object.assign(
  { width: 'calc(50% - 12rpx)' }, flexRow, 
  { alignItems: 'center', gap: CARD_PADDING, ... }
))
```

### 真机表现
- `calc(50% - 12rpx)` 被丢弃
- 每张卡片变成全宽单列
- 半宽布局消失

**根因**: 微信小程序不支持 `calc()` 在内联 style 中。

---

## 发现 4: 频道文字粘连

### 源码 (home/index.uvue)
```typescript
const channelItem = {
  paddingHorizontal: CHANNEL_ITEM_PADDING_H,
  height: CHANNEL_ITEM_HEIGHT,
  alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, position: 'relative',
}
// channelRow 无 gap, 仅 flexRow
const channelRow = { ...flexRow, alignItems: 'center', height: CHANNEL_ITEM_HEIGHT }
```

### 编译后
channelItem 之间无间隔，仅靠 paddingHorizontal 撑开文字自身。相邻 item 文字贴近。

### 真机表现
- "推荐新品预约降价穿搭" 文字之间无明显间距
- 选中态下划线正确但文字拥挤

**根因**: channelRow 缺少 item 间距。需要给每个 channelItem 加 marginRight 或在 channelRow 使用更宽的 padding。

---

## 发现 5: AppPageContainer 未被使用

### 源码搜索
```bash
grep -rn 'AppPageContainer' pages/
# 0 results
```

### 真机表现
- 所有页面通过 MainLayout 直接输出内容
- 每页各自声明 `pageWrap = { paddingHorizontal: PAGE_GUTTER_REGULAR, ... }`
- 无统一容器，无法保证对齐线一致

**根因**: 组件已创建但从未导入。Report 声称用了 AppPageContainer，实际上没有。

---

## 发现 6: styleIsolationVersion 影响

### manifest.json
```json
"uni-app-x": {
  "styleIsolationVersion": "2"
}
```

### 影响
微信小程序 `styleIsolationVersion: "2"` 改变了默认样式隔离策略。在 VDOM 模式下，内联 style 传入子组件（如 AppImage、MainLayout）时，隔离策略可能导致部分样式被宿主页面的 Shadow DOM 边界阻断。

### 真机表现
- AppImage 组件内的 `position: relative` + `paddingBottom` 比例容器可能受影响
- 图片区域空白

---

## 发现 7: 其他失效属性清单

| 属性 | 使用位置 | 真机表现 | 替代方案 |
|------|---------|---------|---------|
| `gap` | 全部页面 flex 容器 | 元素粘连 | `margin-right` + `:last-child` 或 `padding` |
| `calc()` | profile manageCard | 宽度失效 | 固定 `50%` + 父容器 padding 吸收间距 |
| `lines: N` | 标题文本 | 多行显示不截断 | 需额外加 `overflow: hidden` |
| `textOverflow: ellipsis` | 标题文本 | 不显示省略号 | 需 `white-space: nowrap` 配合 |
| `paddingBottom` 比例 | AppImage 容器 | 高度为 0 | 用 `height` 计算替代 |
| `position: relative` | AppImage 子元素 | absolute 定位基准丢失 | 检查 Shadow DOM 传递 |

---

## 发现 8: AI 页面 vs Discover 页面对比

### AI 页面 (部分可用)
- 6 个功能入口用 `calc(33.333% - 16rpx)` — **同样会失败**
- 但 AI 页面有固定高度图标容器 (80rpx × 80rpx)
- `flexWrap: 'wrap'` + 固定宽度可能部分生效

### Discover 页面 (不可用)
- 分类卡使用 `gap` 间距 → 失效
- 横向滚动用负 margin → 部分失效
- 日历行使用 `gap` → 失效
- 品牌网格用 `gap: spacing[2]` → 失效

**结论**: AI 页面视觉上可能 "看起来还行" 因为其布局更依赖固定尺寸而非 gap 间距。但 AI 页面同样存在 gap/calc 失效问题。

---

## 修复策略

### 必须替换的 CSS 模式

| 当前模式 | 微信兼容方案 |
|---------|------------|
| `gap: N` on flex row | 子元素加 `margin-right: N`，最后一个 `margin-right: 0` |
| `gap: N` on flex wrap | 容器加 `margin: -N/2`，子元素加 `margin: N/2`（负 margin hack） |
| `calc(50% - N)` | 父容器 `padding: N/2`，子元素 `width: 50%` + `padding: N/2` |
| `lines: 1; textOverflow: ellipsis` | 加 `overflow: hidden`（微信的 lines 属性需要全量上下文） |
| 纯内联样式 | 关键布局属性迁移到 `<style scoped>` 块 |

### 架构修复

1. 将关键布局样式提取到 `<style scoped>` 块（让编译器生成 WXSS 类选择器而非内联 style）
2. 在所有页面中使用 AppPageContainer
3. 将 `gap` 替换为 margin 方案
4. 将 `calc()` 替换为百分比 + padding hack
5. 将 Emoji 替换为统一图标组件

### 不做

- ❌ 不引入 CSS-in-JS 库
- ❌ 不迁移到 Class-based styling
- ❌ 不改变所有样式为 WXSS 类 — 保留 token-driven 方案，只修复失效属性

---

## Emoji 清单

| 文件 | 行号 | Emoji | 用途 |
|------|------|-------|------|
| profile/index.uvue | 32 | 👗 | 衣橱图标 |
| profile/index.uvue | 37 | 📦 | 订单图标 |
| profile/index.uvue | 41 | ⏰ | 提醒图标 |
| profile/index.uvue | 47 | 📊 | 预算图标 |
| profile/index.uvue | 147 | 🔔 | 通知 |
| profile/index.uvue | 148 | 🔄 | 同步 |
| profile/index.uvue | 149 | 📥 | 导入导出 |
| profile/index.uvue | 150 | 🌙 | Dark Mode |
| profile/index.uvue | 151 | 🤖 | AI 设置 |
| profile/index.uvue | 152 | 💾 | 缓存 |
| profile/index.uvue | 153 | ❓ | 帮助 |
| profile/index.uvue | 154 | ℹ️ | 关于 |
| discover/index.uvue | 20 | 🎓 | JK 分类 |
| discover/index.uvue | 25 | 🎀 | Lolita 分类 |
| discover/index.uvue | 30 | 🏮 | 汉服分类 |
| favorites/index.uvue | 24 | ♡ | 空状态心形 |
| ai/index.uvue | 109-114 | ◎◇△□○◈ | 功能入口 |
| ai/index.uvue | 22 | → | 发送按钮 |
| home/index.uvue | 14 | ⌕ | 搜索图标 |

---

## 颜色替换方案

| Token | 旧值 | 新值 | 用途 |
|-------|------|------|------|
| pageBackground | #FAFAFA (nl.bg) | #FAF8F7 | 页面底色 |
| surfacePrimary | #FFFFFF | #FFFFFF | 卡片/容器白 |
| surfaceSecondary | #F5F5F5 | #F6F1F2 | 次级背景 |
| textPrimary | #1A1A1A | #2D2729 | 主文字 |
| textSecondary | #757575 | #756D70 | 次级文字 |
| textTertiary | #9E9E9E | #A0989B | 三级文字 |
| brandPrimary | #FF4D7E | #D65378 | 品牌主色 |
| brandPressed | #E6366A | #BD3F65 | 按下态 |
| brandSoft | #FFF5F7 | #F7E7EC | 品牌浅底 |
| divider | #EEEEEE | rgba(63,45,51,0.08) | 分割线 |
