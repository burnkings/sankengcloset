#!/usr/bin/env node
/**
 * check-pages-parity.js —— pages.json 双清单一致性 + 分包规则守护
 *
 * 背景
 * ----
 * 2026-09-28 做小程序分包时，pages.json 变成了「一份文件、两份清单」：
 *   · 小程序端（MP-WEIXIN）：主包只留 tabBar 页 + 少数必须首屏可用的页，其余下沉 subPackages
 *   · 非小程序端（App / H5） ：subPackages 被条件编译剥掉，所以顶层 pages 必须列全
 * 两份清单一旦不同步，后果是**静默的**：
 *   · 少列 → App 端 navigateTo 打开空白页；小程序端页面打开报「页面不存在」
 *   · 多列 → 小程序主包没瘦下来（分包白做），体积又回到 1.5MB 建议线之上
 * 所以必须有机检，不能靠人眼。
 *
 * 本脚本做三件事
 * --------------
 * 1. 按平台分别展开 `// #ifdef/#ifndef/#endif`，对**每个分支**独立 JSON.parse。
 *    这一步本身就守住了那个「孤零零的逗号」—— 逗号放错位置会直接让某个分支尾逗号报错。
 * 2. 校验两份清单等价：MP 主包 ∪ MP 分包 ≡ 非 MP 顶层 pages。
 * 3. 校验微信分包硬规则：tabBar 页必须在主包、同目录不得跨包、root 唯一、
 *    preloadRule 指向真实分包、≤20 分包、页面源码 .uvue 存在。
 *
 * 用法：node scripts/check-pages-parity.js
 * 退出码：0 = 通过；1 = 违规（printed [FAIL] 行）
 */
const fs = require('fs')
const path = require('path')

// 不自证 cwd：构建脚本可能从任意目录调起，统一钉回仓库根（pages.json 与 pages/** 都按根解析）。
process.chdir(path.resolve(__dirname, '..'))

let failed = false
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed = true }
const info = (msg) => console.log(`      ${msg}`)

const PAGES_JSON = 'pages.json'
const raw = fs.readFileSync(PAGES_JSON, 'utf8')

// ---------------------------------------------------------------- 条件编译展开
/**
 * 展开条件编译，只保留目标平台可见的内容。
 * 支持 // #ifdef X[,Y] / // #ifndef X / // #endif，可嵌套。
 * 条件行本身被删除（不产生空行，便于报错定位）。
 */
function expand(src, platform) {
  // ⚠️ 必须按 /\r?\n/ 切：pages.json 是 CRLF，若只切 '\n'，行尾会留一个 '\r'，
  //    而 `(.*)$` 里的 `.` 不匹配 '\r' ⇒ 带平台名的 #ifdef/#ifndef 行匹配不到（#endif 因尾部为空反而能匹配）。
  //    症状是「所有 #endif 都报多余、条件块根本没被剥掉」。
  const lines = src.split(/\r?\n/)
  const out = []
  // 每层：{ visible: boolean }，visible 为 false 时整块丢弃
  const stack = []
  const topVisible = () => stack.every((f) => f.visible)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = /^\s*\/\/\s*#\s*(ifdef|ifndef|endif)\b\s*(.*)$/.exec(line)
    if (m != null) {
      const kind = m[1]
      if (kind === 'endif') {
        if (stack.length === 0) fail(`${PAGES_JSON}:${i + 1} 出现多余的 // #endif（没有对应的 #ifdef/#ifndef）`)
        else stack.pop()
        continue
      }
      const platforms = m[2].split(',').map((s) => s.trim()).filter((s) => s !== '')
      if (platforms.length === 0) fail(`${PAGES_JSON}:${i + 1} // #${kind} 缺少平台名`)
      const hit = platforms.indexOf(platform) >= 0
      // 外层已经不可见时，内层一律不可见（保持栈配对，不能直接 continue）
      stack.push({ visible: topVisible() && (kind === 'ifdef' ? hit : !hit) })
      continue
    }
    if (topVisible()) out.push(line)
  }
  if (stack.length !== 0) fail(`${PAGES_JSON} // #ifdef/#ifndef 与 // #endif 数量不配对（栈剩余 ${stack.length} 层）`)
  return out.join('\n')
}

/** JSONC → JSON：剥离 // 行注释（感知字符串与转义，避免误删 URL 里的 //） */
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

function parseFor(platform) {
  const expanded = expand(raw, platform)
  const json = stripJsonComments(expanded)
  try {
    return JSON.parse(json)
  } catch (e) {
    fail(`${PAGES_JSON} 在 ${platform} 分支展开后不是合法 JSON：${e.message}`)
    const lines = json.split('\n')
    // 尾逗号是最常见的坑，直接点名可疑行
    lines.forEach((l, i) => {
      if (/,\s*$/.test(l) && /^\s*[\]}]/.test(lines[i + 1] || '')) {
        console.error(`      可疑行 ${i + 1}: ${l.trim()}`)
      }
    })
    return null
  }
}

