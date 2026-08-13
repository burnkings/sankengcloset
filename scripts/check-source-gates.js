#!/usr/bin/env node
/**
 * check-source-gates.js — V3 源码门禁
 *
 * 1. 禁止运行代码（pages/ components/ stores/ services/ theme/）引用已删除的 components/v2
 * 2. 检查主题相关 n.value 是否被写入非响应式常量（const xxx = { color/backgroundColor/...: n.value.xxx }）
 * 3. 检查 pages.json 全部路由与 TabBar 图标文件存在
 *
 * 用法：node scripts/check-source-gates.js
 * exit 0 = 通过；1 = 存在违规。
 */
const fs = require('fs')
const path = require('path')

let failed = false
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed = true }

// ---------- 1. components/v2 引用禁令 ----------
// 只检查运行代码：先剥离 // 与 /* */ 注释，避免历史说明性文字误报
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}
const v2NameRe = /components\/v2\//g
const v2Components = ['V2PageHeader', 'V2SectionHeader', 'V2CapsuleFilter', 'V2Segmented', 'V2FormSection', 'V2DatePicker', 'V2ProductCard', 'V2StatsCard', 'V2StatusChip', 'V2ListGroup', 'V2ListRow', 'V2HorizontalTabs', 'V2Switch', 'V2NoteCard', 'V2ReleaseCard', 'V2EditorialCard']
const srcDirs = ['pages', 'components', 'stores', 'services', 'theme', 'domain', 'presentation', 'utils', 'config']
function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.(uvue|uts|vue|js|ts)$/.test(entry.name)) out.push(p)
  }
  return out
}
for (const dir of srcDirs) {
  for (const file of walk(dir)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'))
    if (v2NameRe.test(src)) fail(`${file} 仍引用 components/v2`)
    for (const comp of v2Components) {
      if (new RegExp(`\\b${comp}\\b`).test(src)) fail(`${file} 仍引用已删除组件 ${comp}`)
    }
  }
}

// ---------- 2. 主题 n.value 非响应式常量检查 ----------
const themeFieldRe = /\b(color|backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|shadowColor|tintColor|placeholderColor|frontColor)\s*:/
for (const dir of ['pages', 'components/v3']) {
  for (const file of walk(dir)) {
    if (!file.endsWith('.uvue')) continue
    const src = fs.readFileSync(file, 'utf8')
    // 匹配 const xxx = { ... } 对象字面量（含跨行）
    const constObjRe = /const\s+(\w+)\s*=\s*\{/g
    let m
    while ((m = constObjRe.exec(src)) !== null) {
      const start = m.index + m[0].length - 1 // 指向 {
      let depth = 1
      let i = start + 1
      while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        else if (c === '"' || c === "'") {
          const q = c
          i++
          while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
        }
        i++
      }
      const body = src.slice(start, i - 1)
      if (body.includes('n.value.') && themeFieldRe.test(body)) {
        fail(`${file}: const ${m[1]} 把 n.value 写死进非响应式常量（应改为 computed）`)
      }
    }
  }
}

// ---------- 3. pages.json 路由与 TabBar 图标检查 ----------
let pagesJson
try {
  let raw = fs.readFileSync('pages.json', 'utf8')
  raw = raw.replace(/\/\/ #if.*/g, '').replace(/\/\/ #endif/g, '')
  pagesJson = JSON.parse(raw)
} catch (e) {
  fail(`pages.json 解析失败: ${e.message}`)
  process.exit(1)
}
for (const page of pagesJson.pages || []) {
  const js = path.join('unpackage', 'dist', 'dev', 'mp-weixin', `${page.path}.js`)
  // 源码路由文件必须存在（.uvue 页面）
  const srcUvue = path.join(...page.path.split('/')) + '.uvue'
  if (!fs.existsSync(srcUvue)) fail(`pages.json 路由 ${page.path} 对应源码 ${srcUvue} 不存在`)
  void js
}
const tabBar = pagesJson.tabBar
if (tabBar && Array.isArray(tabBar.list)) {
  for (const item of tabBar.list) {
    const srcPage = path.join(...item.pagePath.split('/')) + '.uvue'
    if (!fs.existsSync(srcPage)) fail(`TabBar pagePath ${item.pagePath} 对应源码不存在`)
    for (const iconKey of ['iconPath', 'selectedIconPath']) {
      const icon = item[iconKey]
      if (icon && !fs.existsSync(icon)) fail(`TabBar 图标缺失: ${icon}（${item.pagePath}）`)
    }
  }
} else {
  fail('pages.json 缺少 tabBar 配置')
}

if (failed) process.exit(1)
console.log('[PASS] V3 source gates — no components/v2 refs, theme tokens reactive, pages.json routes & tabbar icons exist')
