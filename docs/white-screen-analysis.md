# UniApp X Android 白屏问题分析报告

## 概述
项目 `sankengcloset` 在 Android App 模式下启动即白屏。manifest.json 配置 `vapor: true`（字节码模式），HBuilderX 5.21 alpha。以下为逐文件深度分析结果。

---

## 🔴 严重问题（极可能导致白屏）

### 1. use-theme.uts — 模块级 ref/computed 在 Vapor 模式下可能失效
**文件**: `theme/use-theme.uts` 第 61-62 行

```typescript
const _isDark = ref(getGlobalDark())           // 模块顶层
const _neutral = computed(() => _isDark.value ? neutralDark : neutralLight)  // 模块顶层
```

**问题**: `ref()` 和 `computed()` 在 `.uts` 模块文件的顶层调用，不在组件 setup 上下文中。Vapor 模式（字节码编译）对响应式原语的处理与 VDOM 模式不同——模块级的 `ref` 可能没有活跃的 effect scope，导致 `_isDark.value` 永远不触发更新，甚至在初始化时抛出静默错误。

**影响范围**: `n`（中性色主题）和 `isDark` 被 **几乎所有组件** 导入（MainLayout、AppBottomNav、AppFeedbackToast、V2ProductCard、V2FilterChips、V2HorizontalTabs、V2PageHeader、AppImage、所有 5 个 tab 页面）。如果这个模块加载失败，整个应用无法渲染任何内容 → **白屏**。

**修复建议**:
- 方案 A: 将 `ref`/`computed` 包装为懒初始化 getter
- 方案 B: 改用 `getApp().globalData` 作为唯一状态源，去掉模块级 ref
- 方案 C: 临时关闭 `vapor: true` 验证是否为此根因

---

### 2. profile/index.uvue — `isLoggedIn` 未定义变量（第 274 行）
**文件**: `pages/profile/index.uvue` 第 274 行

```typescript
if (isLoggedIn.value) items.push({ id: 'logout', ... })
```

**问题**: `isLoggedIn` 从未声明。该页面使用 `session.isLoggedIn`（`useSessionStore()` 返回的 computed），但第 274 行直接引用了不存在的 `isLoggedIn`。在 UTS 严格模式下这是编译错误；如果编译器容忍了，运行时会抛出 `ReferenceError`。

**影响**: 导航到"我的"页面时崩溃。不会直接影响首页白屏，但属于必须修复的 bug。

**修复**: 改为 `session.isLoggedIn`（注意 store 的 computed 不需要 `.value`）。

---

### 3. home-feed-store.uts — `usePreferencesStore()` 在 computed 内部调用
**文件**: `stores/home-feed-store.uts` 第 142-143 行

```typescript
const displayItems = computed((): FeedItem[] => {
    ...
    const prefs = usePreferencesStore()  // ⚠️ 在 computed 内调用 store
    ...
})
```

**问题**: 在 Pinia 中，`useStore()` 应在 setup 顶层或另一个 store 内调用，不应在 `computed` 回调内反复调用。Vapor 模式下，computed 内的 store 调用可能无法正确追踪依赖，或在没有活跃 Pinia 实例时抛出异常。

**影响**: 首页 `displayItems` 计算失败 → 模板渲染异常 → 白屏。

**修复**: 在 store 工厂函数顶层调用 `usePreferencesStore()`，将结果存为变量。

---

## 🟠 高风险问题

### 4. String.prototype.padStart — UTS 兼容性
**文件**: `domain/content/mock-feed-repo.uts` 第 100-101 行, `domain/purchase-presenter.uts` 第 41-42 行

```typescript
'/static/demo/prod-editorial-' + String((idx % 3) + 1).padStart(2, '0') + '.jpg'
```

**问题**: UTS 编译为 Kotlin/Java，`padStart` 是 JavaScript 方法，不在 Kotlin 标准库中。如果 UTS 编译器未提供 polyfill，运行时会抛 `TypeError: padStart is not a function`。

**影响**: `loadFirstPage()` 调用 `fetchFeedPage()` → `getFeedPage()` → `generatePage()` → `makeProductFeed()` 中触发。虽然外层有 try-catch，但错误发生在 async 链中，可能导致 Promise rejection 未处理。

**修复**: 用 UTS 兼容方式替代：
```typescript
function padZero(n: number): string {
  return n < 10 ? '0' + String(n) : String(n)
}
```

---

### 5. 缺失 .jpg 图片文件
**文件**: `domain/content/mock-feed-repo.uts` 第 100-101 行引用的路径

引用路径:
- `/static/demo/prod-editorial-01.jpg`
- `/static/demo/prod-editorial-02.jpg`
- `/static/demo/prod-editorial-03.jpg`
- `/static/demo/outfit-editorial-01.jpg`