const mp = parseFor('MP-WEIXIN')
const app = parseFor('APP')
if (mp == null || app == null) {
  console.error('\n[FAIL] pages.json 条件编译分支展开失败，后续校验跳过')
  process.exit(1)
}

// ---------------------------------------------------------------- 采集
const norm = (s) => String(s).replace(/^\/+/, '').replace(/\/+$/, '')

const appPages = (app.pages || []).map((p) => norm(p.path))
const mpMain = (mp.pages || []).map((p) => norm(p.path))

const mpSub = []
const seenRoot = new Map()
for (const pkg of mp.subPackages || mp.subpackages || []) {
  const root = norm(pkg.root)
  const name = pkg.name
  if (root === '') { fail(`subPackages「${name}」root 为空`); continue }
  if (seenRoot.has(root)) fail(`subPackages 出现重复 root：${root}（${seenRoot.get(root)} 与 ${name}）`)
  else seenRoot.set(root, name)
  for (const pg of pkg.pages || []) {
    const full = `${root}/${norm(pg.path)}`
    mpSub.push({ full, root, name })
  }
}

const mpAll = mpMain.concat(mpSub.map((s) => s.full))

// ---------------------------------------------------------------- 1. 两清单等价
const appSet = new Set(appPages)
const mpSet = new Set(mpAll)

for (const p of appPages) {
  if (!mpSet.has(p)) fail(`非小程序端列了 ${p}，但小程序端（主包+分包）里没有 —— 小程序端打开该页会报「页面不存在」`)
}
for (const p of mpAll) {
  if (!appSet.has(p)) fail(`小程序端列了 ${p}，但非小程序端（App/H5）顶层 pages 里没有 —— App 端该页会丢`)
}
// 同一路径不得既在主包又在分包
const mainSet = new Set(mpMain)
for (const s of mpSub) {
  if (mainSet.has(s.full)) fail(`页面 ${s.full} 同时出现在主包与分包「${s.name}」中`)
}
// 重复项
for (const [label, list] of [['非小程序端 pages', appPages], ['小程序端 pages', mpMain]]) {
  const seen = new Set()
  for (const p of list) {
    if (seen.has(p)) fail(`${label} 中 ${p} 重复出现`)
    seen.add(p)
  }
}

// ---------------------------------------------------------------- 2. 微信分包硬规则
const MAX_SUBPACKAGES = 20
const subPkgCount = (mp.subPackages || []).length
if (subPkgCount > MAX_SUBPACKAGES) fail(`subPackages 数量 ${subPkgCount} 超过微信上限 ${MAX_SUBPACKAGES}`)

// 2.1 tabBar 页必须在主包（微信硬规则）
const tabList = (mp.tabBar && mp.tabBar.list) || []
const tabPaths = tabList.map((t) => norm(t.pagePath))
for (const tp of tabPaths) {
  if (!mainSet.has(tp)) fail(`tabBar 页 ${tp} 不在主包 —— 微信要求 tabBar 页必须在主包（也会导致分包无法按目录切分）`)
}

// 2.2 同目录不得跨包：某个已分包的 root，不能被主包里的任何页面包含
for (const root of seenRoot.keys()) {
  for (const p of mpMain) {
    if (p.startsWith(root + '/')) {
      fail(`主包页面 ${p} 落在分包 root「${seenRoot.get(root)}」(${root}) 目录下 —— 微信要求一个目录不能一半主包一半分包`)
    }
  }
}
// 2.3 分包之间不得互相包含（root 嵌套）
for (const a of seenRoot.keys()) {
  for (const b of seenRoot.keys()) {
    if (a !== b && b.startsWith(a + '/')) fail(`分包 root 嵌套：${b} 位于 ${a} 之内`)
  }
}

// 2.4 preloadRule 指向真实存在（微信接受 root 或 name）
const preload = mp.preloadRule || {}
const knownPkgRefs = new Set([...seenRoot.keys(), ...seenRoot.values()])
for (const [page, rule] of Object.entries(preload)) {
  if (!mainSet.has(norm(page))) fail(`preloadRule 的 key ${page} 不是主包页面（微信只允许主包页声明预下载）`)
  if (rule == null || !Array.isArray(rule.packages)) { fail(`preloadRule["${page}"] 缺少 packages 数组`); continue }
  for (const ref of rule.packages) {
    if (!knownPkgRefs.has(norm(ref))) fail(`preloadRule["${page}"] 指向不存在的分包 ${ref}`)
  }
  if (rule.network === 'all') {
    console.warn(`[WARN] preloadRule["${page}"] 用 network:"all" —— 若非启动页请改 wifi，否则首屏下载量会被加回去`)
  }
}
// 2.5 分包页不得带 App 端专用字段（微信会报「无效的 page.json」）
//     必须先剥注释 —— pages.json 里到处是「swipeBackAsBackPress 是 App 端专用字段…」这类说明文字，
//     直接找字符串会把注释当违规，误报。
const mpExpanded = stripJsonComments(expand(raw, 'MP-WEIXIN'))
if (/swipeBackAsBackPress/.test(mpExpanded)) {
  fail(`${PAGES_JSON} 小程序分支里仍存在 swipeBackAsBackPress（App 端专用字段，微信报「无效的 page.json」）—— 需用 // #ifdef APP 隔离`)
}

