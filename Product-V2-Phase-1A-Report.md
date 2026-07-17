# Product V2 Phase 1A — Report

> 日期: 2026-07-15
> 项目: 三坑绮橱 AppX (`/home/admin/projects/sankengcloset`)
> 编译器: HBuilderX 5.21.2026071110-alpha

---

## 一、执行摘要

| 任务 | 状态 | Commit |
|------|------|--------|
| 删除 src/ + 修正 @ alias | ✅ 完成 | `1806e7a` |
| 启用 vapor: true | ✅ 完成 | `9484498` |
| Feed Spike → list-view/list-item | ✅ 完成 | `e47f13b` |
| 内容域模型 | ✅ 完成 | `cbe2fc3` |
| 编译验证 | ✅ 14 页面全通过 | — |
| Git 工作区 | ✅ clean | — |

---

## 二、src/ 清理

### 2.1 操作

- 删除 `src/` 目录 (54 个文件)
- 确认 src/ 是根目录的纯子集 (0 个独有文件)
- `vite.config.js` alias: `@: './src'` → `@: '.'`

### 2.2 验证

```
mp-weixin 编译: 14 页面, "compiled successfully"
patch-vendor.py: [OK] vendor.js: 1 change(s)
check-uts-compile.js: 全部通过 (4/4 PASS)
旧页面退化: 无
本地数据影响: 无 (uni.getStorageSync 不受源码变更影响)
```

### 2.3 文件变更

| 文件 | 操作 |
|------|------|
| `src/**` (54 files) | 删除 |
| `vite.config.js` | 修改 alias |

---

## 三、Vapor 启用

### 3.1 配置

```json
"uni-app-x": {
    "styleIsolationVersion": "2",
    "vapor": true
}
```

### 3.2 平台行为

| 平台 | Vapor 效果 | 证据 |
|------|-----------|------|
| mp-weixin | **无效果** — 编译器仍输出 "VDOM模式" | `Compiler version: 5.21（uni-app x）VDOM模式` |
| App Android | 未验证 — 服务器无 Android SDK | 标记为"未验证" |
| App iOS | 未验证 — 服务器无 iOS 环境 | 标记为"未验证" |
| Web | 未验证 — 未测试 web 编译 | 标记为"未验证" |

### 3.3 结论

`vapor: true` 已正式提交。mp-weixin 不受影响（编译器静默忽略）。App/iOS/Harmony 平台在有真机环境时才能验证 Vapor 效果。

---

## 四、Feed Spike 改造

### 4.1 平台分流方案

使用 `<list-view>` + `<list-item>` 统一模板：

| 平台 | list-view 行为 | 证据 |
|------|---------------|------|
| App (vapor) | 原生 recycle list (列表项回收) | HBuilderX 文档: list-view 为 App 原生组件 |
| mp-weixin | 自动转为 `<scroll-view>` | 编译产物 wxml 中 2 个 scroll-view, 0 个 list-view |

### 4.2 编译产物验证

```
feed-spike.js: 16,660 bytes
feed-spike.wxml: 2,590 bytes
wxml 中: scroll-view × 2, list-item × 6, list-view × 0 (已转换)
```

### 4.3 功能

- 30/100/300 卡片切换
- 单列模式 (list-item: type='single')
- 双列网格模式 (list-item: type='grid', 配对渲染)
- scrolltolower 分页加载 (+20 条/次)
- 色块 3:4 占位 (非真实图片)
- 渲染耗时 / 图片加载计数指标

### 4.4 未验证项

| 项目 | 状态 | 原因 |
|------|------|------|
| App list-view 回收效果 | 未验证 | 服务器无 Android/iOS 环境 |
| 运行时 FPS | 未验证 | 服务器无微信开发者工具 |
| 300 卡实际滑动流畅度 | 未验证 | 同上 |
| 真实图片加载 | 未验证 | 使用色块模拟 |

---

## 五、内容域模型

### 5.1 新建文件

| 文件 | 实体 | 字段数 | 说明 |
|------|------|--------|------|
| `domain/content/brand.uts` | Brand | 10 | 品牌 (名称/logo/分类/关注) |
| `domain/content/product.uts` | Product + PriceSnapshot | 22 + 4 | 商品 (独立于 WishItem) + 价格快照 |
| `domain/content/series.uts` | Series | 10 | 系列 (品牌下系列) |
| `domain/content/content-post.uts` | ContentPost | 21 | 帖子 (Feed 单元: 穿搭/评测/种草/开箱/教程) |
| `domain/content/outfit.uts` | Outfit | 16 | 穿搭组合 (关联衣物+商品) |
| `domain/content/index.uts` | — | — | 统一导出 |

### 5.2 设计原则

