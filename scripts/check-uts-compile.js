#!/usr/bin/env node

/**
 * check-uts-compile.js — 编译产物结构校验（V3）
 *
 * 检查 HBuilderX mp-weixin 编译输出：
 *   1. 当前 V3 页面与组件编译产物必须存在（29 页面 + v3 组件，不含已删除的 v2）
 *   2. 产物内 require 路径全部可解析（无 broken require）
 *   3. stores/home-feed-store.js 以 reactive 模块级单例编译产出（不再要求 defineStore）
 *
 * 用法：node scripts/check-uts-compile.js [dist-directory]
 * 默认路径 unpackage/dist/dev/mp-weixin；传参可指向 build/mp-weixin。
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || 'unpackage/dist/dev/mp-weixin')

// V3 当前页面路由（pages.json 26 个页面）
const pages = [
  'pages/home/index',
  'pages/discover/index',
  'pages/favorites/index',
  'pages/community/index',
  'pages/community/mine',
  'pages/profile/index',
  'pages/notification/index',
  'pages/search/index',
  'pages/share/create',
  'pages/product/detail',
  'pages/wardrobe/index',
  'pages/wardrobe/edit',
  'pages/budget/index',
  'pages/purchase/index',
  'pages/purchase/detail',
  'pages/purchase/edit',
  'pages/purchase/import',
  'pages/reminder/index',
  'pages/reminder/edit',
  'pages/editorial/detail',
  'pages/preferences/index',
  'pages/preferences/appearance',
  'pages/preferences/notification',
  'pages/about/index',
  'pages/about/legal',
]

// V3 核心组件（当前被页面引用；components/v2 已删除，不再检查）
const components = [
  'components/layout/MainLayout',
  'components/layout/DetailLayout',
  'components/base/AppImage',
  'components/base/AppIcon',
  'components/v3/ProductCard',
  'components/v3/ReleaseCard',
  'components/v3/EditorialCard',
  'components/v3/NoteCard',
  'components/v3/ChannelTabs',
  'components/v3/FormSection',
  'components/v3/SegmentedControl',
  'components/v3/DateField',
  'components/v3/FilterChips',
  'components/v3/ListGroup',
  'components/v3/ListRow',
  'components/v3/PageHeader',
  'components/v3/PageState',
  'components/v3/SectionHeader',
  'components/v3/StatusChip',
  'components/v3/SummaryStrip',
  'components/v3/AppSwitch',
  'components/v3/FeedSkeleton',
]

const requiredFiles = ['app.js', 'app.json', 'common/vendor.js']
for (const p of pages) requiredFiles.push(`${p}.js`)
for (const c of components) requiredFiles.push(`${c}.js`)

const failures = []

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) failures.push(`missing compiled file: ${relativePath}`)
}

// 已删除组件产物禁止出现（防旧产物残留）
const deletedV2Markers = ['components/v2']
for (const marker of deletedV2Markers) {
  if (fs.existsSync(path.join(root, marker))) failures.push(`stale deleted component output still present: ${marker}`)
}

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolutePath))
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolutePath)
  }
  return files
}

if (fs.existsSync(root)) {
  const requirePattern = /require\(["']([^"']+)["']\)/g
  for (const file of walk(root)) {
    const source = fs.readFileSync(file, 'utf8')
    let match
    while ((match = requirePattern.exec(source)) !== null) {
      if (!match[1].startsWith('.')) continue
      const target = path.resolve(path.dirname(file), match[1])
      const candidates = [target, `${target}.js`, path.join(target, 'index.js')]
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        failures.push(`broken require: ${path.relative(root, file)} -> ${match[1]}`)
      }
    }
  }
}

// V3: home-feed-store 必须为 reactive 模块级单例（不允许 defineStore 形态）
const homeStorePath = path.join(root, 'stores/home-feed-store.js')
if (fs.existsSync(homeStorePath)) {
  const src = fs.readFileSync(homeStorePath, 'utf8')
  if (!src.includes('reactive')) failures.push('home store reactive singleton binding is missing')
  if (src.includes('defineStore(')) failures.push('home store must not use defineStore (V3 stores are reactive singletons)')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`)
  process.exit(1)
}

console.log(`[OK] compiled files and require paths verified: ${root}`)