// ---------------------------------------------------------------- 3. 源码文件存在
for (const p of new Set(mpAll)) {
  const src = `${p}.uvue`
  if (!fs.existsSync(src)) fail(`路由 ${p} 对应源码 ${src} 不存在`)
}

// ---------------------------------------------------------------- 4. 产物端到端校验（可选）
// 静态清单对得上，不代表编译产物对得上：subPackages 是在 // #ifdef MP-WEIXIN 里的，
// 一旦条件编译被吞 / 被写错平台名，源码两份清单照样「自洽」，产物却整块塌回主包。
// 所以编译后用 `node scripts/check-pages-parity.js <distRoot>` 再核一次产物 app.json。
const distArg = process.argv[2]
let distReport = null
if (distArg) {
  const appJsonPath = path.join(distArg, 'app.json')
  if (!fs.existsSync(appJsonPath)) {
    fail(`产物 app.json 不存在：${appJsonPath}`)
  } else {
    let art
    try {
      art = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
    } catch (e) {
      fail(`产物 app.json 不是合法 JSON：${e.message}`)
      art = null
    }
    if (art != null) {
      const artPages = (art.pages || []).map(norm)
      const artRoots = (art.subPackages || art.subpackages || []).map((p) => norm(p.root))
      const artSet = new Set(artPages)

      for (const p of mpMain) {
        if (!artSet.has(p)) fail(`产物 app.json 主包缺少页面 ${p}（源码 pages.json 里有）`)
      }
      for (const p of artPages) {
        if (!mainSet.has(p) && !mpSub.some((s) => s.full === p)) {
          fail(`产物 app.json 出现源码里没有的页面 ${p}`)
        }
        if (!mainSet.has(p)) fail(`产物 app.json 把分包页 ${p} 放进了主包 —— 分包没生效（多为条件编译被吞）`)
      }
      for (const root of seenRoot.keys()) {
        if (artRoots.indexOf(root) < 0) fail(`产物 app.json 缺少分包 root「${seenRoot.get(root)}」(${root})`)
      }
      for (const root of artRoots) {
        if (!seenRoot.has(root)) fail(`产物 app.json 多出源码里没有的分包 root：${root}`)
      }
      // 微信会因为 App 端专用字段直接报「无效的 page.json」，产物里必须一个都没有
      const artRaw = JSON.stringify(art)
      if (/swipeBackAsBackPress/.test(artRaw)) {
        fail('产物 app.json 的页面样式里仍含 swipeBackAsBackPress —— 微信会报「无效的 page.json」')
      }

      // 磁盘口径体积估算（微信上传口径 ≈ 原始字节 × 1.42，见 MEMORY A1b）
      const subRootAbs = [...seenRoot.keys()].map((r) => path.join(distArg, ...r.split('/')))
      let subBytes = 0
      for (const abs of subRootAbs) subBytes += dirBytes(abs)
      let totalBytes = 0
      for (const f of walkAll(distArg)) totalBytes += f.size
      const mainBytes = totalBytes - subBytes
      distReport = { distArg, artPages: artPages.length, artRoots: artRoots.length, totalBytes, mainBytes, subBytes }
    }
  }
}

function walkAll(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walkAll(p, out)
    else out.push({ path: p, size: fs.statSync(p).size })
  }
  return out
}
function dirBytes(dir) {
  let n = 0
  for (const f of walkAll(dir)) n += f.size
  return n
}

// ---------------------------------------------------------------- 汇总
if (failed) {
  console.error('\n[FAIL] pages.json 双清单/分包规则校验未通过')
  process.exit(1)
}

console.log('[PASS] pages-parity — 双清单等价，微信分包规则全绿')
info(`非小程序端顶层 pages：${appPages.length} 条（subPackages 分支已剥除）`)
info(`小程序端：主包 ${mpMain.length} 条 — ${mpMain.join(', ')}`)
info(`小程序端：分包 ${subPkgCount} 个 / ${mpSub.length} 页（上限 ${MAX_SUBPACKAGES}）`)
info(`tabBar ${tabPaths.length} 页全部在主包；preloadRule ${Object.keys(preload).length} 条指向真实分包`)
if (distReport != null) {
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  info(`产物 ${distReport.distArg}：主包 ${distReport.artPages} 页 / 分包 ${distReport.artRoots} 个`)
  info(`产物磁盘口径：总计 ${kb(distReport.totalBytes)}，其中分包 ${kb(distReport.subBytes)}，主包 ≈ ${kb(distReport.mainBytes)}`)
  info(`主包微信上传口径 ≈ ${kb(distReport.mainBytes * 1.42)}（硬限 2048 KB / 建议线 1536 KB）`)
}
