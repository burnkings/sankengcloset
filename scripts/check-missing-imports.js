#!/usr/bin/env node
/**
 * check-missing-imports.js —— 扫「调用了项目导出的函数，却忘了 import」
 *
 * 为什么需要它（2026-10-06）：
 *   `pages/product/detail.uvue` 里加了 `wishCountOf(...)` 却没写 import。
 *   **HBuilderX 编译通过、check-uts-compile 通过、六个门禁全绿**，但真机上每次打开商品详情
 *   都在 `syncFavoriteCount()` 抛 `ReferenceError: wishCountOf is not defined` ——
 *   整个详情页挂掉，表现成「首页/三个排行榜点商品就报 wishCountOf is not defined」。
 *   这类「跨模块调用」的错误，静态类型检查看不见（uvue 的 script-setup 里未定义标识符
 *   不报错）、门禁也看不见，只有真机点开才发现。
 *
 * 判定逻辑（刻意偏保守，宁可漏报不要误报）：
 *   只有当被调用的标识符**确实由本项目某个模块 export**、而当前文件既没 import 也没本地声明时，
 *   才算 FAIL。框架/内置全局（computed、Math、uni、Map、JS 内建…）一律不在本项目 export 表里，
 *   所以天然不会误报。
 *
 * 2026-10-10 修：**扫描前先抹掉注释与字符串字面量的内容**。
 *   起因：`services/content/feed-service.uts` 的注释里写了「这里不能再写 clearWishDelta(item.entityId)」，
 *   旧版把注释当代码 ⇒ 误报 2 处 ⇒ 门禁 exit 1。注释/文案里出现 `foo()` 是正常写法，不该判失败。
 *   抹除规则：行注释与块注释全抹；单/双引号字符串抹；模板串抹但**保留插值内部**（那里的调用是真的）。
 *   定位信息不受影响（被抹的字符换成等长空格，行号/列号保持）。
 *
 * 用法：node scripts/check-missing-imports.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['components', 'config', 'domain', 'pages', 'presentation', 'services', 'stores', 'theme', 'types', 'utils']
const SKIP_DIRS = new Set(['node_modules', 'unpackage', '_archive-2026-09-26', '.git', 'scripts', 'tests', 'docs', 'static', 'nativeResources'])
const EXTS = ['.uts', '.uvue']

function walk(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (EXTS.includes(path.extname(e.name))) out.push(full)
  }
  return out
}

const files = []
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files)

/** 从 import 语句里收集「拿进来的名字」 */
function collectImported(src) {
  const names = new Set()
  const re = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g
  let m
  while ((m = re.exec(src)) != null) {
    const clause = m[1]
    // 具名：import { a, b as c } from 'x'
    const brace = clause.match(/\{([\s\S]*?)\}/)
    if (brace != null) {
      for (const part of brace[1].split(',')) {
        const t = part.trim()
        if (t === '') continue
        const asMatch = t.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
        names.add(asMatch != null ? asMatch[1] : t)
      }
    }
    // 默认导入 / 命名空间导入：import Foo from 'x'  /  import * as Foo from 'x'
    const head = clause.replace(/\{[\s\S]*?\}/, '').replace(/,\s*$/, '').trim()
    if (head !== '') {
      const ns = head.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
      if (ns != null) names.add(ns[1])
      else for (const p of head.split(',')) { const t = p.trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t) }
    }
  }
  return names
}

/** 本文件自己声明的名字（函数/常量/类/类型/解构） */
function collectDeclared(src) {
  const names = new Set()
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\binterface\s+([A-Za-z_$][\w$]*)/g,
    /\btype\s+([A-Za-z_$][\w$]*)/g,
    /\benum\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s*\{([^}]*)\}/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(src)) != null) {
      if (m[1].indexOf('{') >= 0 || m[1].indexOf(',') >= 0) {
        for (const p of m[1].split(',')) {
          const t = p.split(':').pop().trim()
          if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t)
        }
      } else names.add(m[1])
    }
  }
  // defineProps / defineEmits 泛型里的字段名不算，跳过即可
  return names
}

/**
 * 抹掉注释与字符串字面量的**内容**（换成等长空格，保留换行 ⇒ 行号不变）。
 * 目的：注释/文案里写成 `foo()` 不该被判成「调用未 import」。
 * 模板串里 `${...}` 的插值内部**保留**（那里的调用是真实代码）。
 */
