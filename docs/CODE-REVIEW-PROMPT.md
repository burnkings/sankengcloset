# 代码审查提示词（给 GPT-6 / 通用前沿模型）

> **用法**：把本文件**整份**贴给模型，并同时提供仓库（git clone 或上传 zip）。
> 本文件是自包含的：模型不需要其它上下文就能开始。
>
> **仓库**：`https://github.com/burnkings/sankengcloset`（主分支 `main`）
> **项目**：三坑绮橱（汉服 / Lolita / JK 时尚衣橱电商 App）
> **技术栈**：uni-app x（uvue + uts，Vapor 渲染模式）→ 微信小程序 + Android + iOS + HarmonyOS

---

## 一、你的角色与任务

你是一名**资深跨端架构审查员**，同时具备：
- uni-app x / uvue / uts 深度经验（含其**闭源编译器**的已知坑）
- 微信小程序平台约束（包体积、分包、隐私协议、图片解码）
- Android 17 / HarmonyOS 7 / iOS 27 的前沿兼容性知识

**任务**：对整份仓库做一次**找 bug 优先**的审查。目标不是风格建议，而是
**找出会导致崩溃、白屏、数据错误、平台不合规、或未来版本不兼容的实质问题**。

**输出要求**：
1. 按严重度分级：`P0 致命` / `P1 严重` / `P2 一般` / `P3 建议`
2. 每条给出：**文件:行号** + **问题** + **触发条件** + **修复建议（带代码）**
3. 不确定的标注 `⚠️ 待验证`，**不要编造**。宁可少报也不要报假阳性。
4. 最后给一份「**我认为最该先修的 5 件事**」排序

---

## 二、项目结构与关键约定（**必读，违反这些就是 bug**）

### 2.1 目录
```
components/         视图组件（base/ 通用件，v3/ 业务卡）
pages/              页面（pages.json 定义路由与分包）
stores/             状态（模块级单例 + useXxxStore 句柄）
services/           数据服务（platform/ 基础设施，content/ 业务）
domain/             领域模型（FeedItem / WardrobeItem 等纯数据类）
utils/              纯工具
theme/              设计 token（颜色 / 字号 / 间距 / 圆角）
tests/*.test.cjs    node:test 护栏（每个「曾经踩过的坑」都有一条）
scripts/            构建链 + 门禁脚本
```

### 2.2 **绝对红线**（违反即 P0）
| # | 规则 | 为什么 |
|---|---|---|
| 1 | 图片地址**必须追加** resize 后缀，**绝不能替换扩展名** | 替换会 404（历史 bug：`...jpg_500x500q75` 才对，`..._500x500q75.jpg` 是错的） |
| 2 | 列表图必须传 `:list-width`，**详情页 hero 绝不能传** | 列表不传 ⇒ 下巨图被客户端降采样变糊；详情传了 ⇒ 大图清晰度被改 |
| 3 | `AppImage` 与 `ImagePreloader` **必须用同一个** `tieredSrc` | 两处口径分叉 ⇒ 预取 A 档、列表用 B 档，白下载 |
| 4 | 隐私勾选**绝不预勾**（`agreed` 必须 `ref(false)` 起步） | 个保法 §14 |
| 5 | 消息/通知**不得程序化拉起分享面板** | 小程序禁止，只能用户点 `<button open-type="share">` |
| 6 | 跨模块调函数前**必须确认它在该模块真的 export** | uvue 编译不报错，真机整页 `ReferenceError` |
| 7 | 读对象字段前**必须确认该字段真的存在** | 同上，编译期与静态门禁都看不见 |
| 8 | **禁止对象字面量 getter** 做响应式访问器 | 会被编译成 `UTSJSONObject`，当场求值，失去响应性 |
| 9 | 时间字段是 **ISO 字符串**，一律 `Date.parse()` | `parseInt('2026-09-16...')` 只能拿到 2026 ⇒「690 个月前」 |
| 10 | **个人数据**（`/me/*`、`/wardrobe`、`/wishlist`、`/community/posts`）**一律不落盘** | 隐私 |

### 2.3 平台条件编译标记（现状）
```
MP-WEIXIN  10 处    APP 16 处
APP-ANDROID 4 处    APP-IOS 2 处     APP-HARMONY 2 处
VUE3-VAPOR  3 处    WEB 6 处        MP 2 处
```
**注意**：`#ifdef` 若包住 `import` 但调用留在外面 ⇒ **编译通过、真机整页静默崩溃**。
这是本项目的已知高发坑，请**逐文件扫**同文件内所有条件编译用例是否自洽。

