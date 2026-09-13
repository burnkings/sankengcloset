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
/** JSONC → JSON：剥离 // 行注释（感知字符串与转义，避免误删路径内 //） */
function stripJsonComments(src) {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += ch
  }
  return out
}
let pagesJson
try {
  let raw = fs.readFileSync('pages.json', 'utf8')
  raw = stripJsonComments(raw).replace(/\/\/ #if.*/g, '').replace(/\/\/ #endif/g, '')
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

// ---------- 4. 审计回归门禁 ----------
// 4.1 正则字面量中的双重转义 \d（商品链接 ID 提取失效回归）
for (const dir of ['pages', 'components', 'stores', 'services', 'utils', 'domain']) {
  for (const file of walk(dir)) {
    if (!file.endsWith('.uts') && !file.endsWith('.uvue')) continue
    const src = fs.readFileSync(file, 'utf8')
    if (/\/[^/\n]*\\\\d/.test(src)) fail(`${file} 正则字面量含双重转义 \\\\d（应写 \\d）`)
  }
}

// 4.2 法律文本占位符扫描（发布前必须由运营填值；开发期警告不阻断，发布门禁用 LEGAL_RELEASE 变量强制）
for (const file of walk('pages')) {
  if (!file.endsWith('.uts') && !file.endsWith('.uvue')) continue
  const src = fs.readFileSync(file, 'utf8')
  if (/\[[^\]]*占位[^\]]*\]/.test(src)) {
    if (process.env.LEGAL_RELEASE === '1') fail(`${file} 含未替换占位符（[xxx占位]）`)
    else console.warn(`[WARN] ${file} 含未替换占位符（[xxx占位]）——运营填值后发布`)
  }
}
const legalSrc = fs.readFileSync('pages/about/legal-content.uts', 'utf8')
if (legalSrc.includes("'待运营补充'")) {
  if (process.env.LEGAL_RELEASE === '1') fail('pages/about/legal-content.uts 运营信息常量仍为「待运营补充」，发布前需由运营填值')
  else console.warn('[WARN] pages/about/legal-content.uts 运营信息常量仍为「待运营补充」——运营填值后发布（发布门禁：LEGAL_RELEASE=1 时强制拒绝）')
}

// 4.3 manifest urlCheck 断言（发布必须开启合法域名校验）
const manifestRaw = fs.readFileSync('manifest.json', 'utf8')
if (/"urlCheck"\s*:\s*false/.test(manifestRaw)) fail('manifest.json mp-weixin urlCheck 必须为 true（发布配置）')

// 4.4 页面 navigateTo 跳 tabBar 路径扫描（tabBar 页只能 switchTab）
if (tabBar && Array.isArray(tabBar.list)) {
  const tabPaths = tabBar.list.map((item) => item.pagePath)
  for (const file of walk('pages')) {
    if (!file.endsWith('.uvue')) continue
    const src = stripComments(fs.readFileSync(file, 'utf8'))
    for (const tp of tabPaths) {
      if (new RegExp(`navigateTo\\(\\{[^}]*url:[^}]*['"]\/${tp}['"]`).test(src)) {
        fail(`${file} 使用 navigateTo 跳转 tabBar 页 /${tp}（应使用 switchTab）`)
      }
    }
  }
}

if (failed) process.exit(1)
console.log('[PASS] audit regression gates — no double-escape regex, no legal placeholders, urlCheck on, no navigateTo-to-tabBar')

// ---------- 5. uvue 模板绑定门禁（防 pitChip / scroll-x 类运行时崩溃）----------
// 背景：pages/product/detail.uvue 曾把 13 个未定义的样式名写进模板（pitChip 等），
// 编译通过但运行到该节点即 ReferenceError 并导致 App 崩溃；同类问题必须在此拦截。

/** 拆出 .uvue 的模板段与脚本段 */
function splitUvue(src) {
  const i = src.indexOf('<script setup')
  if (i < 0) return null
  const tpl = src.slice(0, i)
  const rest = src.slice(i)
  const j = rest.indexOf('</script>')
  return { tpl, script: j > 0 ? rest.slice(0, j) : rest }
}

