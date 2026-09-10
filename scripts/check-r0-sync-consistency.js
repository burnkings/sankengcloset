#!/usr/bin/env node
/**
 * check-r0-sync-consistency.js — R0「同步与提醒一致性修复」可执行契约
 *
 * 以源码(及编译产物)为唯一事实，逐条验证以下行为契约（先于实现编写，实现后必须转绿）：
 *
 * C1 恢复联网可冲刷：flushLocalOperations 不得被 mockOnline 阻断；remote 模式
 *    仅以「已登录(token)」为前提，网络不可达(getNetworkType=='none')时安静返回 0 保留队列。
 * C2 离线创建不丢：4 个资产 store 的 create/update/delete 走 write-back「远端优先、
 *    失败入队」；入队 payload 必须携带稳定客户端 id（重放 POST 由后端同 id 409 幂等收敛）。
 * C3 重复 flush 不产生重复实体：create/upsert 重放遇 409(同 id 已存在) 按成功处理并移除；
 *    wishlist 类由后端 user+productId 唯一约束收敛（前端不伪造成功）。
 * C4 401 刷新：重放走 Authorized 请求（内部单飞刷新重试一次）；刷新仍失败(401)时中止
 *    整次冲刷且不消耗队列、不标记失败——队列原样保留待重新登录。
 * C5 5xx/网络瞬时失败：保留队列重试（不立即存档、不消耗 max_retry）。
 * C6 不可重试 4xx：立即存档降级（reason 带 http_<status>），不无限重试。
 * C7 删除幂等：delete 重放遇 404（目标已不存在）按成功处理。
 * C8 提醒清空语义：ReminderUpdateData 用 null 表示「未提供」、'' 表示「显式清空」，
 *    本地 repo 与 store 合并必须支持清空 note/remindDate/remindTime/productId/
 *    relatedReleaseId/wardrobeBindings（不能只在非空时覆盖）。
 * C9 孤儿提醒禁止：purchase-store 删除订单时级联处理其自动 Reminder（BALANCE/ARRIVAL）；
 *    取消订单走既有 syncPurchaseReminders 结束提醒。
 *
 * 用法：
 *   node scripts/check-r0-sync-consistency.js            # 源码契约（C1–C9 全量）
 *   node scripts/check-r0-sync-consistency.js unpackage/dist/dev/mp-weixin   # 编译产物契约
 * 说明：C1–C9 的断言面向 .uts 源码形态（类型注解/单引号/注释）；编译产物经 UTS→JS 转换后
 * 类型剥除、引号双写，故产物模式仅断言「编译形态可验证」的项（逻辑字符串/结构/函数符号存活），
 * 源码纹理断言不套用产物——两模式各自只对真实形态断言，不为凑绿放宽。
 * exit 0 = 全部通过；1 = 存在违约（输出违约明细）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const DIST = process.argv[2]

function read(rel) {
  const p = DIST ? path.join(DIST, rel) : path.join(ROOT, rel)
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}
const srcToDist = (rel) => rel.replace(/\.uts$/, '.js')

let failed = false
const fails = []
function check(name, cond, detail) {
  if (cond) console.log(`  [PASS] ${name}`)
  else { console.error(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed = true; fails.push(name) }
}
function section(title) { console.log(`\n== ${title} ==`) }

const srcFiles = {
  queue: 'services/sync/local-sync-queue.uts',
  writeback: 'services/sync/write-back.uts',
  apiclient: 'services/platform/api-client.uts',
  reminderStore: 'stores/reminder-store.uts',
  reminderRepo: 'domain/repositories/reminder-repo.uts',
  reminderDomain: 'domain/reminder.uts',
  purchaseStore: 'stores/purchase-store.uts',
}
const rel = (key) => (DIST ? srcToDist(srcFiles[key]) : srcFiles[key])
// 文件缺失视为违约（产物必须真实存在，不替编译背书）
function mustRead(key) {
  const p = rel(key)
  const abs = DIST ? path.join(DIST, p) : path.join(ROOT, p)
  if (!fs.existsSync(abs)) { check(`${p} 存在`, false, '文件缺失'); return '' }
  return fs.readFileSync(abs, 'utf8')
}

// 剔除行/块注释（源码模式用于查 mockOnline 是否仍出现在「代码」而非注释说明）
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// ============================================================
// 源码模式：C1–C9 全量契约（.uts 形态）
// ============================================================
if (!DIST) {
  section('C1 恢复联网可冲刷（remote flush 不被 mockOnline 阻断）·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('flushLocalOperations 不再引用 mockOnline（代码中）', !codeOnly(q).includes('mockOnline'), 'local-sync-queue 中仍残留 mockOnline 门禁')
      check('flush 前检查 token（未登录保留队列）', q.includes(`getAccessToken() === ''`), '缺少 token 守卫')
      check('网络不可达时安静返回 0', q.includes("networkType != 'none'") || q.includes("res.networkType != 'none'"), '缺少 getNetworkType 离线门禁')
      check('仍调用真实重放 flushRemote', q.includes('flushRemote'), 'remote 重放入口缺失')
      check('mock 模式伪成功分支已删除', !q.includes('config.mockLatencyMs'), 'mock 延迟 flush 分支残留')
    }
  }

  section('C2/C3 离线创建入队 & 稳定客户端 id + 重复 flush 幂等·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('create/upsert 重放体直接透传队列 payload（含稳定 id）', q.includes('JSON.parse(payload)') && q.includes('apiPostAuthorized(path, body)'), '重放 create 未透传 payload')
      check('409 冲突按幂等成功处理', q.includes('status == 409') && q.includes("'create'"), '缺少 409(同 id 已存在)=成功 分支')
    }
    const rs = mustRead('reminderStore')
    if (rs) {
      check('reminder-store 不再直接入队（统一走 write-back）', !rs.includes('enqueueLocalOperation'), '仍残留 enqueueLocalOperation')
      check('reminder-store 写路径全部经 syncWriteBack', (rs.match(/syncWriteBack\(/g) || []).length >= 5, 'create/update/delete/markDone/markUndone 未全覆盖')
    }
  }

  section('C4 401 刷新失败 → 中止冲刷、队列原样保留·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('错误分类器引用 apiErrorStatus', q.includes('apiErrorStatus'), '缺少 api-client 错误状态提取')
      check('重放 401 抛出（刷新已由 Authorized 内部完成）', q.includes('status == 401') && q.includes('throw'), '缺少 401 中止分支')
      check('中止时保留未处理操作并持久化队列', q.includes('writeIds([...remaining, ...readIds().filter((id) => ids.indexOf(id) < 0)])') && q.includes('throw e'), '401 中止未保证队列一致')
    }
    const ac = mustRead('apiclient')
    if (ac) {
      check('api-client 导出 apiErrorStatus', ac.includes('export function apiErrorStatus'), '缺少 apiErrorStatus 导出')
      check('Authorized 请求内部 401 单飞刷新', ac.includes('refreshWithSingleFlight'), '401 刷新能力缺失')
    }
    const wb = mustRead('writeback')
    if (wb) {
      check('write-back 为 async 远端优先', wb.includes('async function syncWriteBack') && wb.includes('await remoteCall()'), 'write-back 未 async 化')
      check("远端成功不入队（'' 返回）", wb.includes("return ''") && wb.includes('enqueueLocalOperation'), '远端成功后仍会入队（双路径重复风险）')
    }
  }

  section('C5 瞬时失败(5xx/网络)保留重试·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('5xx/429 归为瞬时失败', q.includes('status >= 500') && q.includes('429'), '缺少 5xx/429 分类')
      check('瞬时失败不消耗重试计数（flush 路径无 retryCount += 1）', !q.includes('op.retryCount += 1'), 'flush 仍自增 retryCount，离线多次启动会误淘汰')
      check('保留队列并标记 SYNC_FAILED', q.includes('SYNC_FAILED'), '失败标记缺失')
    }
  }

  section('C6 不可重试 4xx 立即存档·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('4xx 存档降级（reason 携带 http_ 状态）', q.includes("'http_'"), '缺少 4xx 存档 reason')
      check('分类器返回 2（已存档不计成功）', q.includes('return 2'), '缺少存档返回码')
    }
  }

  section('C7 删除幂等（404=已不存在视为成功）·源码')
  {
    const q = mustRead('queue')
    if (q) {
      check('delete 遇 404 按成功处理', q.includes('status == 404') && q.includes("'delete'"), '缺少 delete 404 幂等分支')
    }
  }

  section("C8 提醒字段显式清空语义（null=未提供，''=清空）·源码")
  {
    const d = mustRead('reminderDomain')
    if (d) {
      check('ReminderUpdateData 字段可空（string | null）', (d.match(/string \| null/g) || []).length >= 8, '可清空字段未全部可空')
      check('isAllDay 可空（不再无条件覆盖）', d.includes('boolean | null'), 'isAllDay 未可空')
      check('wardrobeBindings 可空（支持清空为 []）', d.includes('string[] | null'), 'wardrobeBindings 未可空')
    }
    const r = mustRead('reminderRepo')
    if (r) {
      check("repo.update 空值合并改为 != null（'' 即清空）", !r.includes("data.note != ''") && r.includes('data.note != null'), 'repo 仍只在非空时覆盖')
      check('wardrobeBindings 空数组可清空', r.includes('data.wardrobeBindings != null'), 'wardrobeBindings 仍按 length>0 覆盖')
    }
    const rs = mustRead('reminderStore')
    if (rs) {
      check('store.updateItem 以 repo 为唯一合并源', rs.includes('_state.items = repo.getAll()'), 'store 仍手工双份合并')
    }
  }

  section('C9 删除/取消订单联动自动 Reminder（禁孤儿）·源码')
  {
    const rs = mustRead('reminderStore')
    if (rs) {
      check('reminder-store 提供按订单级联清理', rs.includes('removePurchaseLinkedReminders'), '缺少级联清理函数')
    }
    const ps = mustRead('purchaseStore')
    if (ps) {
      check('purchase-store 删除订单调用级联清理', ps.includes('removePurchaseLinkedReminders'), 'deletePurchase 未级联提醒')
      check('取消订单仍走 syncPurchaseReminders', ps.includes('syncPurchaseReminders'), '取消联动缺失')
    }
  }
} else {
  // ==========================================================
  // 编译产物模式：断言「编译形态可验证」的项（UTS→JS 后类型剥除/引号双写）
  // ==========================================================
  section('产物级：重放分类与幂等分支真实进入编译结果')
  {
    const q = mustRead('queue')
    if (q) {
      check('产物含 409/404/401 幂等分类分支', q.includes('status == 409') && q.includes('status == 404') && q.includes('status == 401'), '编译产物缺失幂等分类分支')
      check('产物含 5xx 瞬时分类与 http_ 存档 reason', q.includes('>= 500') && q.includes('http_'), '编译产物缺失 5xx/http_ 分支')
      check('产物 flush 不含 mockOnline 门禁', !codeOnly(q).includes('mockOnline'), '编译产物仍带 mockOnline 门禁')
      check('产物 flush 无 retryCount 自增（瞬时失败不消耗计数）', !/[+][+]\s*retryCount|retryCount\s*[+][+]|retryCount\s*\+=\s*1/.test(q), '编译产物仍自增 retryCount')
      check('产物仍做 token 守卫（未登录保留队列）', q.includes('getAccessToken() === ""'), '编译产物缺少 token 守卫')
      check('产物仍做网络可达性门禁', q.includes('networkType != "none"'), '编译产物缺少网络门禁')
      check('产物保留 SYNC_FAILED 失败标记', q.includes('SYNC_FAILED'), '失败标记缺失')
    }
  }
  section('产物级：store 写路径/级联清理/清空语义进入编译结果')
  {
    const rs = mustRead('reminderStore')
    if (rs) {
      check('产物 reminder-store 无 enqueueLocalOperation 直入队', !rs.includes('enqueueLocalOperation'), '仍残留直接入队')
      check('产物 reminder-store 写路径经 syncWriteBack', (rs.match(/syncWriteBack\(/g) || []).length >= 5, '写路径未全覆盖')
      check('产物 reminder-store 含级联清理函数', rs.includes('removePurchaseLinkedReminders'), '级联清理缺失')
      check('产物 reminder-store 远端快照落 repo 缓存', rs.includes('reminderRepo.getAll()') && rs.includes('readPendingOperations'), '快照/待重放合并缺失')
    }
    const ps = mustRead('purchaseStore')
    if (ps) {
      check('产物 purchase-store 删除级联清理', ps.includes('removePurchaseLinkedReminders'), 'deletePurchase 级联缺失')
    }
    const rp = mustRead('reminderRepo')
    if (rp) {
      check('产物 repo.update 空值合并（!= null 逐字段）', (rp.match(/data\.\w+ != null/g) || []).length >= 8, '清空语义未进产物')
    }
    const rd = mustRead('reminderDomain')
    if (rd) {
      check('产物 ReminderUpdateData 默认 null（未提供语义）', rd.includes('this.remindDate = null') && rd.includes('this.wardrobeBindings = null'), 'null 默认值未进产物')
    }
    const ac = mustRead('apiclient')
    if (ac) {
      check('产物 api-client 含 apiErrorStatus', ac.includes('function apiErrorStatus'), 'apiErrorStatus 未进产物')
    }
    const wb = mustRead('writeback')
    if (wb) {
      check('产物 write-back 为 async 远端优先（yield remoteCall）', wb.includes('yield remoteCall()') && wb.includes('enqueueLocalOperation'), 'write-back 语义未进产物')
    }
  }
}

if (failed) {
  console.error(`\n[FAIL] R0 同步与提醒一致性契约 ${fails.length} 项违约：${fails.join(' / ')}`)
  process.exit(1)
}
console.log(`\n[PASS] R0 同步与提醒一致性契约全部通过${DIST ? '（编译产物）' : '（源码）'}`)
