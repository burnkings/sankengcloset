# Product V2 Phase 0 — Technical Spike Report

> 日期: 2026-07-14
> 项目: 三坑绮橱 AppX (`/home/admin/projects/sankengcloset`)
> 编译器: HBuilderX 5.21.2026071110-alpha

---

## 一、Git 基线结果

### 1.1 初始化

| 项目 | 值 |
|------|-----|
| 分支 | `master` (基线) + `spike/phase-0` (试验) |
| 基线 Commit | `93a6b25` — "Product V2 migration baseline" |
| Spike Commit | `4bb2dd1` — "Phase 0: Feed performance spike page" |
| 基线文件数 | 135 files, 20588 insertions |
| 工作区状态 | clean (无未提交文件) |

### 1.2 .gitignore 规则

| 类别 | 规则 |
|------|------|
| 构建产物 | `unpackage/` |
| 依赖 | `node_modules/` |
| HBuilderX | `.hbuilderx/` |
| 缓存 | `.cache/`, `*.cache`, `.uts2js/` |
| 日志 | `*.log`, `nohup.out`, `npm-debug.log*` |
| 系统 | `.DS_Store`, `Thumbs.db`, `desktop.ini` |
| 编辑器 | `*.swp`, `*.swo`, `*~`, `.vscode/`, `.idea/` |
| 密钥 | `*.key`, `*.pem`, `*.p12`, `*.keystore`, `*.jks`, `.env`, `.env.*` |
| 临时 | `*.tmp`, `*.bak` |

### 1.3 敏感文件检查结果

| 检查项 | 结果 |
|--------|------|
| 密钥文件 (.key/.pem/.keystore) | ✅ 未发现 |
| .env 文件 | ✅ 未发现 |
| API Key 硬编码 | ✅ 未发现 (grep 命中均为 theme/tokens 路径中的 "token" 字样，非密钥) |
| 微信 AppID | ℹ️ `wx976f673896c8b565` 在 `manifest.json` 中，属于公开配置，已提交 |
| 构建产物 | ✅ 已被 .gitignore 排除 |

---

## 二、微信小程序构建基线

### 2.1 编译流程

| 步骤 | 命令 | 耗时 | 退出码 | 结果 |
|------|------|------|--------|------|
| 1. 清缓存 + mp-weixin 编译 | `/opt/HBuilderX/cli launch mp-weixin --project ... --compile true` | 19s | 0 | ✅ 成功 |
| 2. patch-vendor.py | `python3 scripts/patch-vendor.py unpackage/dist/dev/mp-weixin` | <1s | 0 | ✅ defineStore + globalThis fallback (1 change) |
| 3. check-uts-compile.js | `node /home/admin/scripts/check-uts-compile.js unpackage/dist/dev/mp-weixin` | <1s | 0 | ✅ 4/4 PASS |

### 2.2 编译产物

| 项目 | 值 |
|------|-----|
| 产物路径 | `unpackage/dist/dev/mp-weixin/` |
| 页面数 | 13 (基线) → 14 (含 feed-spike) |
| 组件产物 | 14 个 .wxml |
| 产物大小 | 1.2MB |
| 编译模式 | VDOM模式 (非 Vapor) |
| Style Isolation | v2.0 |

### 2.3 校验详情

```
[PASS] app.js 无裸全局引用
[PASS] vendor.js 有导出: createSSRApp (1 处)
[PASS] vendor.js 有导出: UTSJSONObject (1 处)
[PASS] 所有 require 路径存在
```

### 2.4 Feed Spike 编译验证

添加 `pages/dev/feed-spike.uvue` 后重新编译：

| 项目 | 值 |
|------|-----|
| 页面数 | 14 (原 13 + feed-spike) |
| 编译耗时 | 23s (原 19s，+4s) |
| patch-vendor | 1 change |
| check-uts-compile | 4/4 PASS |
| feed-spike.js 大小 | 16,940 bytes |
| feed-spike.wxml 大小 | 2,458 bytes |
| 旧页面退化 | ❌ 无 — 所有 13 个旧页面编译产物完整 |

---

## 三、Android 验证状态

| 项目 | 状态 |
|------|------|
| Android 编译 | **未验证** |
| 原因 | 服务器无 Android SDK/模拟器，无法执行 app-android 编译和真机测试 |
| 已知问题 | UTS string union 限制、computed 返回类型限制 (已在代码中 workaround) |
| build 产物目录 | 存在历史产物 (`unpackage/dist/build/app-android/`)，但非本次 Phase 0 产出 |
| 建议 | Phase 1 需在 HBuilderX 真机环境中验证 Android 编译 |