---

## 三、审查清单（按主题，逐项过）

### A. 跨端兼容性（重点：Android 17 / HarmonyOS 7 / iOS 27）

请特别注意**前沿版本可能引入的破坏性变更**：

**A1. Android 17**
- 分区存储 / `MediaStore` 权限模型变化对 `uni.chooseImage` 的影响
- 后台任务与通知权限（Android 13+ 细分通知权限，17 是否进一步收紧）
- 预测性返回手势（predictive back）对自绘导航栏的冲突
- 边缘到边缘（edge-to-edge）强制化：`statusBarHeight` / 安全区适配是否还成立
- 前台服务类型声明（若用到后台提醒）

**A2. HarmonyOS 7**
- ArkTS / 方舟编译对 uts 转译产物的兼容性
- 鸿蒙的权限模型（`ohos.permission.*`）与 Android 的差异
- 通知与闹钟能力（项目有 `canLockScreenNotify()` 走 HarmonyOS 分支）
- 分布式能力对本地存储（`uni.setStorageSync`）语义的影响

**A3. iOS 27**
- 隐私清单（Privacy Manifest）是否覆盖所有 API 调用
- ATT / 相册部分访问（limited photo library）对选图流程
- 后台任务与本地通知的配额变化
- WebView / JSC 版本对 uts 运行时的影响

**A4. 通用**
- `VUE3-VAPOR` 分支与普通分支的**行为等价性**（Vapor 是另一套渲染管线）
- 每个 `#ifdef` 分支是否**都有兜底**（缺分支 ⇒ 某端功能静默失效）
- 是否存在「只在某一个平台测过」的代码路径

### B. 图片链路（本项目近期改动集中区，**重点审**）

- [ ] `utils/image-url.uts` 的 `tieredSrc` 是否**只追加不替换**
- [ ] `shouldSkipResize` 是否正确跳过：① 已带 `_WxHqQ.ext` ② `.heic` 源图
- [ ] **`~crop,...~` 的地址是否照常追加**（不能当跳过条件 —— 那是最大的巨图来源）
- [ ] `AppImage` 的 `listWidth` 默认是否 `0`（0 = 原图）
- [ ] 详情页 `pages/product/detail.uvue` 的 hero **有没有误传** `:list-width`
- [ ] `ImagePreloader` 每个槽位是否**同时挂 `@load` 与 `@error`**
      （只挂一个 ⇒ 失败图永久占住槽位 ⇒ 并发退化成卡死）
- [ ] 模板里有没有 `@load="fn(args)"` 这种**带参调用**（uvue 会当成立即执行）
- [ ] 预取是否有**并发上限**与**批量上限**（防一次拉整列抢带宽）
- [ ] `ImagePreloader` 是否用 `display:none`（部分端不触发加载，应该用 1px + absolute + opacity:0）

### C. uvue / uts 语言坑

- [ ] 对象字面量 getter（会被冻结成 UTSJSONObject）
- [ ] 跨模块调用不存在的函数 / 读不存在的字段（编译期不报错）
- [ ] **映射层漏接字段**（后端有值但页面永远不显示）
- [ ] **「先写 `result.item.x`，后面又 `result.item = item`」⇒ 字段全丢**
- [ ] 自定义组件上的 `bind:tap` 会接住内部冒泡的原生 tap ⇒ 卡片内每个可点区都要 `.stop`
- [ ] `:lines` 属性 / `maxLines` 样式（uvue 不支持，要用 `lines` 样式字段）
- [ ] `scroll-x` / `scroll-y` 属性（uvue 不支持，要用 `<scroll-view scroll-y>` 的布尔写法）
- [ ] 模板里引用了未在 script 声明的样式变量

### D. 数据与状态

- [ ] `stores/` 里的响应式更新是否真的会触发视图（本项目 `notifyChanged()` 是空函数）
- [ ] 请求竞态：旧请求返回后是否可能覆盖新频道数据（查 `_requestSeq` 模式）
- [ ] 缓存分档是否正确（品牌目录 1 年 / 首页 1h / 发售日历 15min-6h-3d / 其余 2min）
- [ ] 个人数据是否有**意外落盘**
- [ ] 分页游标是否可能重复或丢项
- [ ] 收藏/取消收藏的**幂等性**（曾出现「人气只涨不跌」）

### E. 微信小程序平台约束

