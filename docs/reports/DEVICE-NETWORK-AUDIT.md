# 设备网络审计报告

项目: sankengcloset (三坑绮橱)
日期: 2026-07-15
版本: 1.4.0
审计范围: src/ 全部 .uvue / .uts / .ts / .js / .json 文件

---

## 一、网络地址扫描结果

扫描目标: localhost, 127.0.0.1, 0.0.0.0, 192.168.x.x, 10.x.x.x, http://, 远程 API URL

| 发现数量 | 详情 |
|---------|------|
| localhost | 0 |
| 127.0.0.1 | 0 |
| 0.0.0.0 | 0 |
| 192.168.x.x | 0 |
| 10.x.x.x | 0 |
| http:// | 0 |
| 远程 API | 0 |
| setTimeout 模拟 | 2 (home-feed-store.uts) |

**结论: 项目源码中零网络地址。首页完全使用本地 Mock 数据。**

---

## 二、图片来源审计

所有 FeedItem.coverUrl 来源:

| 文件 | 图片路径 | 类型 |
|------|---------|------|
| mock-feed-repo.uts:100 | /static/demo/prod-XX.png | 本地资源 |
| mock-feed-repo.uts:124 | /static/demo/event-XX.png | 本地资源 |
| mock-feed-repo.uts:149 | /static/demo/event-XX.png | 本地资源 |
| mock-feed-repo.uts:169 | /static/demo/outfit-XX.png | 本地资源 |

唯一图片路径 (10 个):
- /static/demo/prod-01.png ~ prod-06.png
- /static/demo/event-01.png ~ event-02.png
- /static/demo/outfit-01.png ~ outfit-02.png

---

## 三、构建产物对比 (关键发现)

### dev 构建 (unpackage/dist/dev/mp-weixin/static/demo/)

```
prod-01.png  ✓
prod-02.png  ✓
prod-03.png  ✓
prod-04.png  ✓
prod-05.png  ✓
prod-06.png  ✓
event-01.png ✓
event-02.png ✓
outfit-01.png ✓
outfit-02.png ✓
```

### build 构建 (unpackage/dist/build/mp-weixin/static/demo/)

```
目录不存在 ✗ — 仅 static/logo.png
```

**根因: HBuilderX 5.21 alpha 的 uni build 命令不会将 static/demo/ 子目录复制到生产构建产物。模拟器使用 dev 构建所以图片正常；真机使用 build 构建所以全部图片缺失。**

---

## 四、uni.getSystemInfoSync() 调用点

| 文件 | 行号 | 用途 |
|------|------|------|
| components/base/AppNavbar.uvue | 50 | statusBarHeight + 胶囊定位 |
| components/layout/MainLayout.uvue | 18 | statusBarHeight |
| components/layout/DetailLayout.uvue | 30 | statusBarHeight |

均为标准 API，无已知兼容性问题。

---

## 五、setTimeout / Promise 模拟

| 文件 | 行号 | 内容 |
|------|------|------|
| stores/home-feed-store.uts | 140-148 | await new Promise + setTimeout 300ms 模拟网络延迟 |
| stores/home-feed-store.uts | 164 | await new Promise + setTimeout 200ms 模拟网络延迟 |

纯模拟延迟，不涉及真实网络请求。真机上 setTimeout 行为一致，非风险点。

---

## 六、生产代码禁止地址检查

| 检查项 | 结果 |
|--------|------|
| localhost | ✓ 未发现 |
| 127.0.0.1 | ✓ 未发现 |
| 0.0.0.0 | ✓ 未发现 |
| 服务器内网 IP | ✓ 未发现 |
| HTTP API | ✓ 未发现 |
| 自签名 HTTPS | ✓ 未发现 |
| 需要 Cookie 的图片 | ✓ 未发现 |

---

## 七、微信小程序域名配置

当前项目无远程网络请求，无需配置:
- request 合法域名: 不需要 (纯本地 Mock)
- downloadFile 合法域名: 不需要
- uploadFile 合法域名: 不需要
- websocket 合法域名: 不需要

---

## 八、结论与修复优先级

### P0 — 阻塞真机运行

1. **static/demo/ 未复制到 build 产物**
   - 修复: 编译后手动 cp -r static/demo/ 到 build 产物
   - 或: 在 vite.config.ts 中配置 assetsInclude / copy plugin

### P1 — 需要验证

2. **list-view / list-item 在真机上的渲染兼容性**
   - 需要真机诊断页确认
3. **paddingBottom 百分比技巧在真机上的表现**
   - imgWrap34: paddingBottom: '133.33%' (3:4 比例)
   - imgWrap169: paddingBottom: '56.25%' (16:9 比例)
   - imgWrap45: paddingBottom: '125%' (4:5 比例)
   - 需要真机确认

### P2 — 低风险

4. **use-theme.uts 顶层 ref/computed**
   - 模块级响应式状态，在小程序中可能有初始化时序问题
   - 当前无实际报错证据，仅标记观察
