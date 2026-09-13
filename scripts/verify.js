#!/usr/bin/env node
/**
 * `npm run verify`        — 一次跑完全部「源码级」检查（不需要编译产物）
 * `npm run verify:watch`  — 同上，但监听源码变化自动重跑（保存即校验，不用手动敲命令）
 *
 * 设计目标：把「改一个小问题 → 手敲 5 条命令」压成「改完保存 → 看一行结果」。
 *
 * 包含的检查（全部纯源码，秒级）：
 *   1. gates    源码门禁     scripts/check-source-gates.js
 *                           （v2 引用禁令 / 主题响应式 / 路由与图标 / uvue 绑定规则 5 条 / 提示宿主）
 *   2. runtime  运行时契约   scripts/check-v24-remote-runtime.js
 *   3. sync     同步一致性   scripts/check-r0-sync-consistency.js
 *   4. hscroll  横向滚动条   scripts/check-horizontal-scrollbar.js
 *                           （横向 scroll-view 必须 :show-scrollbar="false"，且不能漏冒号）
 *   5. android  Android 静态 scripts/check-v25-android-beta.js
 *   6. tests    单元测试     tests/*.test.cjs（自动发现，新增测试文件无需改本脚本）
 *
 * 不包含：scripts/check-uts-compile.js（需要 mp-weixin 编译产物）。发布前请跑 `npm run check`。
 *
 * 可选参数：
 *   --watch, -w     监听模式，保存即重跑
 *   --only=<关键词> 只跑匹配的检查（如 --only=gates / --only=单元测试）
 *   --quiet, -q     只在失败时输出详情（默认已是此行为，保留兼容）
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = process.cwd()
const argv = process.argv.slice(2)
const WATCH = argv.includes('--watch') || argv.includes('-w')
const onlyArg = argv.find((a) => a.startsWith('--only'))
const ONLY = onlyArg == null ? '' : (onlyArg.includes('=') ? onlyArg.split('=').slice(1).join('=') : '')

/** 自动发现测试文件，避免新增用例后要回来改脚本 */
function testFiles() {
  const dir = path.join(ROOT, 'tests')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.cjs'))
    .sort()
    .map((f) => path.join('tests', f))
}

function buildSteps() {
  const steps = [
    { key: 'gates', label: '源码门禁', args: ['scripts/check-source-gates.js'] },
    { key: 'runtime', label: '运行时契约', args: ['scripts/check-v24-remote-runtime.js'] },
    { key: 'sync', label: '同步一致性', args: ['scripts/check-r0-sync-consistency.js'] },
    { key: 'hscroll', label: '横向滚动条', args: ['scripts/check-horizontal-scrollbar.js'] },
    { key: 'android', label: 'Android 静态', args: ['scripts/check-v25-android-beta.js'] },
  ]
  const files = testFiles()
  if (files.length > 0) {
    steps.push({ key: 'tests', label: `单元测试(${files.length} 文件)`, args: ['--test', ...files], useNodeTest: true })
  }
  return steps
}

function runStep(step) {
  const startedAt = Date.now()
  const res = spawnSync(process.execPath, step.args, { cwd: ROOT, encoding: 'utf8' })
  const ms = Date.now() - startedAt
  const output = `${res.stdout == null ? '' : res.stdout}${res.stderr == null ? '' : res.stderr}`
  return { ok: res.status === 0, ms, output }
}

function pad(text, width) {
  // 中文按 2 个字符宽度估算，避免列对不齐
  let len = 0
  for (const ch of text) len += ch.charCodeAt(0) > 255 ? 2 : 1
  return text + ' '.repeat(Math.max(0, width - len))
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

/** 失败输出里最值得看的是 [FAIL]/error 行，其余详情折叠为计数 */
function summarizeFailure(output) {
  const lines = output.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  const key = lines.filter((l) => /\[FAIL\]|FAIL|error|Error|✗|not ok/.test(l))
  const shown = key.length > 0 ? key.slice(0, 8) : lines.slice(-8)
  return shown.map((l) => `        ${l}`).join('\n')
}

function verifyOnce(isWatchRun) {
  const steps = buildSteps().filter((s) => ONLY === '' || s.label.includes(ONLY) || s.key.includes(ONLY))
  if (steps.length === 0) {
    console.error(`[verify] --only=${ONLY} 没有匹配到任何检查`)
    return false
  }

  const startedAt = Date.now()
  const stamp = isWatchRun ? `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ` : ''
  console.log(`${stamp}[verify] ${steps.length} 项源码级检查（不需要编译产物）`)

  const failures = []
  for (const step of steps) {
    const r = runStep(step)
    if (r.ok) {
      console.log(`  PASS  ${pad(step.label, 22)}${fmtMs(r.ms)}`)
    } else {
      console.log(`  FAIL  ${pad(step.label, 22)}${fmtMs(r.ms)}`)
      console.log(summarizeFailure(r.output))
      failures.push(step)
    }
  }

  const total = fmtMs(Date.now() - startedAt)
  if (failures.length === 0) {
    console.log(`  全部通过（${steps.length}/${steps.length}，用时 ${total}）`)
    return true
  }
  console.log(`  ${failures.length} 项失败（用时 ${total}）：${failures.map((f) => f.label).join('、')}`)
  console.log(`  单独重跑：npm run verify -- --only=${failures[0].key}`)
  return false
}

if (!WATCH) {
  process.exit(verifyOnce(false) ? 0 : 1)
}

// ====== 监听模式 ======
const WATCH_DIRS = ['pages', 'components', 'theme', 'utils', 'stores', 'services', 'domain', 'presentation', 'config', 'scripts', 'tests']
const WATCH_FILES = ['pages.json', 'manifest.json']
const IGNORE = /(node_modules|unpackage|\.git|\.workbuddy)/
const DEBOUNCE_MS = 300

console.log('[verify] 监听模式启动：保存文件即自动校验（Ctrl+C 退出）')
verifyOnce(true)

let timer = null
let pending = new Set()
function schedule(file) {
  if (file != null && IGNORE.test(file)) return
  if (file != null) pending.add(path.basename(file))
  if (timer != null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const changed = Array.from(pending).slice(0, 3).join('、')
    pending = new Set()
    if (changed !== '') console.log(`\n[verify] 检测到改动：${changed}`)
    verifyOnce(true)
    console.log('[verify] 继续监听中…')
  }, DEBOUNCE_MS)
}

let watched = 0
for (const dir of WATCH_DIRS) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) continue
  try {
    fs.watch(abs, { recursive: true }, (_evt, file) => schedule(file))
    watched++
  } catch (e) {
    console.warn(`[verify] 无法监听 ${dir}：${e.message}`)
  }
}
for (const f of WATCH_FILES) {
  const abs = path.join(ROOT, f)
  if (!fs.existsSync(abs)) continue
  fs.watch(abs, () => schedule(f))
  watched++
}

if (watched === 0) {
  console.error('[verify] 没有任何目录进入监听，退出')
  process.exit(1)
}
console.log(`[verify] 已监听 ${watched} 个位置，改完保存即可看到结果\n`)
