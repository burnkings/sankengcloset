# 三坑绮橱 · 本轮修复记录（2026-09-13 夜）

> 依据你的 5 条指令，对 `REVIEW-UPDATE-SUMMARY-2026-09-13.md` 里"仍未修"的条目动刀。
> 门禁：`npm run verify` **6/6 全绿**（源码门禁 / 运行时契约 / 同步一致性 / 横向滚动条 / Android 静态 / 单元测试）。
> 改动 11 个源码文件 + 1 个 pages.json。

---

## 1. 全面屏手势返回 —— 已补齐，14 页全覆盖 ✅

**核实结果**（不是"补了一部分"，是把边界找干净）：

- 页面侧有 `onBackPress` 的：13 个 → 现在 **14 个**
- `pages.json` 有 `swipeBackAsBackPress: true` 的：13 条 → 现在 **14 条**，与页面侧一一对应
- 新增缺口：`pages/purchase/edit` —— 它本身没有叠加层，但**日期面板改成自绘弹层后就有了**，所以这一页是这次才需要补的

**自查脚本**（可复跑）：
```bash
# 引用任何叠加层组件的页面，是否都注册了 onBackPress（期望 0 条输出）
for f in $(grep -rlE "import (AppDialog|BottomSheet|MonthPicker|DateField|ChipPicker)" pages/ --include=*.uvue); do
  grep -q onBackPress "$f" || echo "NO onBackPress: $f"
done
```

> 结论：**修完了**。iOS 侧滑经 `swipeBackAsBackPress` 转成 `onBackPress` 事件，Android 手势/实体返回键本来就会触发。

---

## 2. 日期选择器 —— 结论：**自绘更完善**，系统 picker 弃用 ✅

### 为什么系统 picker 是"夜间模式没变黑"的根因
`<picker mode="date">` 的弹层由**操作系统**渲染，只跟随**系统**深浅，**不跟随 App 主题**。
→ App 已是深色、系统还是浅色时，弹层就是白底。且它不受任何样式控制，**修不了**，只能弃用。

### 改法
| 文件 | 改动 |
|---|---|
| `components/v3/DateField.uvue` | **重写**：不再包系统 `<picker>`，改自绘 `picker-view` 底部面板（年/月/日三列）。面板底 `n.value.surface`、`picker-view` 底 `n.value.surface`、确定按钮 `n.value.iconActive`（深色 #E47A96）、遮罩 `n.value.overlay`、层级 `zIndex.bottomSheet` |
| `pages/reminder/edit.uvue` | 时间面板同源修复：`picker-view` **显式给 `n.value.surface`**（原生组件自带白底 = 深色白补丁的根因）、确定按钮 `brand[500]` → `n.value.iconActive`、遮罩 `rgba(0,0,0,0.3)`+`zIndex:999` → `n.value.overlay`+`zIndex.bottomSheet`（顺手清掉魔法数） |
| `pages/purchase/edit.uvue` | 三个日期字段改 `v-model:visible` 受控；新增 `onBackPress` 先关面板 |
| `pages.json` | `pages/purchase/edit` 加 `swipeBackAsBackPress: true` |

### 兼容影响（必须知道）
1. `DateField` 由"自己管开关"变成**父级 `v-model:visible` 受控**。
   原因：组件内部状态父页读不到，`onBackPress` 就没法先关面板（不这样做，返回键会直接 pop 整页、面板跟着消失）。
   当前唯一调用方是 `pages/purchase/edit`，已接入；后续新调用方需一并绑 `v-model:visible`。
2. **新增 props** `visible`（默认 false）、`title`（默认"选择日期"）；`value` / `placeholder` / `change` 事件**均未变**。
3. **年份范围**：过去 6 年 ~ 未来 3 年（原系统 picker 可选任意年份）。购买日期要能补录历史订单，所以**不能只给"今年起"**；
   超出范围的历史值会夹到最近端点。若将来需要更早的年份，扩 `yearOptions` 数组即可。
4. 自绘面板是 `position: fixed` 弹层，`purchase/edit` 里它嵌在 `scroll-view` 内。
   MainLayout 的默认插槽本身就在 `scroll-view` 里（收藏页的状态弹窗同结构、线上已验证），结构上可行；
   但**建议真机回归一次**这个组合（nesting 两层 scroll-view + fixed）。

---

## 3. 提醒事项逻辑 —— R3-3 与 R3-4 **是同一处病根** ✅

### 病根：分组看日期、状态看 status，两套口径各算各的
一条"今天 20:00"的提醒，过了 20:00 后 `autoMarkOverdue()` 已把它置成 `MISSED`，
但分组函数仍按 `days === 0` 判成"今天" → 于是同一行出现「今天 / 已过期」自相矛盾。
勾选态那边又用 `statusText !== '待提醒'` 画勾 → 红底 + 勾，读不出是"完成"还是"过期"。

### 改法
| 文件 | 改动 |
|---|---|
| `domain/reminder-presenter.uts` | `getGroupInfo()`：`MISSED` **先于**日期判定 → 一律落「已过期」组 |
| `stores/reminder-store.uts` | 新增 `hasPassedDue()` / `isOverdueItem()`，与 `autoMarkOverdue` **同源**；`overdueItems / pendingItems / todayItems / upcomingItems / *Count` 全部由它推导，删掉重复口径的 `missedItems()`；`filteredItems()` 的 MISSED / PENDING 分支同步 |
| `pages/reminder/index.uvue` | 勾只在「已完成」出现；**已过期 → 空心 `semantic.error` 描边圈，不填充、不画勾**；摘要「待办」由 `today+upcoming+missed` 三数相加 → `pendingCount`（原先会与"已过期"重复计数） |