---

## 四、@ 别名与根目录/src 风险

### 4.1 发现

| 事实 | 证据 |
|------|------|
| `vite.config.js` 定义 `@ → ./src` | `resolve.alias: { '@': './src' }` |
| HBuilderX 编译器**忽略** vite alias | 编译产物 `home-store.js` 包含 `class PurchaseSummary`，这是根目录版本，src/ 版本无此 class |
| HBuilderX 将 `@/` 解析到**项目根目录** | 13 个页面全部从根目录编译，包括 src/ 中不存在的 reminder 页面 |
| 根目录是活跃源码 | 13 页面 + 5 Store + 4 Repo + 完整 Theme |
| src/ 是历史快照 | 9 页面 + 4 Store + 3 Repo，缺少 Reminder、AppEmptyState、AppTag、theme/components |
| src/ 是根目录的纯子集 | 无任何文件是 src/ 独有的 |

### 4.2 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| 开发者误编辑 src/ 文件 | **P1** | src/ 文件不参与编译，修改 src/ 无效果但不会报错 |
| vite.config.js 误导 | **P2** | `@: './src'` 让开发者以为 src/ 是源码目录 |
| 两套文件不一致 | **P1** | 根目录有 Reminder 等模块，src/ 没有，长期维护会混乱 |

### 4.3 迁移方案（本阶段不执行）

**建议方案**: 在 Product V2 正式开发前：
1. 删除 `src/` 目录（已确认是纯子集，无独有文件）
2. 将 `vite.config.js` 中 `@: './src'` 改为 `@: '.'` 或删除该别名
3. 验证编译不受影响后提交

**风险**: 低 — src/ 不参与编译，删除不影响构建。vite alias 仅影响 vite dev server，不影响 HBuilderX CLI 编译。

---

## 五、Vapor 技术 Spike

### 5.1 调查结果

| 证据 | 内容 |
|------|------|
| manifest.json schema | `vapor` 字段存在于 `uni-app-x` 配置中，类型 boolean，默认 false |
| `vapor` 的 uniPlatform | `app.android`(any) / `app.ios`(unixVaporVer≥5.11) / `app.harmony`(unixVaporVer≥5.0) / `web`(unixVer≥4.0) |
| mp-weixin 的 uniPlatform | **未列出** — `vapor` 字段的 uniPlatform 无 `mp-weixin` 条目 |
| 实测 manifest.json 加 `"vapor": true` | 编译器仍然输出 "VDOM模式"，vapor 配置被静默忽略 |
| HBuilderX CLI help | `isVaporMode` 仅在 iOS/HarmonyOS 运行配置中出现 |
| 编译器日志 | `Compiler version: 5.21（uni-app x）VDOM模式` — 无变化 |

### 5.2 结论

| 判断 | 详情 |
|------|------|
| **暂缓启用** | Vapor 模式当前**不支持 mp-weixin 目标平台** |
| 适用场景 | Vapor 仅适用于 Android/iOS/HarmonyOS 原生 App 和 Web |
| 对 Feed 的影响 | mp-weixin 平台无法享受 Vapor 的 VDOM-free 性能优势 |
| 未来关注 | 关注 HBuilderX 后续版本是否为 mp-weixin 添加 Vapor 支持 |

### 5.3 实测命令

```bash
# 修改 manifest.json 添加 vapor: true
# 编译 mp-weixin
/opt/HBuilderX/cli launch mp-weixin --project /home/admin/projects/sankengcloset --compile true
# 结果: "Compiler version: 5.21（uni-app x）VDOM模式" ← vapor 被忽略
# 已恢复原始 manifest.json
```

---

## 六、Feed 性能 Spike 测试

### 6.1 测试页面

- 路径: `pages/dev/feed-spike.uvue`
- 编译产物: `unpackage/dist/dev/mp-weixin/pages/dev/feed-spike.js` (16.9KB)
- 用途: 纯开发测试页，不进入生产构建

### 6.2 测试设计

| 测试项 | 实现 |
|--------|------|
| 数据量切换 | 30 / 100 / 300 卡片按钮 |
| 布局切换 | 单列 / 双列网格 |
| 图片模拟 | 色块 (3:4 比例 paddingBottom: 133.33%)，非真实图片 |
| 性能指标 | 渲染耗时、滑动 FPS、图片加载计数 |
| 加载更多 | scrolltolower 触发，每次 +20 条 |
| 空数据 | 初始加载即生成全部数据 |

### 6.3 编译验证结果