**实际存在的文件** (仅 .png):
- `/static/demo/prod-01.png` ~ `prod-06.png`
- `/static/demo/outfit-01.png`, `outfit-02.png`
- `/static/demo/event-01.png`, `event-02.png`

**问题**: 所有 feed 卡片图片引用的 `.jpg` 文件不存在。AppImage 组件有 error fallback，不会崩溃，但用户看到的全是占位图。

---

### 6. profile/index.uvue — 显式导入 Vue 工具函数
**文件**: `pages/profile/index.uvue` 第 79 行

```typescript
import { ref, computed } from 'vue'
```

**问题**: 其他所有页面和 store 文件都依赖 UTS 自动导入 `ref`/`computed`，唯独 profile 页面显式从 `'vue'` 导入。在 Vapor 模式下，自动导入和显式导入可能产生冲突或加载不同的 reactive 实例。

---

## 🟡 中风险问题（Vapor 模式兼容性）

### 7. MainLayout — slot 内 fixed 定位
**问题**: 首页 navbar 使用 `position: 'fixed'` 放在 MainLayout 的 `#navbar` slot 中。Vapor 模式下，slot 内的 fixed 定位可能因渲染管线差异而失效或异常。

### 8. list-view 在非 scroll 容器中
**文件**: `pages/home/index.uvue`

首页 MainLayout 设置 `scrollable="false"`，list-view 被包裹在普通 `<view>` 中。Vapor 模式下 list-view 的虚拟列表实现可能要求特定的父容器条件。

### 9. defineStore 无显式 Pinia 导入
所有 store 文件（home-feed-store、session-store、content-library-store 等）使用 `defineStore` 但未显式 `import { defineStore } from 'pinia'`。依赖自动导入在 Vapor 模式下可能不可靠。

### 10. AppBottomNav — redirectTo 导航模式
App 模式下 tabBar 被条件编译排除，AppBottomNav 使用 `uni.redirectTo()` 切换页面。每次切换都销毁并重建页面，在低端 Android 设备上可能导致短暂白屏。

---

## ✅ 已确认正确的部分

| 检查项 | 状态 |
|--------|------|
| 5 个 tab 页模板均包裹在单根 `<view>` 中 | ✅ 正确 |
| applySystemChrome 已用 `#ifdef MP-WEIXIN` 守卫 | ✅ 正确 |
| warmRuntimeCache 在 onLaunch 中调用 | ✅ 正确 |
| AppBottomNav 图标文件均存在（.png） | ✅ 正确 |
| pages.json tabBar 条件编译排除 APP | ✅ 正确 |
| theme.json 定义了 light/dark 主题变量 | ✅ 正确 |
| 所有 V2 组件（V2ProductCard、V2FilterChips 等）模板结构正确 | ✅ 正确 |

---

## 🔧 推荐修复优先级

### P0 — 立即修复（白屏根因）
1. **use-theme.uts**: 将模块级 `ref`/`computed` 改为惰性 getter，或改用 `getApp().globalData` 单一状态源
2. **home-feed-store.uts**: 将 `usePreferencesStore()` 调用移到 computed 外部
3. **关闭 vapor 模式测试**: 临时将 `manifest.json` 的 `"vapor": true` 改为 `false`，确认白屏是否消失，以定位是否为 vapor 编译器 bug

### P1 — 高优先级
4. **profile/index.uvue 第 274 行**: `isLoggedIn.value` → `session.isLoggedIn`
5. **mock-feed-repo.uts**: 替换 `padStart` 为 UTS 兼容函数；修正 `.jpg` → `.png` 路径
6. **profile/index.uvue 第 79 行**: 移除 `import { ref, computed } from 'vue'`

### P2 — 优化
7. 所有 store 文件添加显式 `import { defineStore } from 'pinia'`
8. 测试 list-view 在 Vapor 模式下的渲染行为
9. 检查 Android logcat 中的运行时错误日志

---

## 调试建议

在 Android Studio 中查看 logcat，过滤标签 `HBuilder` 或 `uniapp`，关注：
- `TypeError` / `ReferenceError` 等运行时异常
- `defineStore` 相关的 Pinia 初始化错误
- `ref` / `computed` 在模块加载阶段的异常
- `padStart is not a function` 类型错误

如果 logcat 无明显错误，尝试：
1. 在 App.uvue 的 `onLaunch` 中添加 `console.log('=== APP LAUNCHED ===')` 确认生命周期是否进入
2. 在 home/index.uvue 的 `onLoad` 中添加 `console.log('=== HOME PAGE LOAD ===')` 确认页面是否加载
3. 在 home/index.uvue 的 `onMounted` 中添加 `console.log('=== HOME MOUNTED ===')` 确认组件是否挂载
