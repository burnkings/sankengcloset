# Design System V3 全局迁移分析报告（2026-08-12）

> 分支：`agent/design-system-v3-docs-cleanup-20260812`
> 基线：`agent/upload-current-fix-20260806` @ `5458f14`（审计基线与 V3 文档一致）
> 唯一规范：`docs/design/DESIGN-SYSTEM-V3.md`
> 依据：`docs/operations/agent-prompts/HERMES-UI-V3-EXECUTION-PROMPT.md`（Phase 0—Phase 6）

## 一、提交清单（按阶段）

| 提交 | 阶段 | 内容 |
|---|---|---|
| 536213d | Phase 0 | 只读盘点（路由/引用关系/死代码/安全基线） |
| b805f4c | 基线 | 引入 DESIGN-SYSTEM-V3.md + docs README + agent-prompts |
| 4c00434 | 清理 | 删除旧规范（DESIGN-LANGUAGE-V2/Gate0/Responsive）+ 7 份历史报告标记 |
| 869f605 | 目录 | 18 份报告归档 2026-07/、运行手册迁 operations/、仓库名统一 |
| 436a43d | 目录 | PRODUCT-DIRECTION-CURRENT + reports README |
| 70ebe82 | 清理 | 删 v2-visual-lab + backend/（引用扫描零命中） |
| 7b429d1 | Phase 1 | V3 Token（colors/typography/spacing/radius/shadow/responsive）+ components/v3/ 21 组件 + AppTag 去 emoji + 预览页 + calendar/close 图标 |
| 2eaa14d | Phase 2.1 | 首页（头部 252rpx、双列 353×470、ReleaseCard/EditorialCard、FeedSkeleton/PageState） |
| c262e37 | Phase 2.2 | 发现页（紧凑标题+专题横卡+品牌目录+发售日历） |
| 74c6ca6 | Phase 2.3 | 收藏页（商品/穿搭/品牌/合集频道） |
| 9793949 | Phase 2.4 | 圈子页（双列 NoteCard） |
| db75703 | Phase 2.5 | 我的页（紧凑头部+去统计数字） |
| 71786ca | Phase 3.1 | 通知页（行结构+图标化）+ 我的动态（分段控制） |
| 60af94a | Phase 3.2 | 编辑专题 + 发布页 |
| 5a6179b | Phase 3.3 | 搜索页（+arrow-back 图标） |
| 63672e3 | Phase 3.4 | 商品详情（底部三件套：收藏/设置提醒/前往官方渠道） |
| 5d44060 | Phase 4.1 | 预算页（使用进度）+ 愿望单列表（SummaryStrip） |
| aa0ff5f | Phase 4.2 | 衣橱列表（353×470 图库） |
| 31d568a | Phase 4.3 | 衣橱编辑（表单组/危险操作分离） |
| b17ae8f | Phase 4.4 | 订单列表（+check 图标）+ 心愿详情 |
| 3b5b6fb | Phase 4.4b | 心愿详情 gap/hex+alpha 清理 |
| 2a0a0b7 | Phase 4.5 | 订单详情 + 订单编辑（FormSection/SegmentedControl/DateField） |
| 01ab66f | Phase 4.6 | 提醒列表（SummaryStrip + 图标化勾选） |
| 8c04077 | Phase 4.7 | 提醒编辑（去 👗/›/✕/✓）+ 订单导入 + 心愿编辑 |
| 33725b2 | Phase 5 | 偏好/外观/通知/关于/协议（外观三态、通知分项） |
| d16ca0c | Phase 5 清理 | git rm 13 个零引用 V2 组件 + theme/components 4 文件（-1211 行） |
| cbea947 | Phase 5 清理 | dev 页收口（删 ui-playground/page-playground，保留 feed-spike/device-diagnostics） |

## 二、文件变更统计

