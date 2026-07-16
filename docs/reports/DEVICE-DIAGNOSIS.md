# 真机诊断总结

## 根因 (P0)

**static/demo/ 目录（11张图片）在 build 构建中缺失。**

| 构建类型 | static/demo/ | 图片数量 | 使用场景 |
|---------|-------------|---------|---------|
| dev (unpackage/dist/dev/) | ✓ 存在 | 11 | 微信开发者工具模拟器 |
| build (unpackage/dist/build/) | ✗ 缺失 | 0 | 真实手机 (miniprogram-ci upload) |

模拟器用 dev 构建所以正常；真机用 build 构建所以：
- 首页所有 Feed 卡片图片加载失败
- AppImage 组件触发 onError → 显示占位符或白块
- 如果 list-view 对空图片有兼容问题 → 可能导致整个页面崩溃

## 已执行修复

1. ✅ 上传 v1.4.1 使用 dev 构建（含 static/demo/ 图片）
2. ✅ 创建设备诊断页 `pages/dev/device-diagnostics.uvue`（待编译收录）
3. ✅ 创建网络审计报告 `docs/reports/DEVICE-NETWORK-AUDIT.md`
4. ✅ 确认零网络地址、零远程 API、零安全风险

## 编译器问题

HBuilderX 5.21 alpha 的 uni CLI 在删除 build 输出目录后缓存不一致：
- build 命令输出 "DONE" 但不产出文件
- 需要 HBuilderX GUI 重新编译或清除完整缓存

## 验证步骤

用户需要在真机上确认：
1. v1.4.1 首页图片是否正常显示
2. 如果正常 → 根因确认为 static/demo/ 缺失
3. 如果仍失败 → 需要查看真机 console 日志（用诊断页）

## 长期修复

编译后增加 post-build 脚本：
```bash
cp -r static/demo unpackage/dist/build/mp-weixin/static/demo
```
或在 vite.config.ts 中配置 copy plugin 确保 static/demo/ 被复制到 build 产物。