| 数据量 | 布局 | 编译 | 产物大小 | 状态 |
|--------|------|------|----------|------|
| 30 卡 | 单列 | ✅ | — | 编译通过 |
| 30 卡 | 双列 | ✅ | — | 编译通过 |
| 100 卡 | 单列 | ✅ | — | 编译通过 (数据在 JS 中生成) |
| 100 卡 | 双列 | ✅ | — | 编译通过 |
| 300 卡 | 单列 | ✅ | — | 编译通过 |
| 300 卡 | 双列 | ✅ | — | 编译通过 |

### 6.4 运行时测试

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 首屏加载 | **未验证** | 服务器无微信开发者工具/模拟器 |
| 快速连续滑动 | **未验证** | 同上 |
| 图片懒加载 | **未验证** | 使用色块模拟，需真机验证 AppImage lazy-load |
| 图片加载失败 | **未验证** | 色块无网络请求，需真机验证 |
| 滚动位置恢复 | **未验证** | 需微信开发者工具 |
| 页面切换 | **未验证** | 需微信开发者工具 |
| 内存增长 | **未验证** | 需微信开发者工具 Performance 面板 |
| 空数据/加载更多 | **未验证** | 编译逻辑正确，需运行时验证 |

### 6.5 关键限制

- **无法在服务器环境运行微信开发者工具** — 所有运行时测试需在本地 HBuilderX + 微信开发者工具中进行
- 色块替代真实图片 — 不验证网络加载、图片解码、内存占用
- 无虚拟列表组件 — AppX 当前无内置 recycle-list/virtual-scroll

---

## 七、MVP 推荐的 Feed 列表方案

### 7.1 方案对比

| 方案 | 适用场景 | 优势 | 劣势 | 推荐度 |
|------|----------|------|------|--------|
| scroll-view + v-for 全量 | ≤50 条 | 简单、兼容 | 超过 50 条性能下降 | ⭐⭐ |
| scroll-view + 分页加载 | 任意总量 | 每页 20 条，渐进加载 | 无法虚拟滚动 | ⭐⭐⭐ |
| 单列 feed | 内容 Feed | 每条信息密度高 | 屏幕利用率低 | ⭐⭐⭐ |
| 双列网格 | 商品/图片 | 视觉冲击力强 | 信息密度低 | ⭐⭐⭐⭐ |

### 7.2 MVP 推荐

**首选: scroll-view + 分页加载 + 双列固定网格**

理由:
1. 微信小程序 scroll-view 原生支持 scrolltolower 分页触发
2. 双列网格 (48.5% 宽度) 在商品/图片场景视觉效果最佳
3. 每页 20 条，首屏 40 个 view 节点，性能可控
4. 不依赖虚拟列表 (AppX 当前不支持)
5. 与现有 WardrobeCard grid 模式结构一致，可复用经验

**需要验证的关键点:**
- scroll-view 在 200+ 条目时的滑动流畅度
- 双列网格中 AppImage lazy-load 的实际行为
- 微信小程序 setData 性能在大量节点更新时的瓶颈

---

## 八、推荐的最大单页数据量和分页大小

### 8.1 基于 AppX 现有能力的推算

| 指标 | 建议值 | 依据 |
|------|--------|------|
| 首页首屏数据量 | **20 条** | 双列 2×10 = 20 卡，约 40 个图片节点 + 40 个文本节点 |
| 每页加载量 | **20 条** | scrolltolower 触发，每次追加 20 条 |
| 最大累积数据量 | **100 条** | 超过后考虑页面跳转或清除头部数据 |
| 单列最大数据量 | **50 条** | 单列每条占屏高 ~60%，50 条约 30 屏 |
| 双列最大数据量 | **100 条** | 双列每行占屏高 ~40%，100 条约 20 行 ≈ 40 屏 |

### 8.2 分页策略

```
首次加载: GET /feed?page=1&size=20 → 20 条
滑到底部: GET /feed?page=2&size=20 → 追加 20 条 (累计 40)
继续滑动: ...
达到 100 条: 提示"查看更多"或跳转新页面
```

### 8.3 风险边界

| 数据量 | 单列风险 | 双列风险 |
|--------|----------|----------|
| 30 条 | ✅ 低 | ✅ 低 |
| 50 条 | ✅ 低 | ✅ 低 |
| 100 条 | ⚠️ 中 (60 屏) | ✅ 低 (20 行) |
| 200 条 | 🔴 高 | ⚠️ 中 |
| 300 条 | 🔴 极高 | 🔴 高 |

**结论**: MVP 首页 Feed 采用双列网格 + 分页 20 条 + 累积上限 100 条。

