# 三坑绮橱

UniApp X 兴趣内容 App：发现商品、收藏、动态、衣橱、提醒与购买记录。商品以图片、介绍与原店外跳为主。

- [有效设计规范](docs/design/DESIGN-SYSTEM-V3.md)
- [本轮界面与数据对接更新](docs/product/PRODUCT-UPDATE-20260908.md)
- 后端公开仓库：https://github.com/burnkings/sankengcloset_service （注意下划线）

## 日常开发：怎么检查

```bash
npm run verify         # 一条命令跑完全部源码级检查（5 项，约 1.6 秒，不需要编译产物）
npm run verify:watch   # 同上，但监听文件变化自动重跑 —— 保存即校验，不用手敲命令
npm run verify -- --only=gates      # 只跑某一项（gates / runtime / sync / android / tests）
```

包含：源码门禁（v2 引用禁令 / 主题响应式 / pages.json 路由与图标 / uvue 绑定规则 6 条）、
运行时契约、同步一致性、Android 静态、单元测试（`tests/*.test.cjs` 自动发现，新增用例无需改脚本）。

```bash
npm run check          # 发布前才需要：源码级检查 + mp-weixin 编译产物校验（需要先编译）
```

> 检查**只在你说要跑的时候才跑**：没有任何命令会自动触发它（编译前也不跑）。
> `npm run check` 会校验 `unpackage/dist/dev/mp-weixin/app.js` 是否存在，**没有编译产物时必然失败**，
> 所以日常迭代请用 `npm run verify`。CI（`.github/workflows/v3-source-gates.yml`）对 PR 强制运行 `npm run verify`。

## 2026-09-11 全量走查与门禁加固

- [还差什么：内容完善度盘点](docs/product/GAP-ANALYSIS-2026-09-11.md)（合规缺口、功能缺口、9/9 反馈闭环状态）
- [工程待办与已修清单](docs/operations/agent-prompts/OPTIMIZATION-BACKLOG-2026-09-11.md)
- 修复商品详情渲染即崩溃（13 个未定义样式名）、7 个页面提示静默失效、底部留白层层叠加、
  提醒「已完成」混入「已过期」、图片失败不可重试等问题；新增 6 条 uvue 绑定门禁规则防止复发。

## 2026-09-09 收藏与榜单可靠性修复

详见 [docs/product/CONTENT-CONSISTENCY-20260909.md](docs/product/CONTENT-CONSISTENCY-20260909.md)，包含测试结果及尚未完成的平台验收。

## 2026-09-09 App 真机反馈修复

[20 项反馈处理与验收清单](docs/product/APP-FEEDBACK-20260909.md)：导航、表单、主题反馈、月份选择和详情入口；原生闪退仍需 Android 日志及实机复验。
