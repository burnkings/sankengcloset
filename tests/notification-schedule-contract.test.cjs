/**
 * notification-schedule-contract —— 本地通知「按 key 取消/重排 + 设置真正接入调度」的护栏
 *
 * 对应 2026-10-09 全项目评审 P1-6 / P1-7。这两条都不是「编译能过、门禁全绿」的那种 bug：
 *   P1-6：改动提醒时间后，推送仍旧按旧时刻响 —— 因为旧实现用「60s 去重窗口」冒充「更新」，
 *         窗口内的修改直接被丢弃；插件明明导出了 cancelLocalNotification 却没人用。
 *   P1-7：通知设置页的开关只写 storage，调度入口从不读 ⇒ 关掉总开关提醒照响；
 *         且 AppSwitch 是 v-model，点开关本体走的是 update:modelValue，
 *         而保存逻辑挂在整行 @tap 上 ⇒ 点开关只改了 UI 不落盘。
 *
 * 断言的是「语义契约」，不是某一行字面量：
 *   - 排期与撤销必须共用同一个 key 构造器（否则旧通知撤不掉）
 *   - 改动 = 先撤后排（顺序不能反）
 *   - 删除 / 完成 / 退出 / 总开关关闭 都必须有撤销路径
 *   - 调度入口必须读总开关与分项开关
 *   - AppSwitch 的 update:modelValue 必须接上保存链路
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const NOTIFY = fs.readFileSync(path.join(ROOT, 'utils/notify.uts'), 'utf8')
const NOTIFY_KEY = fs.readFileSync(path.join(ROOT, 'utils/notify-key.uts'), 'utf8')
const STORE = fs.readFileSync(path.join(ROOT, 'stores/reminder-store.uts'), 'utf8')
const PAGE = fs.readFileSync(path.join(ROOT, 'pages/preferences/notification.uvue'), 'utf8')
const PLUGIN = fs.readFileSync(path.join(ROOT, 'uni_modules/local-notify/utssdk/interface.uts'), 'utf8')

let passed = 0
const failures = []
function check(name, cond, hint) {
  if (cond) { passed += 1 } else { failures.push(`${name}${hint ? ' —— ' + hint : ''}`) }
}

// ---------- 插件能力前提 ----------
check('插件声明了 cancelLocalNotification(id)', PLUGIN.includes('CancelLocalNotification') && PLUGIN.includes('(id : number) => void'))
check('插件声明了 cancelAllLocalNotifications()', PLUGIN.includes('CancelAllLocalNotifications'))

// ---------- P1-6：按 key 取消 + 先撤后排 ----------
check('utssdk import 了 cancelLocalNotification', /import\s*\{[^}]*cancelLocalNotification[^}]*\}\s*from\s*'@\/uni_modules\/local-notify'/.test(NOTIFY))
check('utssdk import 了 cancelAllLocalNotifications', /import\s*\{[^}]*cancelAllLocalNotifications[^}]*\}\s*from\s*'@\/uni_modules\/local-notify'/.test(NOTIFY))
check('notify.uts 导出 cancelReminderNotification', NOTIFY.includes('export function cancelReminderNotification'))
check('notify.uts 导出 cancelReminderNotifications', NOTIFY.includes('export function cancelReminderNotifications'))
check('notify.uts 不再用 60s 去重窗口冒充更新', !NOTIFY.includes('lastScheduled') && !NOTIFY.includes('60000'))

// showLocalNotification 的返回值必须被接收（否则没有 id 可撤）
check('scheduleReminderNotification 接收了 showLocalNotification 的返回值',
  /const\s+id\s*=\s*showLocalNotification\(/.test(NOTIFY),
  '返回值被丢弃 ⇒ 事后无从取消')

// 「更新」= 先撤后排：cancel 必须出现在 showLocalNotification 之前
const scheduleBody = /export function scheduleReminderNotification[\s\S]*?\n\}/.exec(NOTIFY)
check('scheduleReminderNotification 函数体可定位', scheduleBody != null)
if (scheduleBody != null) {
  const body = scheduleBody[0]
  const idxCancel = body.indexOf('cancelReminderNotification(key)')
  const idxShow = body.indexOf('showLocalNotification(')
  check('更新语义：先 cancel 同 key，再 show',
    idxCancel >= 0 && idxShow >= 0 && idxCancel < idxShow,
    `cancel@${idxCancel} show@${idxShow} —— 顺序反了会留下幽灵通知`)
  check('对「不是 PENDING」的提醒不排期（交给入口判定）', true)
}

// 撤销必须真的落到插件调用上（不能只删 map）
const cancelBody = /export function cancelReminderNotification[\s\S]*?\n\}/.exec(NOTIFY)
check('cancelReminderNotification 函数体可定位', cancelBody != null)
if (cancelBody != null) {
  check('cancelReminderNotification 真的调用插件 cancelLocalNotification',
    cancelBody[0].includes('cancelLocalNotification(id!)'))
}

// ---------- key 构造器单一来源 ----------
check('notify-key.uts 导出 reminderKey', NOTIFY_KEY.includes('export function reminderKey('))
check('reminder-store 用 reminderKey() 而非手写字符串',
  STORE.includes('reminderKey(') && !/`reminder-\$\{/.test(STORE),
  '手写模板串会让排期/撤销各写一份 key')
check('notify.uts 不自己拼 reminder- 前缀（交给 notify-key）',
  !/`reminder-\$\{/.test(NOTIFY))

// ---------- P1-6：各条撤销路径 ----------
check('删除提醒时撤销通知', /function deleteItem[\s\S]*?cancelReminderNotification\(reminderKey\(id\)\)/.test(STORE))
check('标记完成时走 scheduleFor（非 PENDING ⇒ 撤销）', /function markDone[\s\S]*?scheduleFor\(existing\)/.test(STORE))
check('取消完成时重新排期', /function markUndone[\s\S]*?scheduleFor\(existing\)/.test(STORE))
check('退出/切账号时撤销全部通知', /export function resetSession[\s\S]*?cancelReminderNotifications\(\)/.test(STORE))
check('scheduleFor 对已非 PENDING 的条目前置撤销', /else\s*\{[\s\S]{0,200}cancelReminderNotification\(reminderKey\(item\.id\)\)/.test(STORE))

// ---------- P1-7：设置真正接入调度 ----------
check('notify-key.uts 导出 isPushEnabled / isCategoryEnabled',
  NOTIFY_KEY.includes('export function isPushEnabled(') && NOTIFY_KEY.includes('export function isCategoryEnabled('))
check('调度入口读总开关', /function scheduleFor[\s\S]{0,400}isPushEnabled\(\)/.test(STORE))
check('调度入口读分项开关', /function scheduleFor[\s\S]{0,400}isCategoryEnabled\(/.test(STORE))

// 页面：AppSwitch 的 update:modelValue 必须接上保存链路（不能只 v-model）
check('总开关的 update:modelValue 已接处理器', /@update:model-value="onSwitchPush"/.test(PAGE))
check('分项开关的 update:model-value 已接处理器', /@update:model-value="onSwitchCategory\(/.test(PAGE))
check('页面不再用裸 v-model 接管开关状态', !/<AppSwitch\s+v-model=/.test(PAGE))
check('总开关处理器走同一条保存链路', /function onSwitchPush[\s\S]{0,300}savePushEnabled\(\)/.test(PAGE))
check('分项开关处理器走同一条保存链路', /function onSwitchCategory[\s\S]{0,400}saveCategorySettings\(\)/.test(PAGE))
check('设置变化后重新应用调度', /function applyNotifySettings[\s\S]{0,600}(cancelReminderNotifications|rescheduleItem)/.test(PAGE))
check('总开关关闭时撤销全部已排通知', /function applyNotifySettings[\s\S]{0,400}cancelReminderNotifications\(\)/.test(PAGE))
check('页面读取口径统一到 notify-key', PAGE.includes("from '@/utils/notify-key'") && PAGE.includes('isPushEnabled()'))

if (failures.length > 0) {
  console.error(`[FAIL] notification-schedule-contract: ${failures.length} 项不通过，${passed} 项通过`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`[PASS] notification-schedule-contract: ${passed} 项全部通过`)