| 原则 | 执行 |
|------|------|
| 不复用 WishItem 冒充 Product | ✅ Product 是独立实体，字段完全不同 |
| UTS 兼容 | ✅ 使用 class 常量 (非 string union)，`as any` 类型标注 |
| KISS | ✅ 纯数据 class，无 Repository/Store/Presenter (后续按需添加) |
| 价格单位 | 分 (避免浮点精度问题) |
| 关联方式 | ID 引用 (brandId, seriesId, productIds) |

### 5.3 Product vs WishItem 对比

| 字段 | Product | WishItem |
|------|---------|----------|
| 定位 | 商品本身 | 用户心愿 |
| 价格 | `price` (当前价) + `originalPrice` | `estimatedPrice` (估计预算) |
| 状态 | UPCOMING/ON_SALE/PRE_ORDER/SOLD_OUT/ENDED | WISH/WATCHING/DECIDED/PURCHASED/PAUSED/CANCELED |
| 关联 | brandId, seriesId | wardrobeId, purchaseId |
| 图片 | coverImage + images[] | coverImage |
| 互动 | viewCount, favoriteCount | isFavorite |
| 来源 | 无 (商品本身) | source (MANUAL/AI_IMPORT/DISCOVERY) |

---

## 六、Git 状态

### 6.1 提交历史 (spike/phase-0 分支)

```
cbe2fc3 Phase 1A: Content domain models (V2)
e47f13b Phase 1A: Feed spike → list-view/list-item
9484498 Phase 1A: Enable vapor: true in manifest.json
1806e7a Phase 1A: Remove src/ snapshot, fix @ alias
6dfa97a Phase 0: Technical Spike Report
4bb2dd1 Phase 0: Feed performance spike page
93a6b25 Product V2 migration baseline
```

### 6.2 工作区状态

```
分支: spike/phase-0
未提交文件: 0
```

### 6.3 文件统计

| 类别 | 数量 |
|------|------|
| 总文件数 | 89 |
| 页面 (.uvue) | 14 |
| 组件 (.uvue) | 15 |
| Domain 实体 (.uts) | 11 (旧 5 + 新 6) |
| Store (.uts) | 5 |
| Theme (.uts) | 14 |
| 其他 | 30 |

---

## 七、验收门禁

| 门禁 | 结果 | 证据 |
|------|------|------|
| src/ 清理后 mp-weixin 编译不退化 | ✅ | 14 页面, "compiled successfully", 4/4 PASS |
| vapor: true 正式提交 | ✅ | manifest.json `"vapor": true`, commit `9484498` |
| App 与小程序列表实现明确分流 | ✅ | list-view → scroll-view (mp-weixin), list-view 原生 (App) |
| 内容域不复用 WishItem 冒充 Product | ✅ | Product 独立实体, 22 字段, 无 WishItem 依赖 |
| Android 未完成 release 包测试 | ✅ 明确写出 | "未验证 — 服务器无 Android SDK" |
| Git 工作区 clean | ✅ | `git status --short` 无输出 |
| 不修改旧用户数据 | ✅ | uni.getStorageSync 不受源码变更影响 |
| 不把静态编译通过写成性能通过 | ✅ | 所有运行时测试标记为"未验证" |

---

## 八、所有新增/修改文件

### Phase 1A 变更 (相对 Phase 0 基线)

| 文件 | 操作 | Commit |
|------|------|--------|
| `src/**` (54 files) | 删除 | `1806e7a` |
| `vite.config.js` | 修改 (alias fix) | `1806e7a` |
| `manifest.json` | 修改 (vapor: true) | `9484498` |
| `pages/dev/feed-spike.uvue` | 重写 (list-view) | `e47f13b` |
| `domain/content/brand.uts` | 新增 | `cbe2fc3` |
| `domain/content/product.uts` | 新增 | `cbe2fc3` |
| `domain/content/series.uts` | 新增 | `cbe2fc3` |
| `domain/content/content-post.uts` | 新增 | `cbe2fc3` |
| `domain/content/outfit.uts` | 新增 | `cbe2fc3` |
| `domain/content/index.uts` | 新增 | `cbe2fc3` |

---

## 九、进入首页高保真开发的条件

| 条件 | 状态 |
|------|------|
| 内容域模型 | ✅ Brand/Product/Series/ContentPost/Outfit 已定义 |
| Feed 列表组件 | ✅ list-view/list-item 编译通过，平台分流验证 |
| Design Token | ✅ 完整 |
| Base 组件 | ✅ 9 个可复用 |
| 编译流水线 | ✅ 编译→patch→校验 全链路通过 |
| 后端 API | ❌ 未就绪 (首页可用 Mock 数据开发) |
| 图片服务 | ❌ 未就绪 (可用色块/占位图开发) |
| 运行时性能 | ❌ 未验证 (需真机) |

**结论**: 可以开始首页高保真实现 (使用 Mock 数据 + 占位图)。后端 API 和图片服务在 UI 壳层完成后接入。