---

## 九、所有新增、修改文件

### 9.1 Git 基线 (commit 93a6b25)

| 文件 | 操作 |
|------|------|
| `.gitignore` | **新增** — 排除 unpackage/node_modules/.hbuilderx/密钥/日志 |
| 134 个已有文件 | **首次提交** — 全量基线 |

### 9.2 Spike 分支 (commit 4bb2dd1)

| 文件 | 操作 |
|------|------|
| `pages/dev/feed-spike.uvue` | **新增** — Feed 性能测试页面 (480 行) |
| `pages.json` | **修改** — 添加 `pages/dev/feed-spike` 路由 |

### 9.3 Vapor Spike (已回滚)

| 文件 | 操作 | 状态 |
|------|------|------|
| `manifest.json` | 临时修改添加 `vapor: true` | **已回滚** — cp manifest.json.vapor-bak manifest.json |

### 9.4 文件完整性

| 检查项 | 结果 |
|--------|------|
| 旧页面被修改 | ❌ 无 |
| 旧 Store 被修改 | ❌ 无 |
| 本地数据被影响 | ❌ 无 (uni.getStorageSync 不受源码变更影响) |
| src/ 被修改 | ❌ 无 |
| 可回滚 | ✅ `git checkout master` 回到基线，`git branch -D spike/phase-0` 删除 spike |

---

## 十、进入 Product V2 开发的条件评估

### 10.1 已具备 ✅

| 条件 | 状态 | 说明 |
|------|------|------|
| Git 版本控制 | ✅ | master 基线 + spike 分支 |
| mp-weixin 编译流水线 | ✅ | 编译 → patch-vendor → check-uts-compile 全链路通过 |
| Design Token 系统 | ✅ | 完整的 colors/typography/spacing/radius/shadow/z-index/animation |
| 布局系统 | ✅ | flex/grid/spacing helpers |
| 基础组件库 | ✅ | 9 个 base 组件 + 3 个 layout 组件 |
| Theme Components | ✅ | hero/card/toolbar 可复用样式模块 |
| 数据层 (Domain/Store/Repo) | ✅ | 4 模块完整 (Wardrobe/Wish/Purchase/Reminder) |
| Feed Spike 页面 | ✅ | 编译通过，结构验证完成 |

### 10.2 未具备 ❌

| 条件 | 状态 | 阻塞级别 | 说明 |
|------|------|----------|------|
| 后端 API | ❌ | **P0** | 零网络请求代码，Feed/商品/用户均需后端 |
| 账号系统 | ❌ | **P0** | 游客模式，无登录/注册 |
| 内容域实体 | ❌ | **P0** | Brand/Product/ContentPost/Outfit 不存在 |
| 图片服务 | ❌ | **P0** | 无 CDN/上传/缩略图 |
| 虚拟列表 | ❌ | **P1** | AppX 无内置，需 scroll-view 分页 workaround |
| Android 真机验证 | ❌ | **P1** | 服务器无 Android 环境 |
| Feed 运行时性能 | ❌ | **P1** | 仅编译验证，需微信开发者工具实测 |
| src/ 目录清理 | ❌ | **P2** | 两套文件共存，需在 V2 开发前清理 |

### 10.3 最终判断

**可以进入 Product V2 内容模型与 UI 壳层开发**，但有前提:

1. **内容模型设计**可以立即开始 — 不依赖后端，先定义 Entity/Type/Schema
2. **UI 壳层开发**可以立即开始 — 使用现有 Design Token + 组件 + 色块占位
3. **真实数据接入**需要后端就绪 — Feed API、图片服务、账号系统
4. **src/ 清理**建议在 V2 首个 PR 前完成 — 避免开发者误编辑
5. **Android 验证**建议在 UI 壳层完成后进行 — 确保 Android 编译不退化

---

## 附录: 关键命令

```bash
# Git 基线
cd /home/admin/projects/sankengcloset
git log --oneline --all
# 4bb2dd1 Phase 0: Feed performance spike page
# 93a6b25 Product V2 migration baseline

# 构建验证
/opt/HBuilderX/cli launch mp-weixin --project /home/admin/projects/sankengcloset --compile true
python3 scripts/patch-vendor.py unpackage/dist/dev/mp-weixin
node /home/admin/scripts/check-uts-compile.js unpackage/dist/dev/mp-weixin

# Vapor 验证
# manifest.json 中 "vapor": true 被 mp-weixin 编译器静默忽略
# 输出仍为 "VDOM模式"

# 回滚 spike
git checkout master
git branch -D spike/phase-0
```
