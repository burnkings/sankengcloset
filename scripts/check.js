#!/usr/bin/env node
/**
 * `npm run check` — 发布前聚合门禁
 * 依次执行：
 *   1. 运行时契约（微信登录 / 401 单飞刷新 / opaque cursor / 统一写策略）—— check-v24-remote-runtime.js
 *   2. Android 静态检查（cleartext 隔离 / 生产 HTTPS）—— check-v25-android-beta.js
 *   3. 编译后 require 检查（产物必须真实存在，不伪造编译成功）—— check-uts-compile.js
 *
 * 任何一项失败即整体失败（exit 1）。编译产物缺失也会失败——
 * 本脚本不会替编译“背书”，只验证真实产物。
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const steps = [
  { name: 'runtime contract', script: 'scripts/check-v24-remote-runtime.js' },
  { name: 'android static', script: 'scripts/check-v25-android-beta.js' },
]

let failed = false

// 1) 运行时契约 + Android 静态检查（纯源码检查，无需编译产物）
for (const step of steps) {
  const result = spawnSync(process.execPath, [step.script], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`[FAIL] ${step.name}`)
    failed = true
  } else {
    console.log(`[PASS] ${step.name}`)
  }
}

// 2) 编译后 require 检查：mp-weixin 产物必须存在
const mpDist = path.resolve('unpackage/dist/dev/mp-weixin')
if (!fs.existsSync(path.join(mpDist, 'app.js'))) {
  console.error('[FAIL] mp-weixin 编译产物缺失（unpackage/dist/dev/mp-weixin/app.js 不存在）—— 请先执行 HBuilderX mp-weixin 编译，再运行 check')
  failed = true
} else {
  const result = spawnSync(process.execPath, ['scripts/check-uts-compile.js', mpDist], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('[FAIL] compiled require checks')
    failed = true
  } else {
    console.log('[PASS] compiled require checks')
  }
}

if (failed) {
  console.error('\n[FAIL] check 门禁未通过')
  process.exit(1)
}
console.log('\n[PASS] 全部 check 通过')
