#!/usr/bin/env node
/**
 * check-horizontal-scrollbar.js — 横向滚动条门禁
 *
 * 背景：Android 上 direction="horizontal" 的 <scroll-view> 默认会绘制底部滚动条指示线，
 *      挂载瞬间闪现、布局稳定后淡出，视觉上像一根"多出来的横线"（用户已反馈过两次）。
 *      项目约定：所有横向滚动容器必须显式隐藏滚动条，或干脆不用滚动容器（内容放得下时优先不用）。
 *
 * 规则：
 *   1. <scroll-view ... direction="horizontal" ...> 必须带 show-scrollbar="false"
 *   2. 顺带检查写法有效性：必须是 :show-scrollbar="false"（布尔绑定），
 *      写成 show-scrollbar="false"（字符串）在 uvue 下会被当成非空字符串 → 恒为 true，等于没隐藏。
 *
 * 用法：node scripts/check-horizontal-scrollbar.js
 * exit 0 = 通过；1 = 存在违规。
 */
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const SKIP_DIRS = new Set(['node_modules', 'unpackage', '.git', 'dist', '.workbuddy'])

let failed = false
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed = true }

function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (entry.name.endsWith('.uvue')) out.push(p)
  }
  return out
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

let checked = 0
for (const dir of ['pages', 'components']) {
  for (const file of walk(path.join(ROOT, dir))) {
    const src = fs.readFileSync(file, 'utf8')
    // 逐个 <scroll-view ...> 开标签配对，避免跨标签误判
    const tagRe = /<scroll-view\b[\s\S]*?>/g
    for (const m of src.matchAll(tagRe)) {
      const tag = m[0]
      if (!/direction\s*=\s*"horizontal"/.test(tag)) continue
      checked += 1
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      const line = lineOf(src, m.index)
      if (!/:show-scrollbar\s*=\s*"false"/.test(tag)) {
        if (/show-scrollbar\s*=\s*"false"/.test(tag)) {
          fail(`${rel}:${line} 横向 scroll-view 写成了 show-scrollbar="false"（缺冒号，会被当成字符串 true），应为 :show-scrollbar="false"`)
        } else {
          fail(`${rel}:${line} 横向 scroll-view 未隐藏滚动条，需加 :show-scrollbar="false"（若内容固定放得下，优先改用普通 flex 行，不要滚动容器）`)
        }
      }
    }
  }
}

if (failed) process.exit(1)
console.log(`[PASS] horizontal scrollbar gate — ${checked} 个横向滚动容器均已隐藏滚动条`)