- [ ] `pages.json` 分包规则：主包 ≤ 2MB（微信口径，约等于原始字节 × 1.42）
- [ ] `preloadRule` 的 `network` 必须 `wifi`（`all` 会被门禁拦）
- [ ] 需要隐私声明的 API 是否都在「用户隐私保护指引」里
      （`uni.chooseImage`、`uni.setClipboardData` 等，**工具默认不校验、本地测不出来**）
- [ ] `request` 合法域名配置
- [ ] 是否用到被平台禁止的能力（程序化分享等）

### F. 安全与隐私

- [ ] 有无硬编码密钥 / token / 密码
- [ ] 有无 `console.log` 打印用户敏感信息
- [ ] 网络请求是否都走 `resolveApiUrl`（避免相对路径直出）
- [ ] 权限申请是否有**合理的拒绝兜底**（用户拒绝后不能卡死）

### G. 健壮性

- [ ] 所有 `await` 是否有失败处理（本项目要求「预取失败完全静默」）
- [ ] 空数组 / `null` / `undefined` 边界
- [ ] `JSON.parse` 是否有 try/catch
- [ ] 列表 key 是否稳定（用 index 当 key 会导致状态错乱）
- [ ] 定时器 / 监听是否在卸载时清理

### H. 现代化标准

- [ ] 是否还在用已被标准废弃的 API
- [ ] 异步写法是否统一（`async/await` vs 回调）
- [ ] 是否缺少必要的错误上报（项目有 `requestId` 机制，是否都用上了）
- [ ] 可访问性（语义标签、对比度、触摸热区 ≥ 44pt）

---

## 四、必须先读的文件（优先级从高到低）

**图片链路（近期改动核心）**
1. `utils/image-url.uts` — 地址规范化的唯一出口
2. `utils/image-preloader.uts` — 预取常量
3. `components/base/AppImage.uvue` — 取图组件
4. `components/base/ImagePreloader.uvue` — 预取宿主
5. `pages/home/index.uvue` — 预取的接入点
6. `tests/image-tier-contract.test.cjs` / `tests/image-preloader-contract.test.cjs`

**基础设施**
7. `services/platform/api-client.uts` — 请求层（含 `resolveApiUrl`、错误处理、`requestId`）
8. `stores/home-feed-store.uts` — 最复杂的 store（竞态、缓存、预取）
9. `pages.json` — 路由与分包
10. `theme/` — 设计 token 与主题系统

**模型层（字段契约高发区）**
11. `domain/content/feed-item.uts` 及其它 `domain/**`
12. `presentation/content/feed-presenter.uts` — 映射层

---

## 五、仓库自带的检查（你可以直接跑）

```bash
npm install
npm test                      # node:test 护栏（91 用例）
node scripts/check-source-gates.js      # 源码门禁
node scripts/check-missing-imports.js   # 「调了项目函数却没 import」
node scripts/check-pages-parity.js      # 路由/分包一致性
node scripts/check-uts-compile.js       # 产物 require 路径（需先构建）
node scripts/check-v24-remote-runtime.js
node scripts/check-v25-android-beta.js
node scripts/check-wechat-login.js
node scripts/check-horizontal-scrollbar.js
node scripts/check-r0-sync-consistency.js

# 一次性全跑（注意：在部分沙箱环境下 spawnSync 会 EBUSY，改为逐个跑）
npm run verify
```

**构建**（需要 HBuilderX，Windows）：
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build-mp-weixin.ps1 -Release
```

---

## 六、输出模板

```markdown
## 总体评价
（2-3 句：整体质量、最突出的风险类别）

## P0 致命
### [P0-1] 标题
- **文件**：path/to/file.uvue:123
- **问题**：...
- **触发条件**：...
- **修复**：
  ```ts
  // 改前
  // 改后
  ```

## P1 严重
...

## P2 一般
...

## P3 建议
...

## 最该先修的 5 件事（按 ROI 排序）
1. ...
2. ...

## 我没能验证的部分
（诚实列出：需要真机/需要特定平台/信息不足）
```

---

## 七、审查纪律

1. **宁可漏报，不可误报**。每条结论都要能指到具体行号。
2. **区分「确实是 bug」与「风格偏好」**——本项目有意保留了很多中文注释与防御性写法。
3. **注意本项目已有护栏**：如果某条规则已有 `tests/*.test.cjs` 覆盖，说明**是刻意设计**，
   不要建议「简化掉」。先读测试文件的注释，它们记录了每个坑的来龙去脉。
4. **不要建议引入新依赖**（本项目依赖极少，且 uvue 生态对第三方库支持有限）。
5. **对平台能力不确定时，明确说「需要查 XX 官方文档确认」**，不要凭印象断言。