/** 脚本段中所有可见的顶层标识符（声明 + import） */
function scriptIdentifiers(script) {
  const names = new Set()
  for (const m of script.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of script.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name.trim())
    }
  }
  for (const m of script.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1])
  return names
}

for (const dir of ['pages', 'components']) {
  for (const file of walk(dir)) {
    if (!file.endsWith('.uvue')) continue
    const parts = splitUvue(fs.readFileSync(file, 'utf8'))
    if (parts == null) continue
    const names = scriptIdentifiers(parts.script)

    // 5.1 模板 :style="裸标识符" 必须在脚本中声明
    for (const m of parts.tpl.matchAll(/:(?:style|placeholder-style|indicator-style)\s*=\s*"\s*([A-Za-z_$][\w$]*)\s*"/g)) {
      if (!names.has(m[1])) fail(`${file} 模板引用了未定义的样式/变量 "${m[1]}"（运行到该节点会 ReferenceError）`)
    }

    // 5.2 scroll-view 的 scroll-x / scroll-y：App 端不支持，应使用 direction="horizontal"（滚动方向）
    //     #ifdef MP-WEIXIN 区块内的小程序输出仍可用 scroll-y，跳过该区间
    const rawLines = fs.readFileSync(file, 'utf8').split('\n')
    let inMpOnly = 0
    for (let li = 0; li < rawLines.length; li++) {
      const line = rawLines[li]
      if (/#ifdef\s+MP-WEIXIN/.test(line)) { inMpOnly++; continue }
      if (/#endif/.test(line) && inMpOnly > 0) { inMpOnly--; continue }
      if (inMpOnly > 0) continue
      const hit = line.match(/<scroll-view[^>]*\s(scroll-x|scroll-y)\b/)
      if (hit != null) fail(`${file}:${li + 1} <scroll-view> 不支持属性 ${hit[1]}（App 端请用 direction="horizontal"）`)
    }

    // 5.3 text 行数控制：属性 :lines 与样式 maxLines 均无效，统一用 style.lines
    for (const m of parts.tpl.matchAll(/<text[^>]*\s:lines\s*=/g)) {
      fail(`${file} <text> 不支持属性 :lines（应写入 :style 的 lines 字段）`)
    }
    for (const m of parts.script.matchAll(/\bmaxLines\s*:/g)) {
      fail(`${file} 样式 maxLines 在 uni-app x 无效（应使用 lines）`)
    }

    // 5.4 import 进来的绑定必须被用到
    //     反向价值：只 import 却忘了声明/调用（如 reminder/edit 漏写 const library、页面漏调 initPageTheme）
    //     会被这条规则当场拦下，避免运行到该节点才 ReferenceError。
    const whole = rawLines.join('\n')
    const withoutImports = whole.replace(/^import[^\n]*\n/gm, '')
    for (const m of whole.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from/gm)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim()
        if (name === '') continue
        if (!new RegExp(`\\b${name}\\b`).test(withoutImports)) {
          fail(`${file} import 了 ${name} 但全文未使用（多为漏写声明/漏调初始化）`)
        }
      }
    }

    // 5.5 提示必须有宿主：showFeedback 依赖 <AppFeedbackToast /> 渲染（当前挂在 MainLayout/DetailLayout 里）。
    //     页面既不使用这两个布局、也不自挂 toast 时，所有「已保存/已提交」提示都会静默失效。
    if (/showFeedback\s*\(/.test(parts.script)) {
      if (!/<(MainLayout|DetailLayout|AppFeedbackToast)\b/.test(parts.tpl)) {
        fail(`${file} 调用了 showFeedback 但没有提示宿主（需使用 MainLayout / DetailLayout 或自挂 <AppFeedbackToast />）`)
      }
    }
  }
}

if (failed) process.exit(1)
console.log('[PASS] uvue binding gates — template styles declared, no scroll-x/scroll-y on scroll-view, no :lines attribute / maxLines style')

