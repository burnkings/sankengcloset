/**
 * clean-clone-contract —— 干净 clone 必须能跑通 `npm test`
 *
 * 2026-10-09 全项目评审 P2-3：在 `--depth 1` 的干净 clone 里跑 `npm test`，报 ENOENT ——
 * `tests/image-url-normalize.test.cjs` 要读 `scripts/taobao-backfill/_build_full.py`，
 * 而 `.gitignore` 把整个 `scripts/taobao-backfill/` 目录忽略了 ⇒ 该文件根本没进仓库。
 * 这正是「本地全绿、别人一 clone 就红」的经典形态，靠肉眼看 .gitignore 很难发现。
 *
 * 本测试把两条规则钉死（都是语义级，不绑具体行号）：
 *   1. 门禁真正读取的采集脚本，必须能被 `git check-ignore` 判定为「不忽略」
 *   2. 纯粹的本地采集垃圾（其它下划线脚本、Chrome 登录态目录）必须仍被忽略
 *      —— 否则哪天为了修 1 而把整目录放开，2.5 GB 垃圾会跟着进仓库
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')

function isIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' })
    return true // exit 0 = 被忽略
  } catch (e) {
    return false // exit 1 = 未被忽略
  }
}

/** 扫描 tests/ 里对项目文件的 fs.readFileSync 引用（相对仓库根） */
function collectedTestReferences() {
  const dir = path.join(ROOT, 'tests')
  const refs = new Set()
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.test.cjs')) continue
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    // 形如 path.join(ROOT, 'scripts', 'taobao-backfill', '_build_full.py')
    const re = /path\.join\(ROOT,\s*((?:'[^']+'\s*,\s*)*'[^']+')\)/g
    let m
    while ((m = re.exec(src)) != null) {
      const parts = m[1].match(/'([^']+)'/g)
      if (parts == null) continue
      const rel = parts.map((p) => p.slice(1, -1)).join('/')
      refs.add(rel)
    }
  }
  return [...refs]
}

test('git 可用（本门禁依赖 git check-ignore）', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.gitignore')), '仓库根应有 .gitignore')
})

test('门禁引用的文件不能落在忽略规则里（否则干净 clone 必 ENOENT）', () => {
  const refs = collectedTestReferences()
  assert.ok(refs.length > 0, '未从 tests/ 收集到任何文件引用 —— 正则失效了，门禁本身要修')
  const ignored = refs.filter((r) => isIgnored(r))
  assert.deepStrictEqual(
    ignored,
    [],
    `以下被门禁读取的文件仍被 .gitignore 忽略，干净 clone 会失败：\n  ${ignored.join('\n  ')}`
  )
})

test('被门禁引用的采集脚本确实存在于磁盘（路径没写错）', () => {
  for (const rel of collectedTestReferences()) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `tests/ 引用了不存在的文件: ${rel}`)
  }
})

test('纯本地采集垃圾必须仍被忽略（修 P2-3 不能顺手放开整个目录）', () => {
  const mustStayIgnored = [
    'scripts/_chromeprof/profile/Cache/index',
    'scripts/gui-automation/tmp.txt',
    'scripts/taobao-backfill/_acc_detail.py',
    'scripts/taobao-backfill/__pycache__/x.pyc',
    '.workbuddy/memory/MEMORY.md',
  ]
  for (const rel of mustStayIgnored) {
    assert.ok(isIgnored(rel), `${rel} 不该进仓库（体积/隐私），但当前规则允许它被提交`)
  }
})

test('构建链脚本必须仍可提交（门禁不能误伤 build 工具）', () => {
  const mustStayTracked = [
    'scripts/patch-vendor.py',
    'scripts/strip-mp-deadweight.py',
    'scripts/build-mp-weixin.ps1',
  ]
  for (const rel of mustStayTracked) {
    assert.ok(!isIgnored(rel), `${rel} 是构建链的一部分，不能被忽略`)
  }
})