function stripCommentsAndStrings(src) {
  const out = src.split('')
  const n = src.length
  let i = 0
  let state = 'code' // code | line | block | sq | dq | tpl
  let tplDepth = 0 // 模板串 ${} 的括号深度
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (state === 'code') {
      if (c === '/' && next === '/') { out[i] = ' '; out[i + 1] = ' '; state = 'line'; i += 2; continue }
      if (c === '/' && next === '*') { out[i] = ' '; out[i + 1] = ' '; state = 'block'; i += 2; continue }
      if (c === "'") { out[i] = ' '; state = 'sq'; i++; continue }
      if (c === '"') { out[i] = ' '; state = 'dq'; i++; continue }
      if (c === '`') { out[i] = ' '; state = 'tpl'; tplDepth = 0; i++; continue }
      if (c === '}' && tplDepth > 0) tplDepth--
      i++; continue
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; i++; continue }
      out[i] = ' '; i++; continue
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { out[i] = ' '; out[i + 1] = ' '; state = 'code'; i += 2; continue }
      if (c !== '\n') out[i] = ' '
      i++; continue
    }
    if (state === 'tpl') {
      if (c === '\\') { out[i] = ' '; if (i + 1 < n && src[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue }
      if (c === '$' && next === '{') { out[i] = ' '; out[i + 1] = ' '; state = 'code'; tplDepth = 1; i += 2; continue }
      if (c === '`') { out[i] = ' '; state = 'code'; i++; continue }
      if (c !== '\n') out[i] = ' '
      i++; continue
    }
    // sq / dq
    if (c === '\\') { out[i] = ' '; if (i + 1 < n && src[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"')) { out[i] = ' '; state = 'code'; i++; continue }
    if (c !== '\n') out[i] = ' '
    i++; continue
  }
  return out.join('')
}

/** 收集本项目所有 export 出来的名字 → 定义在哪个文件 */
const exportTable = new Map()
for (const f of files) {
  let src
  try { src = fs.readFileSync(f, 'utf8') } catch (e) { continue }
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  const re = /\bexport\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
  let m
  while ((m = re.exec(src)) != null) {
    if (!exportTable.has(m[1])) exportTable.set(m[1], [])
    exportTable.get(m[1]).push(rel)
  }
  // export { a, b as c }
  const re2 = /\bexport\s*\{([^}]*)\}/g
  while ((m = re2.exec(src)) != null) {
    for (const part of m[1].split(',')) {
      const t = part.trim()
      if (t === '') continue
      const asMatch = t.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
      const name = asMatch != null ? asMatch[1] : t
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue
      if (!exportTable.has(name)) exportTable.set(name, [])
      exportTable.get(name).push(rel)
    }
  }
}

const problems = []

for (const f of files) {
  let src
  try { src = fs.readFileSync(f, 'utf8') } catch (e) { continue }
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  const imported = collectImported(src)
  const declared = collectDeclared(src)

  // 扫描体：先抹注释/字符串，再挖掉 import 行与函数声明头，避免把 import 里的名字/声明当调用
  const body = stripCommentsAndStrings(src)
    .replace(/^\s*import\b.*$/gm, '')
    .replace(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g, 'function_(')
    .replace(/^\s*export\s*\{[^}]*\}\s*$/gm, '')

  const callRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g
  let m
  const seen = new Set()
  while ((m = callRe.exec(body)) != null) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    if (imported.has(name) || declared.has(name)) continue
    if (!exportTable.has(name)) continue            // 不是本项目导出 ⇒ 内置/框架，放过
    const owners = exportTable.get(name)
    if (owners.length === 1 && owners[0] === rel) continue  // 就是本文件导出的
    problems.push({ file: rel, name, owners })
  }
}

if (problems.length === 0) {
  console.log('[PASS] missing-import gate — 没有「调用项目导出函数但未 import」的文件')
  process.exit(0)
}

console.log('[FAIL] 以下文件调用了项目里 export 的函数，却没有 import：')
for (const p of problems) {
  console.log(`  ${p.file}`)
  console.log(`      函数 ${p.name}()  定义在: ${p.owners.join(', ')}`)
}
console.log(`\n共 ${problems.length} 处。补上 import 即可（真机上会抛 ReferenceError，但编译与其它门禁都不会报）。`)
process.exit(1)
