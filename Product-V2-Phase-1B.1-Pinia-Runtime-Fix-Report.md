# Pinia Runtime Fix Report

> fix(mp-weixin): bind Pinia defineStore for all store modules

---

## 根因

**HBuilderX 5.21 alpha 编译器缺陷 + patch-vendor.py 不完整**

1. HBuilderX 5.21 alpha 编译 UniApp X → mp-weixin 时，将 `defineStore()` 编译为裸全局调用，不生成 `require` 或 `import` 语句
2. 原 patch-vendor.py 在 vendor.js 中注入了 `function defineStore(...)` 和 `globalThis.defineStore = defineStore`
3. **缺失 `exports.defineStore = defineStore`** — 导致 `common_vendor.defineStore` 为 undefined
4. WeChat 小程序模块系统中 `globalThis` 赋值跨模块不可靠 — 裸 `defineStore` 无法解析

**影响范围**: 所有 5 个 Store（home-feed-store, wardrobe-store, wishlist-store, purchase-store, reminder-store）

---

## 修复内容

### vendor.js (新增)
```
exports.defineStore = defineStore;
```

### Store 文件绑定（两种策略）

**Dev 输出（多行未压缩）**:
```js
// 在 vendor require 行后插入
/* patch-vendor: defineStore bound */
var defineStore = common_vendor.defineStore;
```

**Build 输出（单行压缩）**:
```js
// 替换 =defineStore( 为 =e.defineStore(
// e = vendor import variable (minified name)
```

### 幂等性
- Dev: 标记注释 `/* patch-vendor: defineStore bound */` 防止重复插入
- Build: 替换后 `e.defineStore(` 存在，跳过

---

## DevTools 加载目录

微信开发者工具应打开：
```
unpackage/dist/dev/mp-weixin/
```

---

## Patch 前后差异

### home-feed-store.js (dev)

**Patch 前**:
```js
const common_vendor = require("../common/vendor.js");
...
const useHomeFeedStore = defineStore("homeFeed", () => {
```

**Patch 后**:
```js
const common_vendor = require("../common/vendor.js");
/* patch-vendor: defineStore bound */
var defineStore = common_vendor.defineStore;
...
const useHomeFeedStore = defineStore("homeFeed", () => {
```

### home-feed-store.js (build, minified)

**Patch 前**:
```
const e=require("../common/vendor.js"),...const i=defineStore("homeFeed",...
```

**Patch 后**:
```
const e=require("../common/vendor.js"),...const i=e.defineStore("homeFeed",...
```

---

## 所有 Store defineStore 绑定检查

| Store | Dev | Build |
|-------|-----|-------|
| home-feed-store.js | `common_vendor.defineStore` | `e.defineStore` |
| wardrobe-store.js | `common_vendor.defineStore` | `e.defineStore` |
| wishlist-store.js | `common_vendor.defineStore` | `e.defineStore` |
| purchase-store.js | `common_vendor.defineStore` | `e.defineStore` |
| reminder-store.js | `common_vendor.defineStore` | `e.defineStore` |

验证结果: **21/21 PASS**（dev 8 + build 13）

---

## 微信真机/开发者工具验证状态

- 服务器侧: **静态验证 PASS**（21/21 检查通过）
- 本地 DevTools: **待用户验证**
  - 清空编译缓存
  - 重新打开 `unpackage/dist/dev/mp-weixin/`
  - 启动首页，切换频道，分页加载
  - 控制台无 `defineStore is not defined`

---

## 上传状态

| 版本 | 描述 | 状态 |
|------|------|------|
| 1.4.0 | Phase 1C | 已上传（有 defineStore bug） |
| 1.4.1 | fix: bind Pinia defineStore | **已上传** |

---

## 未验证项

- [ ] 微信开发者工具运行时无 defineStore 错误
- [ ] 微信真机运行时无 defineStore 错误
- [ ] Android App Vapor 模式
- [ ] iOS / Harmony

---

*报告: 2026-07-15*
*commit: 41f0748*