### 顺手查出的逻辑漏洞
1. **原「待办」重复计数**：`todayCount + upcomingCount + missedCount` 与「已过期」`overdueCount` 口径重叠（`missedItems` 与 `overdueItems` 判据不同）。已修。
2. **原「已过期」双判据**：`remindDate < today || status === 'MISSED'`，与 `filteredItems` 的另一套写法不一致。已统一。

### 3.1 追加：当天宽限（用户定稿 a 方案）✅
按你的定义改掉"到点即过期"：

- `stores/reminder-store.uts` `hasPassedDue()`：**只判 `remindDate < today`**，删掉"当天但时刻已过"分支
- `stores/reminder-store.uts` `autoMarkOverdue()`：同步删掉当天时刻分支 —— 今天到期的提醒**当天不会被自动置为 MISSED**
- `domain/reminder-presenter.uts` `getGroupInfo()`：`days === 0` → 「今天」组（配合上面的规则，今天到期的条目稳稳留在「今天」）

**结果**：今天到期的提醒，哪怕提醒时刻已过，也仍在「今天」组、状态仍是「待提醒」，
点圆圈 → `markDone` → 进「已完成」；只有到了**第二天**才自动进「已过期」。

---

## 4. 深色 chip + 消费日志月份归属 ✅

### 4.1 深色 chip —— 核查后纠正了当初的诊断
**核查结论：状态 chip 早已走深色色板**（`StatusChip` 自创建起 `isDark.value ? statusColorsDark : statusColors`），
当初评审写的"StatusChip initial 没走 statusColorsDark"**是误判**。真正在深色下变成浅色补丁的是另外两处：

| 位置 | 改前 | 改后 | 说明 |
|---|---|---|---|
| `pages/product/detail.uvue` 同款/买家秀图片占位 | `backgroundColor: '#F2F2F2'`（硬编码浅灰） | `n.value.bgSecondary` | 深色下是**真的浅灰补丁**（本轮唯一剩的硬编码亮色背景） |
| `pages/search/index.uvue` 筛选 chip 选中态 | 实底 `brand[500]` + 白字 | 浅粉底 `surfacePink` + 玫粉字 `iconActive` 600 | 全站唯一残留的"实底玫粉" chip（评审 N1 漏网） |
| `theme/tokens/colors.uts` `statusColorsDark.initial.text` | `#9B6FAE`（暖黑底约 3.9:1） | `#B49BC4`（约 6.5:1） | 「即将发售」这类 initial chip 深色下不再发灰/像脏补丁 |

> **兼容影响**：第三项只影响**深色模式、`status="initial"`** 的 chip（商品卡 UPCOMING / 收藏 / 榜单），浅色零影响；
> 属既有 token 的取值修订，未新增 token、未动设计系统结构。

### 4.2 消费日志月份切换归属
- 移法：月份切换器从「分类卡 ← → 流水」之间**移到页面最上方**（预算卡之前），底部加 1rpx `n.value.divider` 发丝线，标题 28 → 30rpx。
- 理由：它同时管**预算进度 / 月度汇总 / 分类支出 / 逐笔流水** → 是**页面级**周期筛选，不该夹在两张卡中间；放最上方后"它在管这一屏"一目了然。

### 4.3 商品卡价格行双价降级
按你的要求 **未动**（保留「定金 + 全款」双价）。

---

## 5. 已确认但**没替你决定**的项

| # | 项 | 说明 |
|---|---|---|
| a | ~~提醒"今天+已过时刻"创建即过期~~ | **已按你的定义落地**：当天宽限，次日才进「已过期」（见 3.1） |
| b | `RankingCard` 价格用模块级常量 `brand.strong` | 深色下不刷新（同类 bug 的漏网）。A 改 `n.value.text`（中性）/ B 改 `n.value.iconActive`（保留粉）/ C 保持现状 |
| c | 深色下 AppImage 失败插画用 `brand[100/200/300]` 浅粉 | 仅错误态出现。A 做深色对照表 / B 深色下降透明度或改中性 / C 保持 |
| d | 提醒列表跨零点不自动刷新 | 页面停在 23:59→00:00 时，分组不会自己重算（需重进/onShow）。建议加跨天刷新 |
| e | 今天已过时刻的轻提示 | 宽限后会丢掉"时刻已过"的信息，可按建议 2 加灰色小字提示 |

---

## 附：本轮改动文件清单

```
components/v3/DateField.uvue          （重写：自绘日期面板）
pages/reminder/edit.uvue              （时间面板深色修复 + zIndex token）
pages/reminder/index.uvue             （勾选语义 + 摘要口径）
pages/purchase/edit.uvue              （v-model:visible + onBackPress）
pages/budget/index.uvue               （月份切换移到页面顶部）
pages/product/detail.uvue             （图片占位 #F2F2F2 → token）
pages/search/index.uvue               （筛选 chip 选中态统一）
stores/reminder-store.uts             （逾期/待办同源推导）
domain/reminder-presenter.uts         （MISSED 先于日期分组）
theme/tokens/colors.uts               （statusColorsDark.initial 对比度）
pages.json                            （purchase/edit 加 swipeBackAsBackPress）
```
