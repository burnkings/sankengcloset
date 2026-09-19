# 过渡数据 App 修复与打包验收

## 交付基线

本分支基于远程 `agent/transition-followup-20260919`，包含此前 transition-feedback 和 followup 的修复。检查时 main 仍缺少这些修改。服务端更新 PM2 不会更新手机安装包。本次不改数据库、不重导数据。

## 本次代码修改

1. 消费日志月份箭头使用同一 viewBox、线宽、镜像坐标的 SVG，88rpx 相同点击区域；月份居中，月份栏在预算上方。
2. 提醒保存前请求 Android 13+ POST_NOTIFICATIONS。权限插件放在 uni_modules 内，适配 Vapor 的原生调用边界，需要 HBuilderX 5.21+。拒绝时仍保存应用内提醒，并提供系统设置入口。成功提示在返回后用系统 toast 显示 3500ms，普通 feedback 默认 3000ms。
3. 品牌目录服务缓存 5 分钟（含空结果），并合并并发请求。发现页保留已显示品牌，刷新时不闪回骨架屏。
4. 品牌商品映射补 priceType、saleStatus、depositCents、balanceCents、fullPriceCents、shopName；修正模板嵌套引号。品牌详情显示已有 logo、坑向、简介。后台没有简介/多图/颜色/尺码时，不伪造旧样例内容。
5. 首页最多缓存四个频道，每频道沿用现有最多 200 条限制；保存列表、cursor、hasMore。5 分钟内直接复用，过期后台刷新；偏好变更清缓存，切频道废弃旧请求。
6. 商品卡在状态/定金和主价格之间增加弹性留白，主价格靠右。
7. FeedColumn/FeedBlock 使用 openItem 自定义事件，避免 tap 与原生事件混用；商品卡阻止原生 tap 冒泡；统一导航验证 ID、去除 Feed 前缀。属于代码层风险修复，尚未通过用户设备确认导致“商品不存在”的唯一原因。
8. 对照商品直接读取原 services/mock/mock-catalog.uts 前两条（深蓝格裙45cm、月光曲JSK），保留原 ID/图片/说明/标签/价格。旧 preview URL 解析到原样例。真实商品请求失败不会回退成样例。

## 验证

- `node --test tests/transition-followup.test.cjs`：7 项通过；执行 UTS 转换后的真实服务/状态函数，覆盖原样例详情、旧样例链接、导航 ID、品牌字段、品牌缓存并发/失败重试、频道缓存、提示时长。
- 修改涉及的 9 个页面/组件按 APP 与非 APP 条件各解析一次，18 次 Vue 模板编译检查通过。
- 上述检查不是 HBuilderX UTS→Kotlin 编译，也不代表实际点击事件、SVG、权限弹窗已真机验收。

## 通知的明确边界

当前是应用内 Reminder + uni.createPushMessage 本地通知，没有写入系统日历；不需要 READ_CALENDAR/WRITE_CALENDAR。申请日历权限不会修复通知。
现有本地调度仍限制 14 天，且尚未验证编辑/删除后取消旧调度、杀进程/重启后可靠到点。不能把“保存提醒”写成“手机通知已保证送达”。授权后再编辑保存可重新调度；首次进入设置开启权限后，需要回到提醒重新保存。

## Android 17

Android 17 为 API 37。此次补通知运行时权限与有界缓存，但没有盲改 targetSdk。完整适配还需兼容的 DCloud 原生运行时、Push SDK 和真机包。

官方依据：
- https://developer.android.com/about/versions/17/behavior-changes-all
- https://developer.android.com/about/versions/17/behavior-changes-17
- https://doc.dcloud.net.cn/uni-app-x/uts/utsandroid.html

打包时核对 SDK 37 支持、原生库加载、预测返回/边到边安全区；在大屏/旋转下检查布局（target 37 不可依赖强制竖屏）。本应用公开 HTTPS API 不需要申请局域网权限；如开发包改用局域网调试需单独验证。原生运行时版本、ABI/页大小、后台通知由实际 APK 验证，不以源码判断合格。

## 给服务器 MiMo 的执行指令

请仅完成无法在此环境完成的打包与设备验证，不重建数据库，不重新生成假数据。

```bash
cd /home/admin/projects/sankengcloset
git status --short
# 如有未提交修改，先保留并整理，禁止 reset --hard 覆盖。
git fetch origin agent/transition-runtime-20260919
git switch -c verify/transition-runtime-20260919 --track origin/agent/transition-runtime-20260919
# 若本地该验证分支已存在，改为切换该分支，然后 git merge --ff-only origin/agent/transition-runtime-20260919
git rev-parse HEAD
node --test tests/transition-followup.test.cjs
```

1. 使用 HBuilderX 5.21+ 或确认支持 Vapor UTS 插件的更新版本编译 App 自定义基座与正式 APK；没有 HBuilderX/签名配置应明确报告，不能用 npm build 替代。
2. 记录安装 APK 的版本、源码 SHA、API base URL，确保手机实际安装新包。依次点两条原始样例、两条真实商品、榜单商品。记录跳转 ID、HTTP 状态及返回 id；样例不得请求服务端商品接口。如果真实详情依旧失败，用相同 ID 对比公网 API 与包内请求，定位错误层后修改。
3. Android 17/API37 设备验证通知首次申请、拒绝、设置开启后重新保存、前台/锁屏/后台/杀进程/重启后的两分钟提醒，以及编辑/删除取消旧通知。若本地 Push 不支持可靠定时，不可声称已完成；在现有提醒结构上实现可取消的原生调度或服务端推送，避免定时器常驻。记录真实投递时间。
4. 提交消费日志镜像箭头、月份位置、价格靠右、品牌详情字段与连续切换四频道的截图；核对 5 分钟内不重复拉取频道/品牌。
5. 只有完整编译与验收通过后合并，报告未通过的具体项目。无需改动数据库或重部署后端来修前端布局。
