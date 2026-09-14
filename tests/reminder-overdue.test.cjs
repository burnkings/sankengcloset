/**
 * 提醒「逾期 / 分组」逻辑回归测试
 *
 * 覆盖 2026-09-13 定稿的规则（此前这几条改动全靠人肉核对，没有任何自动化保护）：
 * 1. **当天宽限**：今天到期的提醒，哪怕提醒时刻已经过了，仍留在「今天」组、状态仍是待提醒，次日才进「已过期」
 * 2. **状态优先于日期**：DONE 一律进「已完成」；MISSED 一律进「已过期」
 * 3. **分组渲染顺序**：已完成排最后，不与待办抢注意力
 *
 * 注意：domain 的 diffDays 用 new Date('YYYY-MM-DD')（按 UTC 解析）与本地零点比较，
 * 在 UTC+8 下等价于「按日期比较」（今天 +8h → floor(8/24)=0）。本测试按 UTC+8 编写，
 * 若将来出现负时区场景需同步调整。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const root = path.resolve(__dirname, '..')

// 最小 UTS 模块加载器：抹掉类型、解析 @/ 与相对路径 import
function load(file) {
  const abs = path.join(root, file.endsWith('.uts') ? file : file + '.uts')
  let code = stripTypeScriptTypes(fs.readFileSync(abs, 'utf8'), { mode: 'transform' })
  const names = []
  code = code.replace(/export\s+type\s+[^\n]*\n/g, '')
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, n, p) => {
    const target = p.startsWith('@/') ? p.slice(2) : p
    return `const {${n}}=require(${JSON.stringify(path.relative(root, path.resolve(path.dirname(abs), target)))});`
  })
  code = code.replace(/export\s+(function|class|const)\s+(\w+)/g, (_, kind, n) => { names.push(n); return kind + ' ' + n })
  const out = {}
  vm.runInNewContext(`(function(require,exports){${code};Object.assign(exports,{${names}})})`,
    { console, Date, Math, parseInt, isNaN, JSON })((id) => load(id), out)
  return out
}

function isoDate(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function reminder(offsetDays, status) {
  return {
    id: 'r1', title: '测试提醒', type: 'RELEASE', status,
    remindDate: isoDate(offsetDays), remindTime: '00:01', isAllDay: false,
    note: '', relatedPurchaseId: '', relatedWishId: '', wardrobeBindings: [],
  }
}

const { toDisplayModel, toDisplayModels, groupByDate } = load('domain/reminder-presenter')

test('今天到期的提醒当天不过期（当天宽限，即使提醒时刻已过）', () => {
  const dm = toDisplayModel(reminder(0, 'PENDING'))
  assert.equal(dm.group, 'today')
  assert.equal(dm.groupLabel, '今天')
  assert.equal(dm.isToday, true)
  assert.equal(dm.isOverdue, false)
})

test('提醒日已过 → 落「已过期」', () => {
  assert.equal(toDisplayModel(reminder(-1, 'PENDING')).group, 'overdue')
  assert.equal(toDisplayModel(reminder(-10, 'PENDING')).group, 'overdue')
  assert.equal(toDisplayModel(reminder(-1, 'PENDING')).isOverdue, true)
})

test('状态优先于日期：MISSED 进已过期、DONE 进已完成', () => {
  assert.equal(toDisplayModel(reminder(-3, 'MISSED')).group, 'overdue')
  assert.equal(toDisplayModel(reminder(5, 'MISSED')).group, 'overdue', 'MISSED 即使日期在未来也应归到已过期')
  assert.equal(toDisplayModel(reminder(-3, 'DONE')).group, 'done', '已完成不得混入已过期')
  assert.equal(toDisplayModel(reminder(0, 'DONE')).group, 'done')
  assert.equal(toDisplayModel(reminder(-3, 'DONE')).isOverdue, false, '已完成不算逾期')
})

test('未来日期按 明天 / 本周 / 稍后 分档', () => {
  assert.equal(toDisplayModel(reminder(1, 'PENDING')).group, 'tomorrow')
  assert.equal(toDisplayModel(reminder(3, 'PENDING')).group, 'week')
  assert.equal(toDisplayModel(reminder(7, 'PENDING')).group, 'week')
  assert.equal(toDisplayModel(reminder(8, 'PENDING')).group, 'later')
  assert.equal(toDisplayModel(reminder(30, 'PENDING')).group, 'later')
})

test('分组渲染顺序：已完成排在最后', () => {
  const groups = groupByDate(toDisplayModels([
    reminder(-5, 'DONE'),
    reminder(0, 'PENDING'),
    reminder(-2, 'PENDING'),
    reminder(2, 'PENDING'),
  ]))
  // 注意：groups 是在 vm realm 里构造的数组，直接 .map() 得到的仍是 vm realm 的数组，
  // 与字面量做 deepStrictEqual 会因原型不同报 "same structure but not reference-equal"。
  // 这里用 for..of 在**本 realm** 重建一个普通数组再断言。
  const seq = []
  for (const g of groups) seq.push(g.group)
  assert.deepEqual(seq, ['today', 'week', 'overdue', 'done'])
  assert.equal(seq[seq.length - 1], 'done')
})