- 新增：components/v3/ 21 个组件、static/icons/ 6 个（calendar/close/arrow-back/check + active 版）、pages/dev/design-system-v3.uvue、docs/* 若干
- 修改：theme/tokens/ 6 个、pages/ 全部 28 个用户页、scripts/check-v24（首页搭配度断言移至详情）
- 删除：components/v2/ 13 个、theme/components/ 4 个、pages/dev/ 3 个（v2-visual-lab/ui-playground/page-playground）、backend/ 2 个、旧设计文档 3 个

## 三、28 页完成表

| 页面 | 状态 | 关键迁移 |
|---|---|---|
| home/index | ✅ | 252rpx 头部、搜索 72rpx、ChannelTabs、ProductCard 353×470、ReleaseCard/EditorialCard、FeedSkeleton/PageState |
| discover/index | ✅ | PageHeader/SectionHeader/ListGroup、32rpx 边距、搜索 72rpx |
| favorites/index | ✅ | FilterChips、ProductCard/NoteCard 双列、ListGroup 品牌列表 |
| community/index | ✅ | 双列 NoteCard、三态 PageState、筛选胶囊化 |
| community/mine | ✅ | 已发布/本地草稿分段、紧凑列表、仅本机标识 |
| profile/index | ✅ | 紧凑头部、去统计数字、ListGroup 设置 |
| notification/index | ✅ | 行结构、类型图标化（去 降/赞/橱/售 文字） |
| search/index | ✅ | 输入 72rpx、历史胶囊、FeedSkeleton/PageState、双列结果 |
| share/create | ✅ | 图片区优先、坑向/话题胶囊（品牌浅底深字）、按钮 88rpx |
| product/detail | ✅ | 底部三件套、搭配度辅助模块、priceLarge |
| editorial/detail | ✅ | 16:9 头图、双列专题商品 |
| wardrobe/index | ✅ | SummaryStrip、353×470 图库、类别标签 token 化 |
| wardrobe/edit | ✅ | FormSection/SegmentedControl、危险操作分离 |
| budget/index | ✅ | 预算使用进度模块（非统计卡）、SummaryStrip |
| purchase/index | ✅ | SummaryStrip（本月已支付+待付）、状态分组、逾期 danger token |
| purchase/detail | ✅ | StatusChip、金额分解 gap 清理 |
| purchase/edit | ✅ | FormSection/SegmentedControl/DateField、saving 锁 |
| purchase/import | ✅ | 三步流程、OCR 未配置引导手动补全（保留） |
| wishlist/index | ✅ | SummaryStrip（总数+待买）、FilterChips、双列 |
| wishlist/detail | ✅ | StatusChip、状态流转、生成购买记录确认 |
| wishlist/edit | ✅ | 状态/优先级胶囊、token 化 |
| reminder/index | ✅ | SummaryStrip（待办/今日/过期）、快速完成撤销 |
| reminder/edit | ✅ | 类型图标、衣橱绑定（去 👗）、时间选择器 |
| preferences/index | ✅ | 内容偏好（标题+说明更新）、多选胶囊 |
| preferences/appearance | ✅ | 三态 SegmentedControl + 预览 |
| preferences/notification | ✅ | 总开关+四分类 AppSwitch |
| about/index | ✅ | ListGroup/ListRow、版权弱文本 |
| about/legal | ✅ | 协议正文 28rpx/46rpx、token 对齐 |

## 四、V3 红线执行证据

- 文本符号清除：×/✓/›/▾/✕/👗/降/赞/橱/售 → AppIcon 线性图标（新增 calendar/close/arrow-back/check）
- 硬编码颜色清除：页面级 #FF4D4F/#52C41A/#007AFF/#E9C5CD/#F5EFEC/#FFF5F7/#5C5550/#CF1322/#FFF1F0 等 → token（brand/semantic/surfacePink/bgSecondary）
- gap 清除：pages/ 全部 gap → margin（V3 §10 红线）；残留仅 feed-spike 内部性能测试代码
- hex+alpha 拼接（color+'30'/'15'/'CC'）→ surfacePink token
- emoji 清除：AppTag emoji 属性移除、👗 占位 → shirt 图标
- 统计大卡清除：V2StatsCard 全部 7 处 → SummaryStrip/预算进度（首页/收藏/圈子禁用统计区）
- Feed 卡无白底盒无阴影；列表组 20rpx 圆角分割线；按钮 88rpx/16rpx

## 五、质量门禁（每阶段真实执行）

- `node scripts/check-v24-remote-runtime.js` — PASS（首页搭配度断言已迁移至 product/detail 覆盖）
- `node scripts/check-v25-android-beta.js` — PASS
- `node scripts/check.js` — PASS（含编译产物 require 检查）

## 六、未验证事项（如实）

1. 微信小程序真实编译与真机：需 HBuilderX CLI 编译（下一步）
2. Android release 编译与真机启动：需 launch app-android
3. 320/360/375/390/414/430px 等效宽度浅/深色截图：需真机/模拟器
4. 首页 30/100/300 卡滚动性能：需真机
5. 静态门禁不能冒充编译通过——以上为独立验证项

## 七、风险与后续

- 订单金额单位：全部整数分（与后端契约一致，2026-08-12 统一）
- 心愿单 estimatedPrice 单位假设为元（旧风险，编辑页 parseFloat 直接存；后端 wish schema 无单位说明，后续核对）
- 用户设备历史「元」存储的 purchase_records 显示放大风险（生产库 purchase=0，仅理论）
- 分支未推送远程；未修改 main、未 force push、未合并 PR
