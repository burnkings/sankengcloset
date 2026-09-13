#!/usr/bin/env node
/**
 * `npm run check` — 发布前聚合门禁
 *
 *   = 全部源码级检查（scripts/verify.js 的 5 项）
 *   + 编译后 require 检查（需要 mp-weixin 真实编译产物）
 *
 * 日常迭代**不要**用这个：请用 `npm run verify`（秒级、不需要编译产物），
 * 或 `npm run verify:watch`（保存即自动校验）。本命令只在发布前跑一次。
 *
 * 编译产物缺失即失败——本脚本不会替编译“背书”，只验证真实产物。
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// 1) 全部源码级检查（自动包含 tests/*.test.cjs 里新增的用例）
const verify = spawnSync(process.execPath, ['scripts/verify.js'], { stdio: 'inherit' })
if (verify.status !== 0) {
  console.error('\n[FAIL] 源码级检查未通过——先把上面的问题修完，再跑编译产物校验')
  process.exit(1)
}

// 2) 编译后 require 检查：mp-weixin 产物必须存在
const mpDist = path.resolve('unpackage/dist/dev/mp-weixin')
if (!fs.existsSync(path.join(mpDist, 'app.js'))) {
  console.error('[FAIL] mp-weixin 编译产物缺失（unpackage/dist/dev/mp-weixin/app.js 不存在）')
  console.error('      请先执行 mp-weixin 编译（HBuilderX 或 npm run build:mp-weixin），再运行 npm run check')
  process.exit(1)
}
const compiled = spawnSync(process.execPath, ['scripts/check-uts-compile.js', mpDist], { stdio: 'inherit' })
if (compiled.status !== 0) {
  console.error('\n[FAIL] 编译后 require 检查未通过')
  process.exit(1)
}

console.log('\n[PASS] 全部 check 通过（源码级 5 项 + 编译产物 1 项）')
